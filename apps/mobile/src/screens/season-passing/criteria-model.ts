/**
 * The pass criteria form (season passing, spec 2026-11-12 "Pass criteria on the season"): three whole
 * percentage weights that must total exactly 100 and a pass mark from 0 to 100. Pure, so the
 * rules are tested apart from the sheet; the End flow's criteria step uses the same model.
 * A number the season has nothing for (no sessions, assignments or quizzes) is off and 0. A season
 * with nothing at all to count leaves every field on: the server skips its availability check
 * then, and any 100% split is as good as another.
 */
import type { PassCriteria, PassingNumberKey, SeasonAvailability } from "@space/shared";

export type CriteriaDraft = { attendance: string; assignments: string; quizzes: string; passMark: string };
type CriteriaErrors = Partial<Record<keyof CriteriaDraft | "total", string>>;

export const WEIGHT_KEYS: readonly PassingNumberKey[] = ["attendance", "assignments", "quizzes"];

export const TOTAL_ERROR = "The weights must add up to 100%.";
const WEIGHT_ERROR = "Enter a whole number from 0 to 100.";
const PASS_MARK_ERROR = "Enter a pass mark from 0 to 100.";

/** A whole number from 0 to 100, else null. */
function wholePercent(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d{1,3}$/.test(text)) return null;
  const n = Number(text);
  return n <= 100 ? n : null;
}

/** Whether a number's field is off: the season has nothing for it, but has something to count. */
export function fieldOff(key: PassingNumberKey, available: SeasonAvailability): boolean {
  const anything = WEIGHT_KEYS.some((k) => available[k]);
  return anything && !available[key];
}

/** The three weights as typed; a blank or unreadable field counts as 0. */
export function draftWeights(d: CriteriaDraft): Record<PassingNumberKey, number> {
  const read = (key: PassingNumberKey) => wholePercent(d[key]) ?? 0;
  return { attendance: read("attendance"), assignments: read("assignments"), quizzes: read("quizzes") };
}

export function parseCriteria(
  d: CriteriaDraft,
  available: SeasonAvailability,
): { ok: true; criteria: PassCriteria } | { ok: false; errors: CriteriaErrors } {
  const errors: CriteriaErrors = {};
  const weights = { attendance: 0, assignments: 0, quizzes: 0 };
  for (const key of WEIGHT_KEYS) {
    if (fieldOff(key, available)) continue;
    const n = wholePercent(d[key]);
    if (n === null) errors[key] = WEIGHT_ERROR;
    else weights[key] = n;
  }
  if (weights.attendance + weights.assignments + weights.quizzes !== 100) errors.total = TOTAL_ERROR;
  const passMark = wholePercent(d.passMark);
  if (passMark === null) errors.passMark = PASS_MARK_ERROR;
  if (Object.keys(errors).length > 0 || passMark === null) return { ok: false, errors };
  return { ok: true, criteria: { weights, passMark } };
}

/**
 * Whole numbers in the same proportion as `parts`, adding up to 100 (largest remainder). All zero:
 * an even split.
 */
function toHundred(parts: number[]): number[] {
  const sum = parts.reduce((a, b) => a + b, 0);
  const shares = sum > 0 ? parts.map((p) => (p / sum) * 100) : parts.map(() => 100 / parts.length);
  const whole = shares.map(Math.floor);
  let left = 100 - whole.reduce((a, b) => a + b, 0);
  const byRemainder = shares.map((s, i) => ({ i, r: s - Math.floor(s) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of byRemainder) {
    if (left <= 0) break;
    whole[i] = (whole[i] ?? 0) + 1;
    left -= 1;
  }
  return whole;
}

/**
 * The form's first values. A weight on a number the season has nothing for (criteria inherited from
 * another season) moves to the others in proportion, so the form opens adding up to 100.
 */
export function draftFrom(c: PassCriteria, available: SeasonAvailability): CriteriaDraft {
  const on = WEIGHT_KEYS.filter((key) => !fieldOff(key, available));
  const weights = { ...c.weights };
  if (on.length < WEIGHT_KEYS.length) {
    const scaled = toHundred(on.map((key) => c.weights[key]));
    for (const key of WEIGHT_KEYS) weights[key] = 0;
    on.forEach((key, i) => {
      weights[key] = scaled[i] ?? 0;
    });
  }
  return {
    attendance: String(weights.attendance),
    assignments: String(weights.assignments),
    quizzes: String(weights.quizzes),
    passMark: String(c.passMark),
  };
}

/** A stepper press: the field moved by `by`, kept within 0 and 100; an unreadable field starts from 0. */
export function stepDraft(raw: string, by: number): string {
  const n = wholePercent(raw) ?? 0;
  return String(Math.min(100, Math.max(0, n + by)));
}

/** "Split equally": the weights of the numbers that are on, shared out to add up to 100 (34 / 33 / 33). */
export function splitEqually(available: SeasonAvailability): Pick<CriteriaDraft, PassingNumberKey> {
  const on = WEIGHT_KEYS.filter((key) => !fieldOff(key, available));
  const shares = toHundred(on.map(() => 1));
  const split = { attendance: "0", assignments: "0", quizzes: "0" };
  on.forEach((key, i) => {
    split[key] = String(shares[i] ?? 0);
  });
  return split;
}
