import {
  FINISHED_SEASON_STATUSES,
  LIVE_SEASON_STATUSES,
  isSeasonFinished,
  isSeasonLive,
  seasonStatusSchema,
} from "../enums";

describe("season status sets", () => {
  it("splits every status into exactly one of live and finished", () => {
    const all = [...LIVE_SEASON_STATUSES, ...FINISHED_SEASON_STATUSES].sort();
    expect(all).toEqual([...seasonStatusSchema.options].sort());
  });

  it.each([
    ["DRAFT", true, false],
    ["ACTIVE", true, false],
    ["COMPLETED", false, true],
    ["ARCHIVED", false, true],
  ] as const)("%s: live %s, finished %s", (status, live, finished) => {
    expect(isSeasonLive(status)).toBe(live);
    expect(isSeasonFinished(status)).toBe(finished);
  });

  it("treats a missing season as neither", () => {
    expect(isSeasonLive(null)).toBe(false);
    expect(isSeasonFinished(undefined)).toBe(false);
  });
});
