import { db } from "../../../db/client";
import type { Prisma } from "../../../generated/prisma/client";
import type { StaffRoster } from "../../permissions";

/**
 * A student's advisory "current group": what the student list and detail
 * display, and the list's group filter and sort match (REG-82). Never used for
 * scope or permissions — those ask a per-season question of
 * SeasonEnrollment.groupId (ruling C9).
 *
 * Before Plan 18 M1, GroupStudent held one row per student and every
 * assignment replaced it, so "current" was that row: the group the student
 * was most recently put in, whichever season it belonged to. With one row per
 * season the same answer is the most recently created membership —
 * `enrolledAt` is set when the row is written, and `seasonId` breaks a tie.
 */
export const CURRENT_MEMBERSHIP_ORDER: Prisma.GroupStudentOrderByWithRelationInput[] = [
  { enrolledAt: "desc" },
  { seasonId: "desc" },
];

/** Select fragment for the current membership on a User query (0 or 1 rows). */
export function currentMembershipSelect<S extends Prisma.GroupSelect>(groupSelect: S) {
  return {
    orderBy: CURRENT_MEMBERSHIP_ORDER,
    take: 1,
    select: { group: { select: groupSelect } },
  } as const;
}

/**
 * Students whose current group (above) is `groupId`. Membership of `groupId`
 * alone is not enough: a student who was in it last season and has since been
 * put in another group no longer counts. A `roster` asks the same within the
 * seasons a member of staff may read, as the list displays it to them, so a group
 * outside it finds nobody.
 */
export async function studentIdsWithCurrentGroup(
  groupId: number,
  roster: StaffRoster | null = null,
): Promise<number[]> {
  const members = await db.groupStudent.findMany({
    // AND, since a leader's roster names groupId too.
    where: { AND: [{ groupId }, roster ?? {}] },
    select: { studentUserId: true },
  });
  if (members.length === 0) return [];

  const memberships = await db.groupStudent.findMany({
    where: { studentUserId: { in: members.map((m) => m.studentUserId) }, ...roster },
    orderBy: CURRENT_MEMBERSHIP_ORDER,
    select: { studentUserId: true, groupId: true },
  });
  const current = new Map<number, number>();
  for (const m of memberships) {
    if (!current.has(m.studentUserId)) current.set(m.studentUserId, m.groupId);
  }
  return [...current].filter(([, g]) => g === groupId).map(([studentUserId]) => studentUserId);
}
