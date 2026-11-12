import { seasonOverviewModel } from "../screens/season/overview-model";

const season = (over: Partial<Parameters<typeof seasonOverviewModel>[0]> = {}) => ({
  status: "ACTIVE" as const,
  endDate: "2026-06-30T00:00:00.000Z",
  canAdminister: true,
  sessionCount: 3,
  ...over,
});
const keys = (m: ReturnType<typeof seasonOverviewModel>) => m.tiles.map((t) => t.key);

describe("seasonOverviewModel", () => {
  it("is past its end only from the day after the end date, by the given day", () => {
    expect(seasonOverviewModel(season(), { isSuper: false, today: "2026-06-30" }).pastEnd).toBe(false);
    expect(seasonOverviewModel(season(), { isSuper: false, today: "2026-07-01" }).pastEnd).toBe(true);
    expect(seasonOverviewModel(season({ status: "DRAFT" }), { isSuper: false, today: "2026-07-01" }).pastEnd).toBe(
      false,
    );
  });

  it("moves End season from a tile to the next step once the end date has passed", () => {
    const running = seasonOverviewModel(season(), { isSuper: false, today: "2026-06-01" });
    expect(keys(running)).toEqual(["sessions", "assignments", "quizzes", "passing", "end"]);
    expect(running.nextStep).toBeNull();
    const overdue = seasonOverviewModel(season(), { isSuper: false, today: "2026-07-01" });
    expect(keys(overdue)).toEqual(["sessions", "assignments", "quizzes", "passing"]);
    expect(overdue.nextStep).toMatchObject({ key: "end", tone: "warn", actionLabel: "End season" });
  });

  it("locks a finished season, gives its admin and a Super its Results, and only a Super Duplicate", () => {
    const finished = season({ status: "COMPLETED" });
    const admin = seasonOverviewModel(finished, { isSuper: false, today: "2026-07-01" });
    expect(admin).toMatchObject({ finished: true, canAdminister: false, manage: false, nextStep: null });
    expect(keys(admin)).toEqual(["sessions", "results"]);
    const other = seasonOverviewModel({ ...finished, canAdminister: false }, { isSuper: false, today: "2026-07-01" });
    expect(keys(other)).toEqual(["sessions"]);
    const sup = seasonOverviewModel(finished, { isSuper: true, today: "2026-07-01" });
    expect(keys(sup)).toEqual(["sessions", "results"]);
    expect(sup.nextStep?.key).toBe("duplicate");
  });

  it("lets a Super manage a season the server says they don't administer, and offers Start on a draft", () => {
    const m = seasonOverviewModel(season({ status: "DRAFT", canAdminister: false }), {
      isSuper: true,
      today: "2026-06-01",
    });
    expect(m).toMatchObject({ canAdminister: false, manage: true });
    expect(keys(m)).toEqual(["sessions", "assignments", "quizzes"]);
    expect(m.nextStep?.key).toBe("start");
  });

  it("says None yet on Sessions with no sessions", () => {
    expect(seasonOverviewModel(season({ sessionCount: 0 }), { isSuper: false, today: "2026-06-01" }).tiles[0]).toEqual({
      key: "sessions",
      label: "Sessions",
      hint: "None yet",
    });
  });
  it("the Passing tile shows for staff on an active season only", () => {
    const passing = (m: ReturnType<typeof seasonOverviewModel>) => m.tiles.find((t) => t.key === "passing");
    const day = { today: "2026-06-01" };
    expect(passing(seasonOverviewModel(season(), { isSuper: false, ...day }))).toEqual({
      key: "passing",
      label: "Passing",
      hint: "Who is on track",
    });
    expect(passing(seasonOverviewModel(season({ canAdminister: false }), { isSuper: true, ...day }))).toBeDefined();
    // A leader of the season sees it; they don't manage, so it is their only tile beside Sessions.
    const leader = seasonOverviewModel(season({ canAdminister: false }), { isSuper: false, leads: true, ...day });
    expect(keys(leader)).toEqual(["sessions", "passing"]);
    // Anyone else on the season, and every draft or finished season: no tile.
    expect(passing(seasonOverviewModel(season({ canAdminister: false }), { isSuper: false, ...day }))).toBeUndefined();
    for (const status of ["DRAFT", "COMPLETED"] as const) {
      expect(passing(seasonOverviewModel(season({ status }), { isSuper: true, leads: true, ...day }))).toBeUndefined();
    }
    // It stays after the end date, while End season moves to the next step.
    expect(keys(seasonOverviewModel(season(), { isSuper: false, today: "2026-07-01" }))).toContain("passing");
  });
});
