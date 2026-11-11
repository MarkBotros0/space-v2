import { timingBody, timingDraft } from "../screens/quiz-edit/timing-values";

describe("timingBody", () => {
  it("an unchanged window whose stored ends carry seconds sends nothing", () => {
    // The sheet shows minutes; a value written by the API or the sweep seed has seconds.
    const saved = {
      startsFrom: "2026-11-14T09:00:37.512Z",
      startsUntil: "2026-11-14T18:30:59.000Z",
      timeLimitMinutes: 20,
    };
    expect(timingBody(timingDraft(saved), saved, false)).toEqual({});
  });

  it("a window moved by a minute still sends both ends", () => {
    const saved = { startsFrom: "2026-11-14T09:00:37.000Z", startsUntil: null, timeLimitMinutes: null };
    const draft = timingDraft(saved);
    const moved = { ...draft, from: { day: draft.from!.day, time: "23:59" } };
    expect(Object.keys(timingBody(moved, saved, false))).toEqual(["startsFrom", "startsUntil"]);
  });
});
