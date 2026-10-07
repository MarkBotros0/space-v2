import type { AttendanceStatus } from "../generated/prisma/enums";

/**
 * The absence budget and the attendance streak — defined ONCE (ruling C4,
 * spec 19 §7). v1 computed these in `lib/engagement.ts:109-172, 250-273` and
 * re-derived pieces of them in three pages; here every caller (GET
 * /me/attendance today, Plan 16's dashboard through it) gets the same numbers.
 *
 * Pure on purpose: no DB import, so the arithmetic is unit-tested without a
 * database. `queries/attendance-budget.ts` feeds it.
 *
 * Inherits ruling C3's caveat: LATE rows charge their raw `lateMinutes`
 * (spec 04 R88, D2), and rows written by v1 measured those minutes from
 * check-in opening, not the session start.
 */
export interface AttendanceBudget {
  minutesUsed: number;
  budgetMinutes: number;
  budgetPct: number;
  remainingPct: number;
  absentCount: number;
  lateCount: number;
}

export interface BudgetInput {
  absentCount: number;
  lateCount: number;
  /** SUM(lateMinutes) over LATE rows; a null lateMinutes contributes 0 (R89). */
  lateMinutesSum: number;
  absenceWeightMinutes: number;
  absenceBudgetMinutes: number;
}

export function budgetFrom(input: BudgetInput): AttendanceBudget {
  const minutesUsed = input.absentCount * input.absenceWeightMinutes + input.lateMinutesSum;
  // R90: rounded and capped at 100. A zero budget would be 0/0 or x/0 in v1
  // (NaN / Infinity); it is either untouched or exhausted here.
  const budgetPct =
    input.absenceBudgetMinutes > 0
      ? Math.min(Math.round((minutesUsed / input.absenceBudgetMinutes) * 100), 100)
      : minutesUsed > 0
        ? 100
        : 0;
  return {
    minutesUsed,
    budgetMinutes: input.absenceBudgetMinutes,
    budgetPct,
    // Spec 19 D14: "Absence budget left" is sent, never inverted on a client.
    remainingPct: Math.max(0, 100 - budgetPct),
    absentCount: input.absentCount,
    lateCount: input.lateCount,
  };
}

/** R95: what one session cost the budget. Null = nothing to show. */
export function costMinutesFor(
  status: AttendanceStatus | null,
  lateMinutes: number | null,
  absenceWeightMinutes: number,
): number | null {
  if (status === "ABSENT") return absenceWeightMinutes;
  if (status === "LATE") return lateMinutes;
  return null;
}

/**
 * Spec 09 R69: consecutive attended sessions counting back from the most
 * recent PAST session. ABSENT breaks it; a session with no record is skipped
 * (not penalised). `newestFirst` is the statuses of past sessions, newest first.
 */
export function streakFrom(newestFirst: (AttendanceStatus | null)[]): number {
  let streak = 0;
  for (const status of newestFirst) {
    if (status === null) continue;
    if (status === "ABSENT") break;
    streak += 1;
  }
  return streak;
}
