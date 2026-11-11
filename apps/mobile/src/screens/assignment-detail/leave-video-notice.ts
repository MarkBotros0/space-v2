// What the video part says to a student leaving before it counts (spec "Every
// video must be watched before Submit unlocks"). Pure, so the words are tested
// apart from the player.
import { isWatched } from "@space/shared";

import { keepTogether } from "../../lib/format";

/** A skipped stretch longer than this is worth mentioning; a few seconds is the player's own jitter. */
const SKIP_SLACK_SECONDS = 5;

/**
 * "6 of 18 min" as one unbreakable run, so it never wraps apart at 1.3. Minutes
 * are counted as the checklist's row counts them (`partStatusLine`): watched
 * rounded down, the length rounded to a whole minute, at least one.
 */
export function watchedRun(watchedSeconds: number, durationSeconds: number): string {
  const total = Math.max(1, Math.round(durationSeconds / 60));
  return keepTogether(`${Math.floor(watchedSeconds / 60)} of ${total} min`);
}

interface VideoWatching {
  watchedSeconds: number;
  durationSeconds: number;
  /** The furthest point reached, which skipping ahead moves without watching. */
  furthestSeconds: number;
  blockSkipping: boolean;
}

/**
 * The "Not finished yet" notice, or null when leaving needs none: the video
 * already counts (90% watched), or its length isn't known yet. When skipping
 * was allowed and the student jumped ahead, it says the skipped stretch doesn't
 * count, since reaching the end is not watching it.
 */
export function leaveVideoNotice(w: VideoWatching): { title: string; body: string } | null {
  if (w.durationSeconds <= 0 || isWatched(w.watchedSeconds, w.durationSeconds)) return null;
  const skipped = !w.blockSkipping && w.furthestSeconds - w.watchedSeconds > SKIP_SLACK_SECONDS;
  const parts = [
    `${watchedRun(w.watchedSeconds, w.durationSeconds)} watched.`,
    skipped ? "The parts you skipped don't count." : null,
    "You can't submit until you've watched it.",
  ];
  return { title: "Not finished yet", body: parts.filter(Boolean).join(" ") };
}
