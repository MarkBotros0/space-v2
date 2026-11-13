import { applyWatchReport, type WatchState } from "../lib/video-quiz/part-watching";

const part = { durationSeconds: 600, blockSkipping: false };
const t0 = new Date("2099-01-01T10:00:00.000Z");
const at = (seconds: number) => new Date(t0.getTime() + seconds * 1000);
const fresh: WatchState = { intervals: [], furthestSeconds: 0, lastReportAt: null };

describe("applyWatchReport", () => {
  it("counts a first report up to 25 s, earliest seconds first", () => {
    const out = applyWatchReport(fresh, { intervals: [[0, 300]], position: 300 }, part, t0);
    expect(out.intervals).toEqual([[0, 25]]);
    expect(out.watchedSeconds).toBe(25);
  });

  it("counts watching at 2x in full: 20 s of video in 10 s of clock", () => {
    const state = { intervals: [[0, 20]] as [number, number][], furthestSeconds: 20, lastReportAt: t0 };
    const out = applyWatchReport(state, { intervals: [[20, 40]], position: 40 }, part, at(10));
    expect(out.watchedSeconds).toBe(40);
  });

  it("never counts faster than 2x", () => {
    const state = { intervals: [[0, 20]] as [number, number][], furthestSeconds: 20, lastReportAt: t0 };
    const out = applyWatchReport(state, { intervals: [[20, 60]], position: 60 }, part, at(10));
    expect(out.watchedSeconds).toBe(20 + 2 * 10 + 2);
  });

  it("fills only the gaps of what is already watched", () => {
    const state = { intervals: [[10, 20]] as [number, number][], furthestSeconds: 20, lastReportAt: t0 };
    const out = applyWatchReport(state, { intervals: [[0, 30]], position: 30 }, part, at(30));
    expect(out.intervals).toEqual([[0, 30]]);
    expect(out.watchedSeconds).toBe(30);
  });

  it("lends the 2 s slack rather than giving it: frequent reports never outrun the clock", () => {
    let state: WatchState = { intervals: [[0, 10]], furthestSeconds: 10, lastReportAt: t0 };
    let position = 10;
    // Thirty reports one second apart, each claiming three seconds (faster than 2x).
    for (let i = 1; i <= 30; i += 1) {
      const out = applyWatchReport(
        state,
        { intervals: [[position, position + 3]], position: position + 3 },
        part,
        at(i),
      );
      position += 3;
      state = out;
    }
    // 30 s of wall clock at 2x plus one 2 s loan, not 90 s.
    expect(state.intervals.reduce((s, [a, b]) => s + b - a, 0)).toBeLessThanOrEqual(10 + 60 + 2);
  });

  it("clamps ranges to the video and ignores the position when skipping is blocked", () => {
    const blocked = { durationSeconds: 600, blockSkipping: true };
    const state = { intervals: [[0, 100]] as [number, number][], furthestSeconds: 100, lastReportAt: t0 };
    const out = applyWatchReport(
      state,
      {
        intervals: [
          [104, 110],
          [590, 700],
        ],
        position: 700,
      },
      blocked,
      at(60),
    );
    expect(out.intervals).toEqual([
      [0, 100],
      [104, 110],
    ]);
    expect(out.furthestSeconds).toBe(110);
  });

  it("with skipping blocked later, a furthest point reached by skipping is no head start", () => {
    const blocked = { durationSeconds: 600, blockSkipping: true };
    // Skipped to the end while skipping was allowed; 100 s actually watched.
    const state = { intervals: [[0, 100]] as [number, number][], furthestSeconds: 600, lastReportAt: t0 };
    const out = applyWatchReport(state, { intervals: [[500, 520]], position: 520 }, blocked, at(60));
    expect(out.intervals).toEqual([[0, 100]]);
    expect(out.furthestSeconds).toBe(100);
  });
});
