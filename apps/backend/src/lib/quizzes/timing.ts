/*
 * Quiz timing, pure (spec "Timing"). The server clock decides; the phone's
 * countdown is display only.
 */

/** How long after the deadline a save or submit still lands: one in flight at 0:00 isn't lost. */
export const SAVE_GRACE_MS = 10_000;

/** Whether a student may START the quiz now. Both ends inclusive; no window = always. */
export function canStartNow(
  quiz: { startsFrom: Date | null; startsUntil: Date | null },
  now: Date,
): "ok" | "not_yet" | "closed" {
  if (quiz.startsFrom !== null && now.getTime() < quiz.startsFrom.getTime()) return "not_yet";
  if (quiz.startsUntil !== null && now.getTime() > quiz.startsUntil.getTime()) return "closed";
  return "ok";
}

/** The end of the time limit for an attempt opened at `startedAt`; null = untimed. */
export function deadlineFor(startedAt: Date, timeLimitMinutes: number | null): Date | null {
  return timeLimitMinutes === null ? null : new Date(startedAt.getTime() + timeLimitMinutes * 60_000);
}

/** Past the deadline by more than `graceMs`. An untimed attempt never expires. */
export function isExpired(deadlineAt: Date | null, now: Date, graceMs = 0): boolean {
  return deadlineAt !== null && now.getTime() > deadlineAt.getTime() + graceMs;
}
