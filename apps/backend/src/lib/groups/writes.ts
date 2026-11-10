import type { GroupWriteRequest } from "@space/shared";

import { db } from "../../db/client";
import { ApiError, toApiError } from "../api-error";
import { markSessionsStale } from "../auth/session-validity";
import { liveAssignment } from "../db/live";
import { lockPeople, lockSeason } from "../roles";
import { applyLeaderChange, planLeaderChange, setGroupStudents } from "./membership";

/** PATCH /groups/:id's body after parsing: an absent list leaves it alone. */
type GroupUpdate = Omit<GroupWriteRequest, "leaderIds" | "studentIds"> & {
  leaderIds?: number[];
  studentIds?: number[];
};

/**
 * POST /seasons/:id/groups' transaction. A seat refusal for a leader is an
 * ApiError (toApiError's status) thrown before the group is created.
 */
export async function createGroup(seasonId: number, body: GroupWriteRequest): Promise<number> {
  return db.$transaction(async (tx) => {
    const plan = await planLeaderChange(tx, seasonId, null, body.leaderIds);
    if (plan.refusal) throw toApiError(plan.refusal);

    const created = await tx.group.create({
      data: {
        seasonId,
        name: body.name,
        description: body.description ?? null,
      },
      select: { id: true },
    });
    await applyLeaderChange(tx, created.id, plan.change);
    await setGroupStudents(tx, seasonId, created.id, body.studentIds);
    return created.id;
  });
}

/**
 * PATCH /groups/:id's transaction. The leader plan (and its seat refusal) comes
 * before any write.
 */
export async function updateGroup(id: number, seasonId: number, body: GroupUpdate): Promise<void> {
  const { leaderIds, studentIds } = body;
  await db.$transaction(async (tx) => {
    let change = null;
    if (leaderIds !== undefined) {
      const plan = await planLeaderChange(tx, seasonId, id, leaderIds);
      if (plan.refusal) throw toApiError(plan.refusal);
      change = plan.change;
    }
    await tx.group.update({
      where: { id },
      // Absent keeps it, null clears it: `PATCH { name }` is a rename.
      data: { name: body.name, description: body.description },
    });
    if (change) await applyLeaderChange(tx, id, change);
    if (studentIds !== undefined) await setGroupStudents(tx, seasonId, id, studentIds);
  });
}

/**
 * DELETE /groups/:id's transaction: re-checks, under the season's share lock,
 * that no live assignment targets only this group (R44), and refuses before any
 * write if one does. Then leaders, memberships and target rows go; every
 * enrolment pointing at the group loses the pointer; the group is hard-deleted.
 * Returns the students left without a group.
 */
export async function deleteGroup(id: number): Promise<number[]> {
  return db.$transaction(async (tx) => {
    const { seasonId } = await tx.group.findUniqueOrThrow({ where: { id }, select: { seasonId: true } });
    await lockSeason(tx, seasonId, "share");
    const sole = await tx.assignment.findMany({
      where: { ...liveAssignment, isAllGroups: false, targets: { some: { groupId: id } } },
      select: { _count: { select: { targets: true } } },
    });
    const soleCount = sole.filter((a) => a._count.targets === 1).length;
    if (soleCount > 0) {
      throw new ApiError(
        "group_has_sole_targets",
        `${soleCount} assignment(s) target only this group. Retarget them before deleting it.`,
        409,
      );
    }

    const orphaned = await tx.seasonEnrollment.findMany({ where: { groupId: id }, select: { studentUserId: true } });
    const leaders = (await tx.groupLeader.findMany({ where: { groupId: id }, select: { userId: true } })).map(
      (l) => l.userId,
    );
    await lockPeople(tx, leaders);
    await tx.groupLeader.deleteMany({ where: { groupId: id } });
    await markSessionsStale(tx, leaders);
    await tx.groupStudent.deleteMany({ where: { groupId: id } });
    await tx.seasonEnrollment.updateMany({ where: { groupId: id }, data: { groupId: null } });
    await tx.assignmentTarget.deleteMany({ where: { groupId: id } });
    await tx.group.delete({ where: { id } });
    return orphaned.map((o) => o.studentUserId);
  });
}
