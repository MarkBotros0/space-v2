import { db } from "../../db/client";

/**
 * Which group a student is in **for a given season**.
 *
 * Ruling C9: this resolves through SeasonEnrollment, the authority.
 * GroupStudent is per season too since Plan 18 M1, but only as a mirror the
 * group writes keep in step; before M1 it held one row per student across the
 * whole database and could not answer a per-season question at all.
 *
 * The one implementation of that lookup: the assignment reads, the group scope
 * and the submission/forum gates all ask the same per-season question.
 */
export async function groupIdInSeason(studentUserId: number, seasonId: number): Promise<number | null> {
  const enrollment = await db.seasonEnrollment.findUnique({
    where: { studentUserId_seasonId: { studentUserId, seasonId } },
    select: { groupId: true },
  });
  return enrollment?.groupId ?? null;
}
