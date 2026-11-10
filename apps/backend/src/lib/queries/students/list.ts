import type { StudentListQuery } from "@space/shared";
import { db } from "../../../db/client";
import type { Prisma } from "../../../generated/prisma/client";
import type { SessionUser } from "../../auth/tokens";
import { staffRosterWhere } from "../../permissions";
import { isMentor, isSuper } from "../../rbac";
import { seasonParticipant } from "../season-participants";
import { studentIdsWithCurrentGroup } from "./current-group";
import { withLastSeason } from "./last-season";
import { absentLatelyStudentIds } from "./absent-lately";
import { liveUser } from "../../db/live";
import { studentListScope } from "./list-scope";
import {
  emptyList,
  searchFilter,
  currentFactsSelect,
  listSelect,
  toListItem,
  type StudentListResult,
} from "./list-row";
import { listDroppedEnrollments } from "./dropped";

export type { StudentListResult } from "./list-row";

/**
 * REG-82: v1's sort keys, server-side. `name` and the unsorted defaults are
 * plain column orders. The other three sort by a value on a related row, and
 * Prisma cannot place NULLs in a relation order — which matters, because v1
 * compared lowercased strings with a missing value as "" (first ascending,
 * last descending), the opposite of Postgres's default. Those keys are
 * therefore sorted in memory (below), exactly where v1 sorted them.
 */
function columnOrderBy(query: StudentListQuery): Prisma.UserOrderByWithRelationInput[] {
  if (query.sort === "name") return [{ name: query.dir }, { id: "asc" }];
  return query.status === "alumni"
    ? [{ graduationYear: "desc" }, { name: "asc" }, { id: "asc" }] // R40
    : [{ name: "asc" }, { id: "asc" }]; // R34's order, without its cap
}

type RelatedSort = "university" | "season" | "group";

function sortKeySelect(user: SessionUser) {
  return {
    id: true,
    name: true,
    studentProfile: { select: { university: true } },
    ...currentFactsSelect(user),
  } as const;
}

/** Every matching id in v1's order for a related-row sort key, then paged by id. */
async function listByRelatedSort(
  where: Prisma.UserWhereInput,
  sort: RelatedSort,
  dir: "asc" | "desc",
  query: StudentListQuery,
  user: SessionUser,
): Promise<StudentListResult> {
  const keyed = await db.user.findMany({ where, select: sortKeySelect(user) });
  const keyOf = (u: (typeof keyed)[number]): string =>
    (sort === "university"
      ? u.studentProfile?.university
      : sort === "season"
        ? u.seasonEnrollments[0]?.season.title
        : u.groupStudentMemberships[0]?.group.name
    )?.toLowerCase() ?? "";
  const sign = dir === "asc" ? 1 : -1;
  keyed.sort(
    (a, b) => sign * keyOf(a).localeCompare(keyOf(b)) || (a.name ?? "").localeCompare(b.name ?? "") || a.id - b.id,
  );

  const start = query.cursor === undefined ? 0 : keyed.findIndex((u) => u.id === query.cursor) + 1;
  const pageIds = keyed.slice(start, start + query.limit).map((u) => u.id);
  const rows = await db.user.findMany({ where: { id: { in: pageIds } }, select: listSelect(user) });
  const byId = new Map(rows.map((r) => [r.id, r] as const));
  const page = pageIds.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
  return {
    students: await withLastSeason(page.map(toListItem), user),
    nextCursor: start + query.limit < keyed.length ? (page[page.length - 1]?.id ?? null) : null,
    total: keyed.length,
  };
}

/**
 * R29/R38: graduationYear is the whole alumnus marker; the two global lists are
 * the same table filtered on the same column. A list of one season's people
 * (filtered to it or to one of its groups, or a staff member's own roster) also
 * holds the alumni who study in a community-wide season there. A regular season's graduates stay off.
 */
function graduationFilter(
  query: StudentListQuery,
  roster: Prisma.SeasonEnrollmentWhereInput | null,
): Prisma.UserWhereInput {
  if (query.status === "alumni") return { graduationYear: { not: null } };
  const group = typeof query.groupId === "number" ? query.groupId : null;
  if (!query.seasonId && !roster && group === null) return { graduationYear: null };
  const studying: Prisma.SeasonEnrollmentWhereInput = {
    AND: [
      // A season's own list shows any status (C9), dropped included; the roster-only branch lists participants.
      query.seasonId ? {} : seasonParticipant,
      { season: { isCommunityWide: true } },
      query.seasonId ? { seasonId: query.seasonId } : {},
      group !== null ? { groupId: group } : {},
      roster ?? {},
    ],
  };
  return { OR: [{ graduationYear: null }, { seasonEnrollments: { some: studying } }] };
}

/** Returns null when the caller may not read this surface at all → 403. */
export async function listStudents(user: SessionUser, query: StudentListQuery): Promise<StudentListResult | null> {
  if (query.status === "dropped") return listDroppedEnrollments(user, query);

  // Alumni surface: SUPER, ADMIN, MENTOR (spec 06 §4.1/§7). LEADER never had
  // one; as an endpoint the empty-scope convention would leak "you exist but
  // see nothing" — refuse instead (C8).
  if (query.status === "alumni" && !(isSuper(user) || isMentor(user) || user.role === "ADMIN")) {
    return null;
  }

  const scope = await studentListScope(user);
  if (scope === null) return null;
  if (scope.kind === "ids" && scope.ids.length === 0) return emptyList();

  const roster = staffRosterWhere(user);

  // AND-composed so the scope clause can never be overwritten by a filter —
  // the same discipline as the submissions queue (a disappearing scope clause
  // is a data leak, not a lost filter).
  const where: Prisma.UserWhereInput = {
    AND: [
      { role: "STUDENT", ...liveUser },
      graduationFilter(query, roster),
      ...(scope.kind === "ids" ? [{ id: { in: scope.ids } }] : []),
      // Season filter through enrollments, any status (C9). For staff, only on
      // their roster: a season they don't serve in finds nobody, rather than
      // telling them who was in it. AND, since a roster can itself name seasonId.
      ...(query.seasonId
        ? [{ seasonEnrollments: { some: { AND: [{ seasonId: query.seasonId }, roster ?? {}] } } }]
        : []),
      // REG-82: v1's group select filtered on the group the row displays, i.e.
      // the advisory current group; "none" is its "Unassigned". Both follow what
      // the row displays to this caller: staff's come from their roster alone.
      ...(query.groupId === undefined
        ? []
        : query.groupId === "none"
          ? [{ groupStudentMemberships: { none: roster ?? {} } }]
          : [{ id: { in: await studentIdsWithCurrentGroup(query.groupId, roster) } }]),
      searchFilter(query.q),
      // The mentor's "Absent lately" (owner, 2026-11-07); the route admits it for MENTOR only.
      ...(query.absentLately ? [{ id: { in: await absentLatelyStudentIds() } }] : []),
    ],
  };

  if (query.sort !== undefined && query.sort !== "name") {
    return listByRelatedSort(where, query.sort, query.dir, query, user);
  }
  const orderBy = columnOrderBy(query);

  const [rows, total] = await Promise.all([
    db.user.findMany({
      where,
      orderBy,
      take: query.limit + 1, // one extra row answers "is there another page"
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: listSelect(user),
    }),
    db.user.count({ where }),
  ]);

  const page = rows.slice(0, query.limit);
  return {
    students: await withLastSeason(page.map(toListItem), user),
    nextCursor: rows.length > query.limit ? (page[page.length - 1]?.id ?? null) : null,
    total,
  };
}
