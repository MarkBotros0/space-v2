import { meetsMark } from "../../../../../packages/shared/src/index";
import { db } from "../../db/client";
import { lockPeople } from "../roles";
import { toScore } from "../quizzes/score";
import { graduatePerson } from "../students/graduation";

/**
 * The season's admin's or a super's correction of one finished student's result,
 * under the person's lock. The score End stored never changes; whether the result
 * goes against it is worked out again, and who set it is the corrector. Passed on a
 * graduating season graduates them then; Did not pass never takes alumni status
 * away. Returns whether they graduated just now.
 */
export async function correctSeasonResult(
  seasonId: number,
  studentUserId: number,
  correction: { result: "PASSED" | "NOT_PASSED"; reason: string | null; at: Date; byId: number },
  graduating: { graduatesOnPass: boolean; year: number },
): Promise<boolean> {
  return db.$transaction(async (tx) => {
    await lockPeople(tx, [studentUserId]);
    const [row, season] = await Promise.all([
      tx.seasonEnrollment.findUniqueOrThrow({
        where: { studentUserId_seasonId: { studentUserId, seasonId } },
        select: { passScore: true },
      }),
      tx.season.findUniqueOrThrow({ where: { id: seasonId }, select: { passMark: true } }),
    ]);
    const score = toScore(row.passScore);
    const meets = season.passMark === null ? null : meetsMark(score, season.passMark);
    await tx.seasonEnrollment.update({
      where: { studentUserId_seasonId: { studentUserId, seasonId } },
      data: {
        result: correction.result,
        resultReason: correction.reason,
        resultSetAt: correction.at,
        resultSetById: correction.byId,
        resultAgainstScore: meets !== null && (correction.result === "PASSED") !== meets,
      },
    });
    if (correction.result !== "PASSED" || !graduating.graduatesOnPass) return false;
    const outcome = await graduatePerson(tx, studentUserId, graduating.year);
    return typeof outcome !== "string";
  });
}
