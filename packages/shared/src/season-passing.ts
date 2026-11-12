import { z } from "zod";

/*
 * Season passing by weighted score (docs/superpowers/specs/2026-11-12-season-passing-design.md).
 * The three numbers come from the backend's one loader (`lib/passing/numbers.ts`); the score is
 * computed here, the same on the server and in the app, so the End preview and the End
 * recompute cannot disagree. The score is a helper: it pre-selects, the admin decides.
 */

const percent = z.number().int().min(0).max(100);

export const passWeightsSchema = z.object({ attendance: percent, assignments: percent, quizzes: percent }).strict();
export type PassWeights = z.infer<typeof passWeightsSchema>;

/** Whether three weights add up to exactly 100. */
function weightsAddUp(w: PassWeights): boolean {
  return w.attendance + w.assignments + w.quizzes === 100;
}

export const passCriteriaSchema = z
  .object({ weights: passWeightsSchema, passMark: percent })
  .strict()
  .refine((c) => weightsAddUp(c.weights), { message: "The weights must add up to 100%.", path: ["weights"] });
export type PassCriteria = z.infer<typeof passCriteriaSchema>;

/** What a season uses before anyone saved criteria anywhere. */
export const DEFAULT_PASS_CRITERIA: PassCriteria = {
  weights: { attendance: 40, assignments: 30, quizzes: 30 },
  passMark: 60,
};

const count = z.number().int().nonnegative();

/** One student's raw numbers in a season. A zero denominator means "nothing to count". */
export const passingNumbersSchema = z.object({
  attendance: z.object({ attended: count, total: count }),
  assignments: z.object({ submitted: count, total: count }),
  quizzes: z.object({ scored: z.number().nonnegative(), max: count }),
});
export type PassingNumbers = z.infer<typeof passingNumbersSchema>;

/** Whether the season has anything to count for each number (any session, live assignment, counted quiz). */
export const seasonAvailabilitySchema = z.object({
  attendance: z.boolean(),
  assignments: z.boolean(),
  quizzes: z.boolean(),
});
export type SeasonAvailability = z.infer<typeof seasonAvailabilitySchema>;

export type PassingNumberKey = "attendance" | "assignments" | "quizzes";
export type PassingPcts = Record<PassingNumberKey, number | null>;

const KEYS: readonly PassingNumberKey[] = ["attendance", "assignments", "quizzes"];

function pct(part: number, whole: number): number | null {
  return whole > 0 ? (part / whole) * 100 : null;
}

/** The three percentages, unrounded; null where the denominator is 0. */
export function passingPcts(n: PassingNumbers): PassingPcts {
  return {
    attendance: pct(n.attendance.attended, n.attendance.total),
    assignments: pct(n.assignments.submitted, n.assignments.total),
    quizzes: pct(n.quizzes.scored, n.quizzes.max),
  };
}

/*
 * One decimal, half up. The tiny nudge keeps a ratio that is exactly on a .x5 boundary (1199 of
 * 2000 is 59.95) from rounding down on floating-point noise; nothing a real ratio can reach is
 * that close to a boundary without being on it.
 */
function round1(x: number): number {
  return Math.round(x * 10 + 1e-9) / 10;
}

/**
 * Σ wᵢ·pctᵢ / Σ wᵢ over the weighted numbers that are not null, rounded to one decimal. A weighted
 * number that is null (the student had nothing to count there) is left out and the rest re-scaled:
 * `rescaled` says so. No weighted number left: no score.
 */
export function weightedScore(p: PassingPcts, w: PassWeights): { score: number | null; rescaled: boolean } {
  let sum = 0;
  let weight = 0;
  let rescaled = false;
  for (const key of KEYS) {
    if (w[key] <= 0) continue;
    const value = p[key];
    if (value === null) {
      rescaled = true;
      continue;
    }
    sum += w[key] * value;
    weight += w[key];
  }
  return { score: weight > 0 ? round1(sum / weight) : null, rescaled };
}

/** Whether the (rounded) score reaches the pass mark; null when there is no score. */
export function meetsMark(score: number | null, passMark: number): boolean | null {
  return score === null ? null : score >= passMark;
}

/** How far a score is below the mark, one decimal; 0 at or above it. */
export function pointsShort(score: number, passMark: number): number {
  return Math.max(0, round1(passMark - score));
}

/** The lowest of the weighted numbers that are not null; null when there is none. Ties go to the first. */
export function weakestNumber(p: PassingPcts, w: PassWeights): PassingNumberKey | null {
  let weakest: PassingNumberKey | null = null;
  for (const key of KEYS) {
    const value = p[key];
    if (w[key] <= 0 || value === null) continue;
    if (weakest === null || value < (p[weakest] as number)) weakest = key;
  }
  return weakest;
}
