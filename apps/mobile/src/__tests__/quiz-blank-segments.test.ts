import { blanksInline, splitBlanks } from "../screens/quiz-detail/blank-segments";

describe("splitBlanks", () => {
  it("splits a sentence into text runs and numbered blanks", () => {
    expect(splitBlanks("a {{blank}} b {{blank}}")).toEqual([
      { kind: "text", text: "a " },
      { kind: "blank", index: 0 },
      { kind: "text", text: " b " },
      { kind: "blank", index: 1 },
    ]);
  });

  it("gives a prompt that is only a gap one blank and no empty text", () => {
    expect(splitBlanks("{{blank}}")).toEqual([{ kind: "blank", index: 0 }]);
  });

  it("keeps a prompt with no gap as one text run", () => {
    expect(splitBlanks("No gap here.")).toEqual([{ kind: "text", text: "No gap here." }]);
  });

  it("numbers blanks in an Arabic sentence in reading order", () => {
    expect(splitBlanks("عاصمة مصر {{blank}} وعاصمة فرنسا {{blank}}.")).toEqual([
      { kind: "text", text: "عاصمة مصر " },
      { kind: "blank", index: 0 },
      { kind: "text", text: " وعاصمة فرنسا " },
      { kind: "blank", index: 1 },
      { kind: "text", text: "." },
    ]);
  });
});

describe("blanksInline", () => {
  it("puts gaps inline on a 360dp phone at the default font size", () => {
    expect(blanksInline({ width: 360, fontScale: 1 })).toBe(true);
    expect(blanksInline({ width: 390, fontScale: 1.15 })).toBe(true);
  });

  it("falls back to labelled fields below 360dp or above font scale 1.15", () => {
    expect(blanksInline({ width: 359, fontScale: 1 })).toBe(false);
    expect(blanksInline({ width: 390, fontScale: 1.3 })).toBe(false);
  });
});
