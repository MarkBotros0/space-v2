/**
 * What counts as leaving a quiz (docs/superpowers/plans/2026-11-10-quiz-integrity.md "Global
 * Constraints"). Pure: the lock hook feeds it AppState and window sizes. The phone only reports
 * what it saw; the server counts the exits and ends the attempt on the third.
 */
import type { AppStateStatus } from "react-native";
import type { QuizAttemptEventInput, quizAttemptEventsResponseSchema } from "@space/shared";
import type { z } from "zod";

type ExitSignal = "left" | "returned";
type ExitKind = QuizAttemptEventInput["kind"];

/** The server's answer to a report of events. */
export type ExitReport = z.infer<typeof quizAttemptEventsResponseSchema>;

/**
 * `left` only on reaching `background` (home, another app, the power button, a call); `returned` on
 * `background` → `active`. `inactive` alone (Control Center, the notification shade) is nothing.
 */
export function exitTransition(prev: AppStateStatus, next: AppStateStatus): ExitSignal | null {
  if (next === "background" && prev !== "background") return "left";
  if (next === "active" && prev === "background") return "returned";
  return null;
}

/** The state to compare the next change with: `inactive` on the way back from background keeps "background". */
export function trackedState(prev: AppStateStatus, next: AppStateStatus): AppStateStatus {
  return prev === "background" && next === "inactive" ? prev : next;
}

/** Android split screen or a resized window: ours is under 85% of the screen's height. */
export function isMultiWindow(window: { height: number }, screen: { height: number }): boolean {
  return window.height < 0.85 * screen.height;
}

/** The phone's `now` on the server's clock, as the exit log stores it. */
export function serverIso(offsetMs: number, now: number): string {
  return new Date(now + offsetMs).toISOString();
}

const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");

/**
 * A v4 UUID for one event: the server stores each id once, so a retry or an offline replay never
 * counts twice. The platform's `crypto.randomUUID` when there is one; the id only has to be unique
 * within one attempt, so the fallback needs no cryptographic source.
 */
export function newEventId(): string {
  const native = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID;
  if (native) return native.call((globalThis as { crypto?: object }).crypto);
  const variant = "89ab"[Math.floor(Math.random() * 4)];
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${variant}${hex(3)}-${hex(12)}`;
}

/** One event to report. A return before the leave (the offset moved between them) is read as the leave. */
export function exitEvent(kind: ExitKind, leftAt: string, returnedAt: string | null): QuizAttemptEventInput {
  const back = returnedAt !== null && Date.parse(returnedAt) < Date.parse(leftAt) ? leftAt : returnedAt;
  return { clientEventId: newEventId(), kind, leftAt, returnedAt: back };
}

/** This report ended the attempt, or it was already shut (a retry of the report that ended it). */
export function isAttemptClosed(report: ExitReport): boolean {
  return report.ended || report.status !== "IN_PROGRESS";
}

/**
 * The exit a mount finds. A "left" marker with no return means the phone never came back to the
 * quiz in that run (killed in the background); a cold start with the attempt open from the last
 * run means it crashed, was killed or died on screen. Either is one exit: RELAUNCH on a cold start.
 * `leftAt` null: unknown, the mount's own time stands in.
 */
export function mountExit({
  pendingLeftAt,
  wasOpen,
  coldStart,
}: {
  pendingLeftAt: string | null;
  wasOpen: boolean;
  coldStart: boolean;
}): { kind: ExitKind; leftAt: string | null } | null {
  if (pendingLeftAt !== null) return { kind: coldStart ? "RELAUNCH" : "EXIT", leftAt: pendingLeftAt };
  if (coldStart && wasOpen) return { kind: "RELAUNCH", leftAt: null };
  return null;
}
