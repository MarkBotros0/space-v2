import { blanksInline, directionRuns, splitBlanks } from "../screens/quiz-detail/blank-segments";

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

describe("directionRuns", () => {
  it("keeps an English name inside an Arabic sentence as one ltr run, in order", () => {
    expect(directionRuns("زرت مدينة New York في الصيف", "rtl")).toEqual([
      { text: "زرت", dir: "rtl" },
      { text: "مدينة", dir: "rtl" },
      { text: "New York", dir: "ltr" },
      { text: "في", dir: "rtl" },
      { text: "الصيف", dir: "rtl" },
    ]);
  });

  it("keeps an Arabic phrase inside an English sentence as one rtl run", () => {
    expect(directionRuns("The word محبة كبيرة means great love", "ltr")).toEqual([
      { text: "The", dir: "ltr" },
      { text: "word", dir: "ltr" },
      { text: "محبة كبيرة", dir: "rtl" },
      { text: "means", dir: "ltr" },
      { text: "great", dir: "ltr" },
      { text: "love", dir: "ltr" },
    ]);
  });

  it("joins digits and punctuation to the run before them, or the sentence's when first", () => {
    expect(directionRuns("12 سنة في New York 2026 .", "rtl")).toEqual([
      { text: "12", dir: "rtl" },
      { text: "سنة", dir: "rtl" },
      { text: "في", dir: "rtl" },
      { text: "New York 2026 .", dir: "ltr" },
    ]);
  });
});
