import { leaveVideoNotice, watchedRun } from "../screens/assignment-detail/leave-video-notice";

const NBSP = "\u00a0";
const watching = (over: Partial<Parameters<typeof leaveVideoNotice>[0]> = {}) => ({
  watchedSeconds: 360,
  durationSeconds: 1080,
  furthestSeconds: 360,
  blockSkipping: true,
  ...over,
});

describe("watchedRun", () => {
  it("is one unbreakable run: '6 min of 18 min'", () => {
    expect(watchedRun(360, 1080)).toBe(`6${NBSP}min${NBSP}of${NBSP}18${NBSP}min`);
  });

  it("counts seconds, so it moves from the first seconds of a long video", () => {
    expect(watchedRun(37, 3509)).toBe(`37${NBSP}sec${NBSP}of${NBSP}58${NBSP}min`);
    expect(watchedRun(125.6, 3509)).toBe(`2${NBSP}min${NBSP}5${NBSP}sec${NBSP}of${NBSP}58${NBSP}min`);
    expect(watchedRun(3840, 7200)).toBe(`1${NBSP}h${NBSP}4${NBSP}min${NBSP}of${NBSP}120${NBSP}min`);
  });

  it("rounds a short video up to a minute and never says 0 of 0", () => {
    expect(watchedRun(10, 20)).toBe(`10${NBSP}sec${NBSP}of${NBSP}1${NBSP}min`);
  });
});

describe("leaveVideoNotice", () => {
  it("shows Not finished yet with the minutes watched while the video doesn't count", () => {
    expect(leaveVideoNotice(watching())).toEqual({
      title: "Not finished yet",
      body: `${watchedRun(360, 1080)} watched. You can't submit until you've watched it.`,
    });
  });

  it("is null once the video counts as watched (90%)", () => {
    expect(leaveVideoNotice(watching({ watchedSeconds: 972 }))).toBeNull();
    expect(leaveVideoNotice(watching({ watchedSeconds: 971 }))).not.toBeNull();
  });

  it("says the skipped parts don't count when the student jumped ahead", () => {
    const notice = leaveVideoNotice(watching({ blockSkipping: false, furthestSeconds: 1080 }));
    expect(notice?.body).toBe(
      `${watchedRun(360, 1080)} watched. The parts you skipped don't count. You can't submit until you've watched it.`,
    );
  });

  it("with skipping blocked, never talks about skipping", () => {
    expect(leaveVideoNotice(watching({ furthestSeconds: 1080 }))?.body).not.toMatch(/skipped/);
  });

  it("is null while the video's length isn't known", () => {
    expect(leaveVideoNotice(watching({ durationSeconds: 0 }))).toBeNull();
  });
});
