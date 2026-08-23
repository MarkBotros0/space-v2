import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
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

export interface GroupWriteInput {
  name: string;
  description?: string | null;
  leaderIds: number[];
  studentIds: number[];
}

/** A refusal a caller can act on, or null when the input is acceptable. */
export async function validateGroupWrite(
  seasonId: number,
  input: GroupWriteInput,
  excludeGroupId?: number,
): Promise<{ code: string; message: string } | null> {
  // v1 has no uniqueness on group name within a season, and the CSV importer
  // matches groups *by name* — so two groups called "Tuesday" silently make the
  // import assign everyone to whichever one it found last. A real constraint
  // needs a migration (ruling C1); this is the check that can be made now.
  const clash = await db.group.findFirst({
    where: {
      seasonId,
      name: input.name,
      ...(excludeGroupId ? { id: { not: excludeGroupId } } : {}),
    },
    select: { id: true },
  });
  if (clash) {
    return { code: "name_taken", message: "A group in this season already has that name." };
  }

  if (input.leaderIds.length > 0) {
    // A GroupLeader row populates the groupLeaderIds claim, and isLeaderOfGroup
    // now pairs that claim with the LEADER role — so naming a student here
    // would produce a grant that grants nothing, which is a confusing dead row
    // rather than a hole. Refusing it outright keeps the two consistent.
    const eligible = await db.user.findMany({
      where: { id: { in: input.leaderIds }, role: "LEADER" },
      select: { id: true },
    });
    if (eligible.length !== new Set(input.leaderIds).size) {
      return { code: "invalid_leader", message: "Every leader must be a user with the leader role." };
    }
  }

  if (input.studentIds.length > 0) {
    // Enrolled in *this* season. v1's group form checked nothing here, so it
    // could enrol a student in a season they were never admitted to.
    const enrolled = await db.seasonEnrollment.findMany({
      where: { seasonId, studentUserId: { in: input.studentIds } },
      select: { studentUserId: true },
    });
    if (enrolled.length !== new Set(input.studentIds).size) {
      return {
        code: "not_enrolled",
        message: "Every student must already be enrolled in this season.",
      };
    }
  }

  return null;
}

/**
 * Point a set of students at a group, preserving their enrolment history.
 *
 * v1 has two write paths with opposite semantics. The group form deletes and
 * recreates the SeasonEnrollment, which resets status, enrolledAt, droppedAt
 * and dropReason — so a WITHDRAWN student silently becomes ACTIVE with their
 * reason for leaving erased, on a model the schema itself calls "Append-only
 * history". The roster grid upserts only groupId and preserves all of it. This
 * is the roster grid's semantics; the form's are not reproduced.
 *
 * GroupStudent is still maintained alongside, because v1 reads it and both
 * systems are live against one database — dropping it here would break v1's
 * pages, not just v2's. It is written as a mirror of the enrolment, never as
 * the source of truth (ruling C9).
 */
export async function setGroupStudents(
  tx: Prisma.TransactionClient,
  seasonId: number,
  groupId: number,
  studentIds: number[],
): Promise<void> {
  // Students previously in this group who are not in the new list keep their
  // enrolment and lose only the group pointer. Removing the enrolment would
  // discard the fact that they were ever in the season.
  await tx.seasonEnrollment.updateMany({
    where: { seasonId, groupId, studentUserId: { notIn: studentIds } },
    data: { groupId: null },
  });
  await tx.groupStudent.deleteMany({
    where: { groupId, studentUserId: { notIn: studentIds } },
  });

  for (const studentUserId of studentIds) {
    // GroupStudent.studentUserId is unique across the whole database, so an
    // existing row anywhere has to go before this one can be written.
    await tx.groupStudent.deleteMany({ where: { studentUserId } });
    await tx.groupStudent.create({ data: { groupId, studentUserId } });
    await tx.seasonEnrollment.update({
      where: { studentUserId_seasonId: { studentUserId, seasonId } },
      data: { groupId },
    });
  }
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
