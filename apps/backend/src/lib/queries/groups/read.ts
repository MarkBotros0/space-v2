import { db } from "../../../db/client";
import type { SessionUser } from "../../auth/tokens";
import { isMentor, isSuper } from "../../rbac";
import { groupIdInSeason } from "../enrollment";
import { seasonParticipant, seasonRosterMember } from "../season-participants";
import { ledGroupIdsInSeason } from "../led-groups";
import { liveAssignment } from "../../db/live";

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
    const groupIds = await ledGroupIdsInSeason(user, seasonId);
    return groupIds.length === 0 ? null : { kind: "ids", groupIds };
  }
  if (user.role === "STUDENT") {
    // The student's group *in this season*, from the enrolment (ruling C9).
    const groupId = await groupIdInSeason(user.userId, seasonId);
    return groupId === null ? null : { kind: "ids", groupIds: [groupId] };
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
  // population is the season's participants, from enrolments (ruling C9).
  const counts = await db.seasonEnrollment.groupBy({
    by: ["groupId"],
    where: { groupId: { in: groups.map((g) => g.id) }, ...seasonParticipant },
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
export async function listGroupsForSeason(user: SessionUser, seasonId: number): Promise<GroupListRow[] | null> {
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

export interface SeasonRosterRow {
  userId: number;
  name: string | null;
  email: string;
  groupId: number | null;
  groupName: string | null;
}

/**
 * The season's roster for the bulk-assign grid and the group form (D-16.11).
 *
 * Population: the season's participants who are live STUDENT users (ruling C9). v1 used
 * `StudentProfile.activeSeasonId` (spec 05 R81), which hides an enrolled
 * student whose pointer has moved on. The group shown is this season's, from
 * `SeasonEnrollment.groupId`. A group in another season is not reported:
 * memberships are per season (Plan 18 M1), so assigning here leaves it alone.
 */
export async function listSeasonRoster(seasonId: number): Promise<SeasonRosterRow[]> {
  const enrolments = await db.seasonEnrollment.findMany({
    where: { seasonId, ...seasonRosterMember },
    select: {
      studentUserId: true,
      groupId: true,
      group: { select: { name: true } },
      studentUser: { select: { name: true, email: true } },
    },
    orderBy: { studentUser: { name: "asc" } },
  });
  return enrolments.map((e) => ({
    userId: e.studentUserId,
    name: e.studentUser.name,
    email: e.studentUser.email,
    groupId: e.groupId,
    groupName: e.group?.name ?? null,
  }));
}

/**
 * What deleting a group would do (spec 05 §10 item 5, Plan 6 D-16.13).
 * `soleTargetAssignments`: live assignments that are not "all groups" and
 * whose ONLY target is this group — deleting it would cascade their last
 * AssignmentTarget away and leave them visible to nobody (R44).
 */
export async function loadGroupImpact(groupId: number): Promise<{
  studentCount: number;
  leaderCount: number;
  soleTargetAssignments: { id: number; title: string }[];
}> {
  const [studentCount, leaderCount, targeted] = await Promise.all([
    db.seasonEnrollment.count({ where: { groupId, ...seasonParticipant } }),
    db.groupLeader.count({ where: { groupId } }),
    db.assignment.findMany({
      where: { ...liveAssignment, isAllGroups: false, targets: { some: { groupId } } },
      orderBy: { id: "asc" },
      select: { id: true, title: true, _count: { select: { targets: true } } },
    }),
  ]);
  return {
    studentCount,
    leaderCount,
    soleTargetAssignments: targeted.filter((a) => a._count.targets === 1).map((a) => ({ id: a.id, title: a.title })),
  };
}
