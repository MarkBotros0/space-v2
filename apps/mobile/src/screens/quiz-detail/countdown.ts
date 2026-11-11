/**
 * The quiz clock, read on the server's time (docs/rules/quiz-integrity.md "Timing"). The phone's
 * clock only measures how long has passed since a response arrived: `serverNow` in that response,
 * minus the phone's time on arrival, is the offset every reading adds back. A phone five minutes
 * fast shows the same time left as a right one. The countdown is display only; the server decides.
 */
import { plural } from "../../lib/plural";
import { MS_PER_MINUTE } from "../../lib/time";

/** How far the server's clock is ahead of the phone's (negative: behind). */
export function clockOffsetMs(serverNowIso: string, receivedAt: number): number {
  return Date.parse(serverNowIso) - receivedAt;
}

/** The server's time now, from the phone's clock and the offset. */
export function serverTimeMs(offsetMs: number, now: number): number {
  return now + offsetMs;
}

/** Time left until the deadline on the server's clock, never below zero. */
export function remainingMs(deadlineIso: string, offsetMs: number, now: number): number {
  return Math.max(0, Date.parse(deadlineIso) - serverTimeMs(offsetMs, now));
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "19:05", "0:42"; "2:05:00" past an hour. Rounds up, so "0:00" shows only once time is up. */
export function formatRemaining(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** What a screen reader hears: whole minutes, so the live region speaks once a minute, not every second. */
export function minutesLeftLabel(ms: number): string {
  if (ms < MS_PER_MINUTE) return "Less than a minute left";
  return `${plural(Math.ceil(ms / MS_PER_MINUTE), "minute")} left`;
}

type Window = { startsFrom: string | null; startsUntil: string | null };
export type StartWindowState = { kind: "open" } | { kind: "not_yet"; at: string } | { kind: "closed"; at: string };

/** Whether a first start is allowed at `serverNow`; both ends inclusive, as the server reads them. */
export function startWindowState(w: Window, serverNow: number): StartWindowState {
  if (w.startsFrom !== null && serverNow < Date.parse(w.startsFrom)) return { kind: "not_yet", at: w.startsFrom };
  if (w.startsUntil !== null && serverNow > Date.parse(w.startsUntil)) return { kind: "closed", at: w.startsUntil };
  return { kind: "open" };
}

/** When (server time) `startWindowState` next changes, or null once it never will. */
export function nextWindowChangeMs(w: Window, serverNow: number): number | null {
  const state = startWindowState(w, serverNow);
  if (state.kind === "not_yet") return Date.parse(state.at);
  if (state.kind === "open" && w.startsUntil !== null) return Date.parse(w.startsUntil) + 1;
  return null;
}
