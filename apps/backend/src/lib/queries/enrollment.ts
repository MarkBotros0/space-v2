import { db } from "../../db/client";

/**
 * Which group a student is in **for a given season**.
 *
 * Ruling C9: this must resolve through SeasonEnrollment, never GroupStudent.
 * `GroupStudent.studentUserId` is `@unique` on its own, so that table holds one
 * row per student across the entire database and cannot answer a per-season
 * question — a student who moves to a new season's group loses the old row, and
 * every past season then reports them as ungrouped. SeasonEnrollment.groupId is
 * the per-season fact.
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
