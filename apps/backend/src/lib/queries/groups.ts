import { db } from "../../db/client";
import type { SessionUser } from "../auth/tokens";
import { isMentor, isSuper } from "../rbac";

export interface GroupListRow {
  id: number;
  name: string;
  description: string | null;
  studentCount: number;
  leaderNames: string[];
  seasonId: number;
  seasonCode: string;
  seasonTitle: string;
}

/**
 * How a caller's view of a season's groups is narrowed.
 *
 * A season admin and a super see every group. A leader sees the ones they lead
 * — v1 showed them all of them, which is a roster of other people's students
 * with a name and a headcount attached. A student sees their own.
 */
type GroupScope = { kind: "all" } | { kind: "ids"; groupIds: number[] };

async function scopeForSeason(user: SessionUser, seasonId: number): Promise<GroupScope | null> {
  if (isSuper(user) || isMentor(user)) return { kind: "all" };
  if (user.role === "ADMIN") {
    return user.seasonAdminIds.includes(seasonId) ? { kind: "all" } : null;
  }
  if (user.role === "LEADER") {
    const groups = await db.group.findMany({
      where: { seasonId, id: { in: user.groupLeaderIds } },
      select: { id: true },
    });
    return groups.length === 0 ? null : { kind: "ids", groupIds: groups.map((g) => g.id) };
  }
  if (user.role === "STUDENT") {
    // The student's group *in this season*, from the enrolment. Asking
    // GroupStudent instead answers "what group are they in now" — so a student
    // browsing a past season would be shown their current group if it happened
    // to belong to that season, and nothing otherwise (ruling C9).
    const enrollment = await db.seasonEnrollment.findUnique({
      where: { studentUserId_seasonId: { studentUserId: user.userId, seasonId } },
      select: { groupId: true },
    });
    return enrollment?.groupId == null ? null : { kind: "ids", groupIds: [enrollment.groupId] };
  }
  return null;
}

async function toListRows(
  groups: {
    id: number;
    name: string;
    description: string | null;
    seasonId: number;
    leaders: { user: { name: string | null } }[];
    season: { code: string; title: string };
  }[],
): Promise<GroupListRow[]> {
  if (groups.length === 0) return [];

  // One grouped count for the whole page rather than a count per group. The
  // population is ACTIVE season enrolments, not GroupStudent rows: the latter
  // hold one row per student across the entire database, so a past season's
  // group would be counted against this season's roster (ruling C9).
  const counts = await db.seasonEnrollment.groupBy({
    by: ["groupId"],
    where: { groupId: { in: groups.map((g) => g.id) }, status: "ACTIVE" },
    _count: { _all: true },
  });
  const countBy = new Map(counts.map((c) => [c.groupId, c._count._all]));

  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description,
    studentCount: countBy.get(g.id) ?? 0,
    leaderNames: g.leaders.map((l) => l.user.name).filter((n): n is string => Boolean(n)),
    seasonId: g.seasonId,
    seasonCode: g.season.code,
    seasonTitle: g.season.title,
  }));
}

const LIST_SELECT = {
  id: true,
  name: true,
  description: true,
  seasonId: true,
  leaders: { select: { user: { select: { name: true } } } },
  season: { select: { code: true, title: true } },
} as const;

/** Returns null when the caller may see no group in this season at all. */
export async function listGroupsForSeason(
  user: SessionUser,
  seasonId: number,
): Promise<GroupListRow[] | null> {
  const scope = await scopeForSeason(user, seasonId);
  if (scope === null) return null;

  const groups = await db.group.findMany({
    where: { seasonId, ...(scope.kind === "ids" ? { id: { in: scope.groupIds } } : {}) },
    orderBy: { name: "asc" },
    select: LIST_SELECT,
  });
  return toListRows(groups);
}

/**
 * Every group this caller is personally attached to, across all seasons.
 *
 * This is what `/groups` in the tab bar needs. `navigation.ts` gives LEADER a
 * `/groups` tab as their **first** tab, and until now no endpoint could serve
 * it — v1 answered the question with a hand-rolled query inside the page, one
 * of five group reads that never reached its REST layer.
 */
export async function listMyGroups(user: SessionUser): Promise<GroupListRow[]> {
  let groupIds: number[];

  if (user.role === "LEADER") {
    groupIds = user.groupLeaderIds;
  } else if (user.role === "STUDENT") {
    const enrollments = await db.seasonEnrollment.findMany({
      where: { studentUserId: user.userId, groupId: { not: null } },
      select: { groupId: true },
    });
    groupIds = enrollments.map((e) => e.groupId).filter((id): id is number => id !== null);
  } else {
    // Staff above leader are not *in* groups. Returning every group they can
    // administer would make "my groups" mean something different per role, so
    // it stays empty and they browse by season instead.
    return [];
  }

  if (groupIds.length === 0) return [];

  const groups = await db.group.findMany({
    where: { id: { in: groupIds } },
    orderBy: [{ season: { year: "desc" } }, { name: "asc" }],
    select: LIST_SELECT,
  });
  return toListRows(groups);
}
