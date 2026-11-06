import type { StudentListItem, StudentListQuery } from "@space/shared";

import { db } from "../../../db/client";
import type { Prisma } from "../../../generated/prisma/client";
import type { SessionUser } from "../../auth/tokens";
import { staffRosterWhere } from "../../permissions";
import { canReadAllStudents, isMentor, isSuper } from "../../rbac";
import { currentSeasonEnrollmentSelect } from "./current-season";
import { currentMembershipSelect, studentIdsWithCurrentGroup } from "./current-group";

export interface StudentListResult {
  students: StudentListItem[];
  nextCursor: number | null;
  total: number;
}

type StudentScope = { kind: "all" } | { kind: "ids"; ids: number[] };

/**
 * D6's single implementation of "which students may this caller see".
 *
 * SUPER and MENTOR read all (canReadAllStudents). ADMIN gets the distinct
 * students EVER enrolled in their seasons, regardless of enrollment status —
 * v1's semantics (R30/R31), kept: the list answers "ever mine", not
 * "currently mine". LEADER gets the distinct students whose ENROLLMENT names
 * one of their groups — ruling C9; v1's (unreachable — no leader list page
 * ever existed, R28) branch read GroupStudent instead, which (while that table
 * was global) forgot a leader's students the moment a later season
 * reassigned them.
 *
 * null = this caller has no student-list surface at all (STUDENT) → 403.
 */
async function studentListScope(user: SessionUser): Promise<StudentScope | null> {
  if (canReadAllStudents(user)) return { kind: "all" };
  if (user.role === "ADMIN") {
    if (user.seasonAdminIds.length === 0) return { kind: "ids", ids: [] };
    return { kind: "ids", ids: await enrolledStudentIds({ seasonId: { in: user.seasonAdminIds } }) };
  }
  if (user.role === "LEADER") {
    if (user.groupLeaderIds.length === 0) return { kind: "ids", ids: [] };
    return { kind: "ids", ids: await enrolledStudentIds({ groupId: { in: user.groupLeaderIds } }) };
  }
  return null;
}

/** The distinct students with an enrolment matching `where`, any status. */
async function enrolledStudentIds(where: Prisma.SeasonEnrollmentWhereInput): Promise<number[]> {
  const enrollments = await db.seasonEnrollment.findMany({
    where,
    select: { studentUserId: true },
    distinct: ["studentUserId"],
  });
  return enrollments.map((e) => e.studentUserId);
}

const emptyList = (): StudentListResult => ({ students: [], nextCursor: null, total: 0 });

function searchFilter(q: string | undefined): Prisma.UserWhereInput {
  if (!q) return {};
  return {
    OR: [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { studentProfile: { university: { contains: q, mode: "insensitive" } } },
    ],
  };
}

/**
 * The two per-row season facts, limited to the seasons this caller may read:
 * staff never see a group or a season they don't serve in, as with the detail.
 */
function currentFactsSelect(user: SessionUser) {
  const roster = staffRosterWhere(user) ?? {};
  return {
    seasonEnrollments: {
      ...currentSeasonEnrollmentSelect,
      where: { ...currentSeasonEnrollmentSelect.where, ...roster },
    },
    // Advisory current group — the one question GroupStudent may answer (C9).
    groupStudentMemberships: { ...currentMembershipSelect({ name: true }), where: roster },
  };
}

function listSelect(user: SessionUser) {
  return {
    id: true,
    name: true,
    email: true,
    avatarPath: true,
    graduationYear: true,
    studentProfile: {
      select: {
        university: true,
        faculty: true,
        universityGraduationYear: true,
      },
    },
    ...currentFactsSelect(user),
  } as const;
}

type ListRow = Prisma.UserGetPayload<{ select: ReturnType<typeof listSelect> }>;

function toListItem(u: ListRow): StudentListItem {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    avatarPath: u.avatarPath,
    university: u.studentProfile?.university ?? null,
    faculty: u.studentProfile?.faculty ?? null,
    universityGraduationYear: u.studentProfile?.universityGraduationYear ?? null,
    graduationYear: u.graduationYear,
    activeSeasonTitle: u.seasonEnrollments[0]?.season.title ?? null,
    currentGroupName: u.groupStudentMemberships[0]?.group.name ?? null,
    droppedEnrollment: null,
  };
}

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
    (a, b) =>
      sign * keyOf(a).localeCompare(keyOf(b)) ||
      (a.name ?? "").localeCompare(b.name ?? "") ||
      a.id - b.id,
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
    students: page.map(toListItem),
    nextCursor: start + query.limit < keyed.length ? (page[page.length - 1]?.id ?? null) : null,
    total: keyed.length,
  };
}

/** Returns null when the caller may not read this surface at all → 403. */
export async function listStudents(
  user: SessionUser,
  query: StudentListQuery,
): Promise<StudentListResult | null> {
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
      { role: "STUDENT", deletedAt: null },
      // R29/R38: graduationYear is the whole alumnus marker; the two lists
      // are the same table filtered on the same column.
      { graduationYear: query.status === "alumni" ? { not: null } : null },
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
    students: page.map(toListItem),
    nextCursor: rows.length > query.limit ? (page[page.length - 1]?.id ?? null) : null,
    total,
  };
}

/**
 * The dropped list is a list of ENROLLMENTS, not students (R43): its row key
 * is the enrollment id and a student dropped from three seasons appears three
 * times. SUPER and ADMIN only — v1's gate also admitted MENTOR but no mentor
 * page ever called it; as an endpoint that would hand every drop reason in
 * the database to read-all (spec 06 §4.3), so the surface narrows (§7).
 */
async function listDroppedEnrollments(
  user: SessionUser,
  query: StudentListQuery,
): Promise<StudentListResult | null> {
  if (!isSuper(user) && user.role !== "ADMIN") return null;
  if (user.role === "ADMIN" && user.seasonAdminIds.length === 0) return emptyList();

  const where: Prisma.SeasonEnrollmentWhereInput = {
    AND: [
      { status: "WITHDRAWN" },
      // D12: v1 filtered neither deletedAt nor role here, so a soft-deleted
      // student's name, email and drop reason stayed listed forever, with a
      // click-through that 404s.
      { studentUser: { role: "STUDENT", deletedAt: null, ...searchFilter(query.q) } },
      ...(user.role === "ADMIN" ? [{ seasonId: { in: user.seasonAdminIds } }] : []),
      ...(query.seasonId ? [{ seasonId: query.seasonId }] : []),
    ],
  };

  const [rows, total] = await Promise.all([
    db.seasonEnrollment.findMany({
      where,
      orderBy: [{ droppedAt: "desc" }, { id: "desc" }], // R46
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        seasonId: true,
        droppedAt: true,
        dropReason: true,
        season: { select: { title: true } },
        studentUser: { select: listSelect(user) },
      },
    }),
    db.seasonEnrollment.count({ where }),
  ]);

  const page = rows.slice(0, query.limit);
  return {
    students: page.map((r) => ({
      ...toListItem(r.studentUser),
      droppedEnrollment: {
        enrollmentId: r.id,
        seasonId: r.seasonId,
        seasonTitle: r.season.title,
        // Nullable on the contract: only dropEnrollment sets it today, but
        // nothing in the schema guarantees that (spec 06 §2's warning about
        // v1's non-null assertion at students-query.ts:196).
        droppedAt: r.droppedAt?.toISOString() ?? null,
        dropReason: r.dropReason,
      },
    })),
    nextCursor: rows.length > query.limit ? (page[page.length - 1]?.id ?? null) : null,
    total,
  };
}
