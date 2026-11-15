/**
 * The pure rules of the app's own video controls (owner, 2026-11-15: "put our own video player to
 * control everything"): where a seek may land, the speeds the speed button steps through, and where
 * the unanswered questions sit on the bar. Tested apart from the player.
 */
import type { StudentVideoQuestion } from "@space/shared";

/** The speed button steps through these and wraps; 2x is YouTube's top speed and the server's limit. */
const SPEEDS = [1, 1.25, 1.5, 2, 0.5, 0.75] as const;

/** The next speed after `rate`; an unknown rate goes back to normal. */
export function nextSpeed(rate: number): number {
  const i = SPEEDS.findIndex((s) => s === rate);
  return i < 0 ? 1 : (SPEEDS[(i + 1) % SPEEDS.length] ?? 1);
}

/** "1x", "1.25x", "0.5x". */
export function speedLabel(rate: number): string {
  return `${rate}x`;
}

interface SeekLimits {
  /** With skipping blocked, the furthest a forward seek may land (what was watched); none when free. */
  ceiling?: number;
  /** The next unanswered question's time: no seek passes it, it opens the question instead. */
  barrier: number;
  /** The video's length, once the player has said it. */
  duration: number | null;
  /** Where the playhead is now: a blocked student can always stay where they are. */
  current: number;
}

/**
 * Where a seek to `target` lands. Back is always free. Forward stops at the next unanswered question
 * and, with skipping blocked, at the furthest point watched (never behind where the student already is).
 */
export function clampSeek(target: number, limits: SeekLimits): number {
  if (!Number.isFinite(target)) return limits.current;
  let max = limits.duration ?? Number.POSITIVE_INFINITY;
  max = Math.min(max, limits.barrier);
  if (limits.ceiling !== undefined) max = Math.min(max, Math.max(limits.ceiling, limits.current));
  return Math.max(0, Math.min(target, max));
}

/**
 * The furthest the bar lets the student reach, as a fraction of the video, for the lighter stretch of
 * the track: the barrier, and with skipping blocked the furthest point watched. 1 when nothing limits it.
 */
export function reachFraction(limits: Omit<SeekLimits, "current"> & { current: number }): number {
  const { duration } = limits;
  if (duration === null || duration <= 0) return 0;
  return Math.min(1, Math.max(0, clampSeek(duration, limits) / duration));
}

/** Each unanswered question's place on the bar, 0..1; answered ones drop off. */
export function questionMarks(
  questions: Pick<StudentVideoQuestion, "id" | "atSeconds" | "answered">[],
  duration: number | null,
): { id: number; at: number }[] {
  if (duration === null || duration <= 0) return [];
  return questions
    .filter((q) => !q.answered && q.atSeconds <= duration)
    .map((q) => ({ id: q.id, at: Math.max(0, q.atSeconds / duration) }));
}

/** A link the YouTube frame tried to open (its logo, the title): it leaves the app's player. */
export function isYouTubeLink(url: string): boolean {
  return /^https?:\/\/([a-z0-9-]+\.)*(youtube\.com|youtu\.be)\//i.test(url);
}

/**
 * Whether an ad is playing after YouTube reports `state` (its names, as react-native-youtube-iframe
 * gives them). The IFrame API has no ad event; through an ad it reports "unstarted" with the ad's
 * own playhead, right after buffering (measured 2026-11-15 in Chromium and WebKit: -1, 3, -1, 3, 1).
 * "unstarted" straight after loading is no ad; buffering between ads keeps it; the video playing,
 * pausing, ending or being cued ends it.
 */
export function adAfterReport(wasAd: boolean, previous: string, state: string): boolean {
  if (state === "unstarted") return wasAd || previous === "buffering";
  if (state === "buffering") return wasAd;
  return false;
}
