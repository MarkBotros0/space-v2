import { directionStyle } from "../design/lib/text-direction";
import { videoHeight } from "../design/lib/video-size";
import { finishedPercent, shownChips } from "../screens/assignment-detail/progress-model";

describe("assignment page redesign (owner, 2026-11-13)", () => {
  it("hides a row's chips while every part is untouched", () => {
    const untouched = [
      { tone: "neutral", label: "Video: not started" },
      { tone: "neutral", label: "Essay: not handed in" },
    ] as const;
    expect(shownChips([...untouched])).toEqual([]);
    const started = [{ tone: "warn", label: "Video 6/18 min" } as const, untouched[1]];
    expect(shownChips([...started])).toEqual(started);
  });

  it("gives the share finished as a whole percent", () => {
    expect(finishedPercent(0, 0)).toBe(0);
    expect(finishedPercent(1, 3)).toBe(33);
    expect(finishedPercent(45, 45)).toBe(100);
  });

  it("sizes the video preview 16:9 from its width", () => {
    expect(videoHeight(0)).toBe(180);
    expect(videoHeight(320)).toBe(180);
    expect(videoHeight(361)).toBe(203);
  });

  it("sets Arabic lines right to left and leaves English alone", () => {
    expect(directionStyle("Week 1 quiz")).toBeUndefined();
    expect(directionStyle("منز وسوو")).toMatchObject({ writingDirection: "rtl", textAlign: "right" });
  });
});
