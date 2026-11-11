import { countWords } from "./forum";
import { htmlToPlainText } from "./html-text";
import type { AssignmentPart, PartWork } from "./assignment-parts";

// The completion rules, pure so the server's gate and the screen's button
// agree. A video counts once 90% of it has been watched.

type Interval = [number, number];

/** Union of two interval lists: sorted, overlapping or touching ranges joined, clamped to >= 0. */
export function mergeIntervals(a: Interval[], b: Interval[]): Interval[] {
  const all = [...a, ...b]
    .map(([s, e]): Interval => [Math.max(0, s), Math.max(0, e)])
    .filter(([s, e]) => e > s)
    .sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const out: Interval[] = [];
  for (const [s, e] of all) {
    const last = out[out.length - 1];
    if (last !== undefined && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

/** Total seconds covered by a list of merged intervals. */
export function watchedSeconds(intervals: Interval[]): number {
  return intervals.reduce((sum, [s, e]) => sum + (e - s), 0);
}

const WATCHED_FRACTION = 0.9;

export function isWatched(watched: number, duration: number): boolean {
  return duration > 0 && watched >= WATCHED_FRACTION * duration;
}

/**
 * An essay's word count, always on its plain text (what the app shows), so
 * inline markup and entities count the same on the server and in the app:
 * "un<i>believ</i>able" is one word, "Tom &amp; Jerry" three.
 */
export function essayWordCount(text: string | null): number {
  return countWords(htmlToPlainText(text ?? ""));
}

/** Null when the text is inside the range; else how far outside, counted like the server. */
export function wordRangeIssue(
  text: string,
  min: number | null,
  max: number | null,
): null | { kind: "short" | "long"; by: number } {
  return wordCountIssue(essayWordCount(text), min, max);
}

function wordCountIssue(words: number, min: number | null, max: number | null) {
  if (min !== null && words < min) return { kind: "short" as const, by: min - words };
  if (max !== null && words > max) return { kind: "long" as const, by: words - max };
  return null;
}

function workFor(part: AssignmentPart, works: PartWork[]): PartWork | undefined {
  return works.find((w) => w.partId === part.id);
}

/**
 * Done: video 90% watched with every question answered; essay handed in, or a
 * draft within range; forum posted.
 */
export function partDone(part: AssignmentPart, work: PartWork | undefined): boolean {
  if (work === undefined) return false;
  switch (part.kind) {
    case "VIDEO": {
      const v = work.video;
      return v !== undefined && isWatched(v.watchedSeconds, v.durationSeconds) && v.answered >= v.questionCount;
    }
    case "ESSAY": {
      // A handed-in essay (SUBMITTED, REVIEWED) is done whatever its range says
      // now: a range changed after the hand-in never reopens it (spec, "Admin
      // changes after students started"), and it is locked, so the student
      // could not fix it anyway. A draft counts once it is inside the range, so
      // Submit can unlock, since Submit is what hands essays in. A returned
      // essay is not done until it is handed in again.
      const e = work.essay;
      if (e === undefined || e.reviewStatus === "RETURNED") return false;
      if (e.reviewStatus === "SUBMITTED" || e.reviewStatus === "REVIEWED") return true;
      return e.wordCount > 0 && wordCountIssue(e.wordCount, part.minWords, part.maxWords) === null;
    }
    case "FORUM":
      return work.forum?.posted === true;
  }
}

export function partsLeft(parts: AssignmentPart[], works: PartWork[]): number {
  return parts.filter((p) => !partDone(p, workFor(p, works))).length;
}

export function canSubmit(parts: AssignmentPart[], works: PartWork[]): boolean {
  return parts.length > 0 && partsLeft(parts, works) === 0;
}

function leftName(part: AssignmentPart, work: PartWork | undefined): string {
  if (part.kind === "FORUM") return "the forum post";
  if (part.kind === "ESSAY") return "the essay";
  const v = work?.video;
  const duration = v?.durationSeconds ?? part.durationSeconds;
  const minutes = Math.max(0, Math.ceil((WATCHED_FRACTION * duration - (v?.watchedSeconds ?? 0)) / 60));
  return minutes > 0 ? `${part.title} (${minutes} min left)` : `${part.title} (questions left)`;
}

/** "Finish A (12 min left) and the forum post to submit", or null when nothing blocks. */
export function submitBlockerLine(parts: AssignmentPart[], works: PartWork[]): string | null {
  const essays = parts.filter((p) => p.kind === "ESSAY").length;
  let essayNo = 0;
  const names: string[] = [];
  for (const part of parts) {
    const n = part.kind === "ESSAY" ? ++essayNo : 0;
    const work = workFor(part, works);
    if (partDone(part, work)) continue;
    names.push(part.kind === "ESSAY" && essays > 1 ? `the essay ${n}` : leftName(part, work));
  }
  if (names.length === 0) return null;
  const joined = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `Finish ${joined} to submit`;
}

/**
 * Outstanding = the student still owes something: not handed in, parts left,
 * or a reviewer returned work. One definition for the dashboard count and the
 * server-side summary.
 */
export function isAssignmentOutstanding(a: {
  submittedAt: string | null;
  partsLeft: number;
  returned: boolean;
}): boolean {
  return a.submittedAt === null || a.partsLeft > 0 || a.returned;
}
