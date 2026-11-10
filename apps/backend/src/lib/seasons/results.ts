import { db } from "../../db/client";
import { lockPeople } from "../roles";
import { graduatePerson } from "../students/graduation";

/**
 * A SUPER's correction of one finished student's result, under the person's
 * lock. Passed on a graduating season graduates them then; Did not pass never
 * takes alumni status away. Returns whether they graduated just now.
 */
export async function correctSeasonResult(
  seasonId: number,
  studentUserId: number,
  correction: { result: "PASSED" | "NOT_PASSED"; reason: string | null; at: Date },
  graduating: { graduatesOnPass: boolean; year: number },
): Promise<boolean> {
  return db.$transaction(async (tx) => {
    await lockPeople(tx, [studentUserId]);
    await tx.seasonEnrollment.update({
      where: { studentUserId_seasonId: { studentUserId, seasonId } },
      data: { result: correction.result, resultReason: correction.reason, resultSetAt: correction.at },
    });
    if (correction.result !== "PASSED" || !graduating.graduatesOnPass) return false;
    const outcome = await graduatePerson(tx, studentUserId, graduating.year);
    return typeof outcome !== "string";
  });
}
