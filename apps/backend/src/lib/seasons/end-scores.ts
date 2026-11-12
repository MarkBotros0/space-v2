import {
  meetsMark,
  passingPcts,
  weightedScore,
  type EndSeasonRequest,
  type PassCriteria,
  type PassingNumbers,
} from "../../../../../packages/shared/src/index";
import type { Prisma } from "../../generated/prisma/client";
import { ApiError } from "../api-error";
import { checkWeightsAvailable } from "../passing/criteria";
import { loadPassingNumbers } from "../passing/numbers";

/** One student's score at End, the numbers it came from, and whether it reaches the mark (null: no score). */
export interface EndScore {
  score: number | null;
  numbers: PassingNumbers;
  meets: boolean | null;
}

/**
 * Every ACTIVE student's score under End's criteria, recomputed inside End's transaction from the
 * one loader (`loadPassingNumbers`) and the one formula (`weightedScore`) the review screen used, so
 * the same numbers give the same score. Asked for End's own students by id: they come from its
 * ACTIVE-only read, and the claim has already marked the season finished in this transaction, which
 * would widen the null-ids roster.
 *
 * Refuses a weight above 0 on a number the season has nothing for (400 `weight_on_empty`), unless
 * the season has nothing at all to count: then no weights can avoid it and every score is null
 * anyway. Refuses (409 `season_unfinished`) any score that differs from what the staff member was
 * shown, so a staff mark or a re-saved register since the preview sends them back to look again.
 */
export async function scoreForEnd(
  tx: Prisma.TransactionClient,
  seasonId: number,
  studentIds: number[],
  request: { criteria: PassCriteria; reviewed: EndSeasonRequest["reviewed"] },
  now: Date,
): Promise<Map<number, EndScore>> {
  const { available, numbers } = await loadPassingNumbers(seasonId, studentIds, tx, now);
  if (available.attendance || available.assignments || available.quizzes) {
    checkWeightsAvailable(request.criteria, available);
  }
  const shown = new Map(request.reviewed.scores.map((s) => [s.userId, s.score]));
  const scores = new Map<number, EndScore>();
  for (const uid of studentIds) {
    const n = numbers.get(uid);
    if (!n) throw new ApiError("season_unfinished", "The roster changed; check the season again.", 409);
    const { score } = weightedScore(passingPcts(n), request.criteria.weights);
    if (!shown.has(uid) || shown.get(uid) !== score) {
      throw new ApiError("season_unfinished", "The scores changed; check the season again.", 409);
    }
    scores.set(uid, { score, numbers: n, meets: meetsMark(score, request.criteria.passMark) });
  }
  return scores;
}
