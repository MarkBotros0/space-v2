import { db } from "../../../db/client";
import type { Prisma } from "../../../generated/prisma/client";

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
 * Point one student at `groupId` for this season.
 *
 * GroupStudent.studentUserId is @unique STANDALONE (schema.prisma:330): a
 * student is in at most one group across the whole database, so the existing
 * row — whichever season's group it is — has to go first. The fix is a
 * composite key, which is a migration (Plan 18). Meanwhile the per-season truth
 * is SeasonEnrollment.groupId, and every v2 read uses that (C9).
 */
async function moveStudentToGroup(
  tx: Prisma.TransactionClient,
  seasonId: number,
  studentUserId: number,
  groupId: number,
): Promise<void> {
  await tx.groupStudent.deleteMany({ where: { studentUserId } });
  await tx.groupStudent.create({ data: { groupId, studentUserId } });
  await tx.seasonEnrollment.update({
    where: { studentUserId_seasonId: { studentUserId, seasonId } },
    data: { groupId },
  });
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
  //
  // ACTIVE enrolments only. The form's list is built from the season roster,
  // which holds ACTIVE enrolments and nothing else, so a COMPLETED or
  // WITHDRAWN member is never in it — "not in the list" says nothing about
  // them. Without this, renaming a group in a finished season stripped every
  // COMPLETED student's group. v1's form only removed the rows it diffed out
  // of its own list (group-actions.ts:118-131), which never touched them.
  const removed = await tx.seasonEnrollment.findMany({
    where: { seasonId, groupId, status: "ACTIVE", studentUserId: { notIn: studentIds } },
    select: { studentUserId: true },
  });
  const removedIds = removed.map((r) => r.studentUserId);
  if (removedIds.length > 0) {
    await tx.seasonEnrollment.updateMany({
      where: { seasonId, groupId, studentUserId: { in: removedIds } },
      data: { groupId: null },
    });
    await tx.groupStudent.deleteMany({
      where: { groupId, studentUserId: { in: removedIds } },
    });
  }

  for (const studentUserId of studentIds) {
    await moveStudentToGroup(tx, seasonId, studentUserId, groupId);
  }
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
    await moveStudentToGroup(tx, seasonId, a.studentUserId, a.groupId);
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
