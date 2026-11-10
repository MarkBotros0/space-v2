import { mergeIntervals, watchedSeconds } from "../../../../../packages/shared/src/index";

type Interval = [number, number];

/** What is stored for one student's watching of one video part. */
export interface WatchState {
  intervals: Interval[];
  furthestSeconds: number;
  lastReportAt: Date | null;
}

interface WatchReport {
  intervals: Interval[];
  position: number;
}

interface PartRules {
  durationSeconds: number;
  blockSkipping: boolean;
}

/** A first report counts at most this much, however much it claims. */
const FIRST_REPORT_MAX = 60;
/** Slack on top of the wall-clock time since the last report. */
const CLOCK_SLACK = 2;
/** With skipping blocked, a range may start this far past the furthest point. */
const SKIP_TOLERANCE = 5;

/** The parts of `range` that `have` doesn't cover, in order. */
function uncovered([from, to]: Interval, have: Interval[]): Interval[] {
  const out: Interval[] = [];
  let cursor = from;
  for (const [s, e] of have) {
    if (e <= cursor) continue;
    if (s >= to) break;
    if (s > cursor) out.push([cursor, s]);
    cursor = Math.max(cursor, e);
  }
  if (cursor < to) out.push([cursor, to]);
  return out;
}

/** Whole seconds inside the video. */
function clampRange([from, to]: Interval, duration: number): Interval | null {
  const end = duration > 0 ? Math.min(Math.ceil(to), duration) : Math.ceil(to);
  const start = Math.max(0, Math.floor(from));
  return start < end ? [start, end] : null;
}

/** How many new seconds this report may add: wall-clock time since the last one, plus slack. */
function allowanceFor(state: WatchState, now: Date): number {
  if (state.lastReportAt === null) return FIRST_REPORT_MAX;
  const elapsed = (now.getTime() - state.lastReportAt.getTime()) / 1000;
  return Math.max(0, Math.floor(elapsed + CLOCK_SLACK));
}

/**
 * Merges one progress report into a student's watching of a video part.
 *
 * Only time that could have played counts: the new watched time is clamped to
 * the wall-clock time since the last report plus 2 s (a first report, to the
 * span it reports, at most 60 s), taking the earliest unwatched seconds first.
 * A stretch watched again counts once. With `blockSkipping`, a range starting
 * more than 5 s past the furthest point reached is dropped, and the reported
 * position never moves the furthest point; without it, the position does (the
 * student reached the end, but did not watch it).
 *
 * The slack is borrowed, not given: when a report uses it, `lastReportAt` moves
 * past `now` by what it used, so reporting often never earns more than the
 * clock allows.
 */
export function applyWatchReport(state: WatchState, report: WatchReport, part: PartRules, now: Date) {
  let budget = allowanceFor(state, now);
  const ranges = report.intervals
    .map((r) => clampRange(r, part.durationSeconds))
    .filter((r): r is Interval => r !== null)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  let have = mergeIntervals(state.intervals, []);
  let furthest = state.furthestSeconds;
  let credited = 0;
  for (const range of ranges) {
    if (budget <= 0) break;
    if (part.blockSkipping && range[0] > furthest + SKIP_TOLERANCE) continue;
    let reached = range[1];
    for (const [s, e] of uncovered(range, have)) {
      const take = Math.min(e - s, budget);
      have = mergeIntervals(have, [[s, s + take]]);
      budget -= take;
      credited += take;
      if (take < e - s) {
        reached = s + take;
        break;
      }
    }
    furthest = Math.max(furthest, reached);
  }
  if (!part.blockSkipping) {
    const position = part.durationSeconds > 0 ? Math.min(report.position, part.durationSeconds) : report.position;
    furthest = Math.max(furthest, position);
  }

  const elapsed = state.lastReportAt === null ? credited : (now.getTime() - state.lastReportAt.getTime()) / 1000;
  const borrowed = Math.max(0, credited - elapsed);
  return {
    intervals: have,
    watchedSeconds: watchedSeconds(have),
    furthestSeconds: furthest,
    lastReportAt: new Date(now.getTime() + borrowed * 1000),
  };
}
