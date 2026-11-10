import type { ApiErrorCode } from "@space/shared";
import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import { markSessionsStale } from "../auth/session-validity";
import { lockPeople, readSeatSeason, refuseNewSeats, type SeatRefusal } from "../roles";
import { seasonRosterMember } from "../queries/season-participants";

export interface GroupWriteInput {
  name: string;
  description?: string | null;
  studentIds: number[];
}

/** A refusal a caller can act on, or null when the input is acceptable. */
export async function validateGroupWrite(
  seasonId: number,
  input: GroupWriteInput,
  excludeGroupId?: number,
): Promise<{ code: ApiErrorCode; message: string } | null> {
  // v1 has no uniqueness on group name within a season, and the CSV importer
  // matches groups *by name* — so two groups called "Tuesday" silently make the
  // import assign everyone to whichever one it found last. There is no unique
  // constraint on (seasonId, name), so this check is what refuses the clash.
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

  if (input.studentIds.length > 0) {
    // On *this* season's roster. v1's group form checked nothing here, so it
    // could enrol a student in a season they were never admitted to. The
    // roster is what the form lists, so it never sends a WITHDRAWN member or
    // one whose role changed; `setGroupStudents` must not move them either.
    const enrolled = await db.seasonEnrollment.findMany({
      where: { seasonId, studentUserId: { in: input.studentIds }, ...seasonRosterMember },
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

/** Who a group's save adds and removes as leaders. */
type LeaderChange = { added: number[]; removed: number[] };

/**
 * Check a group's new leader list, before writing anything. `groupId` is null
 * for a group not created yet. Only people being added are checked, so saving a
 * group whose leader is unchanged never re-checks them and an old row can't
 * block the form. Call first in the transaction that then applies the change, as
 * it takes the season's lock before the people's.
 */
export async function planLeaderChange(
  tx: Prisma.TransactionClient,
  seasonId: number,
  groupId: number | null,
  leaderIds: number[],
): Promise<{ refusal: SeatRefusal } | { refusal: null; change: LeaderChange }> {
  const season = await readSeatSeason(tx, seasonId);
  if (!season) return { refusal: { code: "not_found", message: "Season not found." } };

  const current =
    groupId === null
      ? []
      : (await tx.groupLeader.findMany({ where: { groupId }, select: { userId: true } })).map((l) => l.userId);
  const added = [...new Set(leaderIds)].filter((id) => !current.includes(id));
  const removed = current.filter((id) => !leaderIds.includes(id));

  await lockPeople(tx, [...added, ...removed]);
  const refusal = await refuseNewSeats(tx, added, { kind: "leader", season });
  return refusal ? { refusal } : { refusal: null, change: { added, removed } };
}

/** Write a planned change. Whoever it touches refreshes into the new role, signed in. */
export async function applyLeaderChange(
  tx: Prisma.TransactionClient,
  groupId: number,
  { added, removed }: LeaderChange,
): Promise<void> {
  if (removed.length > 0) {
    await tx.groupLeader.deleteMany({ where: { groupId, userId: { in: removed } } });
  }
  if (added.length > 0) {
    await tx.groupLeader.createMany({
      data: added.map((userId) => ({ groupId, userId })),
      skipDuplicates: true,
    });
  }
  await markSessionsStale(tx, [...added, ...removed]);
}

/**
 * Point one student at `groupId` for this season.
 *
 * GroupStudent is one row per student per season (Plan 18 M1), so only THIS
 * season's row is replaced; the student's memberships in other seasons are
 * history and stay. SeasonEnrollment.groupId is the authority (C9) and is
 * written alongside.
 */
async function moveStudentToGroup(
  tx: Prisma.TransactionClient,
  seasonId: number,
  studentUserId: number,
  groupId: number,
): Promise<void> {
  await tx.groupStudent.deleteMany({ where: { studentUserId, seasonId } });
  await tx.groupStudent.create({ data: { groupId, studentUserId, seasonId } });
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
 * GroupStudent is maintained alongside as a per-season mirror of the
 * enrolment (Plan 18 M1), never as the source of truth (ruling C9).
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
  // Only people the list could have shown (seasonRosterMember, the population
  // of listSeasonRoster). "Not in the list" says nothing about a WITHDRAWN member,
  // a former student who now serves or a deleted account, so a rename in a
  // finished season must leave their group alone: it is their History, their
  // workbook row and their targeted assignments. v1's form only removed the rows
  // it diffed out of its own list (group-actions.ts:118-131).
  const removed = await tx.seasonEnrollment.findMany({
    where: { seasonId, groupId, ...seasonRosterMember, studentUserId: { notIn: studentIds } },
    select: { studentUserId: true },
  });
  const removedIds = removed.map((r) => r.studentUserId);
  if (removedIds.length > 0) {
    await tx.seasonEnrollment.updateMany({
      where: { seasonId, groupId, studentUserId: { in: removedIds } },
      data: { groupId: null },
    });
    await tx.groupStudent.deleteMany({
      where: { seasonId, groupId, studentUserId: { in: removedIds } },
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

/** The season's participants who are live STUDENT users, among `studentIds` — the one eligibility rule (C9). */
async function eligibleStudentIds(
  tx: Prisma.TransactionClient,
  seasonId: number,
  studentIds: number[],
): Promise<Set<number>> {
  if (studentIds.length === 0) return new Set();
  const rows = await tx.seasonEnrollment.findMany({
    where: {
      seasonId,
      ...seasonRosterMember,
      studentUserId: { in: studentIds },
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
 * 1. Eligibility is a participant's `SeasonEnrollment` in this season held by a
 *    live STUDENT, not `StudentProfile.activeSeasonId` (ruling C9; v1 at
 *    :215-223). v1 gated on the pointer in both its roster query and this
 *    write, which is what produces spec 05/16's silent skips; and v1 upserted
 *    an enrolment for anyone it accepted, resurrecting WITHDRAWN students.
 *    Here anyone else, or an unknown student, is skipped and reported.
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
  const taken = studentIds.filter((id) => eligible.has(id));
  const skippedStudentIds = studentIds.filter((id) => !eligible.has(id));
  // Two statements for the whole batch, not two per student (refactor BE-073).
  // Every eligible id has an enrolment here, so the updateMany touches the
  // same rows the per-student update did.
  if (taken.length > 0) {
    await tx.groupStudent.deleteMany({ where: { studentUserId: { in: taken }, seasonId } });
    await tx.seasonEnrollment.updateMany({
      where: { studentUserId: { in: taken }, seasonId },
      data: { groupId: null },
    });
  }
  return { unassigned: taken.length, skippedStudentIds };
}
