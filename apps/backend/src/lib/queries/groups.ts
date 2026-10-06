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

export interface SeasonRosterRow {
  userId: number;
  name: string | null;
  email: string;
  groupId: number | null;
  groupName: string | null;
  otherSeasonGroup: { groupName: string; seasonCode: string } | null;
}

/**
 * The season's roster for the bulk-assign grid and the group form (D-16.11).
 *
 * Population: ACTIVE enrolments of live STUDENT users (ruling C9). v1 used
 * `StudentProfile.activeSeasonId` (spec 05 R81), which hides an enrolled
 * student whose pointer has moved on. The group shown is this season's, from
 * `SeasonEnrollment.groupId`; `otherSeasonGroup` is the student's GroupStudent
 * row in a DIFFERENT season's group — the membership an assignment here will
 * remove (GroupStudent.studentUserId is globally unique, spec 05 R1). v1
 * reported such a student as plain "unassigned" (R82).
 */
export async function listSeasonRoster(seasonId: number): Promise<SeasonRosterRow[]> {
  const enrolments = await db.seasonEnrollment.findMany({
    where: { seasonId, status: "ACTIVE", studentUser: { role: "STUDENT", deletedAt: null } },
    select: {
      studentUserId: true,
      groupId: true,
      group: { select: { name: true } },
      studentUser: { select: { name: true, email: true } },
    },
    orderBy: { studentUser: { name: "asc" } },
  });
  if (enrolments.length === 0) return [];

  const elsewhere = await db.groupStudent.findMany({
    where: {
      studentUserId: { in: enrolments.map((e) => e.studentUserId) },
      group: { seasonId: { not: seasonId } },
    },
    select: { studentUserId: true, group: { select: { name: true, season: { select: { code: true } } } } },
  });
  const elsewhereBy = new Map(
    elsewhere.map((g) => [g.studentUserId, { groupName: g.group.name, seasonCode: g.group.season.code }]),
  );

  return enrolments.map((e) => ({
    userId: e.studentUserId,
    name: e.studentUser.name,
    email: e.studentUser.email,
    groupId: e.groupId,
    groupName: e.group?.name ?? null,
    otherSeasonGroup: elsewhereBy.get(e.studentUserId) ?? null,
  }));
}

/**
 * A target group does not belong to the season. Refuses the WHOLE batch
 * (spec 05 R75) — a partially-applied bulk move is worse than a refused one,
 * because the operator cannot tell which half happened.
 */
export class GroupOutsideSeasonError extends Error {
  constructor() {
    super("A selected group does not belong to this season.");
    this.name = "GroupOutsideSeasonError";
  }
}

/** ACTIVE enrolments of live STUDENT users among `studentIds` — the one eligibility rule (C9). */
async function eligibleStudentIds(
  tx: Prisma.TransactionClient,
  seasonId: number,
  studentIds: number[],
): Promise<Set<number>> {
  if (studentIds.length === 0) return new Set();
  const rows = await tx.seasonEnrollment.findMany({
    where: {
      seasonId,
      status: "ACTIVE",
      studentUserId: { in: studentIds },
      studentUser: { role: "STUDENT", deletedAt: null },
    },
    select: { studentUserId: true },
  });
  return new Set(rows.map((r) => r.studentUserId));
}

/**
 * Move a set of students into named groups of one season, without disturbing
 * anyone the caller did not name. The roster grid (PUT
 * /seasons/:id/group-assignments) and Plan 17's group importer both write
 * through this — one home for bulk membership writes.
 *
 * Deliberately NOT `setGroupStudents`: that one means "this is now the
 * group's whole roster", which would empty every group a bulk move happened
 * not to list in full.
 *
 * Two divergences from v1's `assignStudentsToGroupsAction`
 * (`jpc-space/src/lib/group-actions.ts:192-248`), both required:
 *
 * 1. Eligibility is an ACTIVE `SeasonEnrollment` in this season held by a
 *    live STUDENT, not `StudentProfile.activeSeasonId` (ruling C9; v1 at
 *    :215-223). v1 gated on the pointer in both its roster query and this
 *    write, which is what produces spec 05/16's silent skips; and v1 upserted
 *    an enrolment for anyone it accepted, resurrecting WITHDRAWN students.
 *    Here a non-ACTIVE or unknown student is skipped and reported.
 * 2. It returns what it APPLIED. v1 returned nothing and its callers reported
 *    the requested length (spec 05 R57, spec 16 R80/D5).
 */
export async function assignStudentsToGroups(
  tx: Prisma.TransactionClient,
  seasonId: number,
  assignments: { studentUserId: number; groupId: number }[],
): Promise<{ assigned: number; skippedStudentIds: number[] }> {
  const groupIds = [...new Set(assignments.map((a) => a.groupId))];
  if (groupIds.length > 0) {
    const valid = new Set(
      (await tx.group.findMany({ where: { id: { in: groupIds }, seasonId }, select: { id: true } })).map((g) => g.id),
    );
    if (groupIds.some((id) => !valid.has(id))) throw new GroupOutsideSeasonError();
  }

  const eligible = await eligibleStudentIds(tx, seasonId, [...new Set(assignments.map((a) => a.studentUserId))]);

  const skippedStudentIds: number[] = [];
  let assigned = 0;
  for (const a of assignments) {
    if (!eligible.has(a.studentUserId)) {
      skippedStudentIds.push(a.studentUserId);
      continue;
    }
    // GroupStudent.studentUserId is @unique STANDALONE (schema.prisma:330): a
    // student is in at most one group across the whole database, so the
    // existing row — whichever season's group it is — has to go first. The
    // fix is a composite key, which is a migration (Plan 18). Meanwhile the
    // per-season truth is SeasonEnrollment.groupId below, and every v2 read
    // uses that (C9).
    await tx.groupStudent.deleteMany({ where: { studentUserId: a.studentUserId } });
    await tx.groupStudent.create({ data: { groupId: a.groupId, studentUserId: a.studentUserId } });
    await tx.seasonEnrollment.update({
      where: { studentUserId_seasonId: { studentUserId: a.studentUserId, seasonId } },
      data: { groupId: a.groupId },
    });
    assigned += 1;
  }
  return { assigned, skippedStudentIds };
}

/**
 * Take students out of their group IN THIS SEASON. Only this season's
 * GroupStudent row is removed — v1 deleted the student's membership unscoped
 * (spec 05 R3), so unassigning in one season could silently empty their
 * current group in another. Same eligibility as assignStudentsToGroups.
 */
export async function unassignStudentsFromGroups(
  tx: Prisma.TransactionClient,
  seasonId: number,
  studentIds: number[],
): Promise<{ unassigned: number; skippedStudentIds: number[] }> {
  const eligible = await eligibleStudentIds(tx, seasonId, studentIds);
  const skippedStudentIds: number[] = [];
  let unassigned = 0;
  for (const studentUserId of studentIds) {
    if (!eligible.has(studentUserId)) {
      skippedStudentIds.push(studentUserId);
      continue;
    }
    await tx.groupStudent.deleteMany({ where: { studentUserId, group: { seasonId } } });
    await tx.seasonEnrollment.update({
      where: { studentUserId_seasonId: { studentUserId, seasonId } },
      data: { groupId: null },
    });
    unassigned += 1;
  }
  return { unassigned, skippedStudentIds };
}
