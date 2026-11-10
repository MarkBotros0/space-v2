import type { QuizQuestionType } from "../generated/prisma/enums";
import {
  autoMark,
  isAnswered,
  isLeaderMarked,
  leaderMark,
  type MarkableQuestion,
  type StoredAnswer,
} from "../lib/quizzes/marking";

type Opt = MarkableQuestion["options"][number];
const opt = (id: number, isCorrect: boolean, side: Opt["side"] = null, matchId: number | null = null): Opt => ({
  id,
  isCorrect,
  side,
  matchId,
});
const q = (type: QuizQuestionType, points: number, options: Opt[] = [], blankCount = 0): MarkableQuestion => ({
  id: 1,
  type,
  points,
  options,
  blanks: Array.from({ length: blankCount }, (_, i) => ({ id: 100 + i })),
});
const picks = (...ids: number[]): StoredAnswer => ({
  selections: ids.map((optionId) => ({ optionId, matchedOptionId: null })),
  blanks: [],
  text: null,
  isCorrect: null,
});
const pairs = (...p: [number, number | null][]): StoredAnswer => ({
  selections: p.map(([optionId, matchedOptionId]) => ({ optionId, matchedOptionId })),
  blanks: [],
  text: null,
  isCorrect: null,
});
const blanksAns = (...texts: string[]): StoredAnswer => ({
  selections: [],
  blanks: texts.map((text, i) => ({ blankId: 100 + i, text, isCorrect: null })),
  text: null,
  isCorrect: null,
});

describe.each(["SINGLE_CHOICE", "TRUE_FALSE"] as const)("%s autoMark", (type) => {
  const question = q(type, 4, [opt(1, true), opt(2, false)]);
  it("right answer earns the points", () => {
    expect(autoMark(question, picks(1))).toEqual({ pointsAwarded: 4, isCorrect: true });
  });
  it("wrong answer earns 0", () => {
    expect(autoMark(question, picks(2))).toEqual({ pointsAwarded: 0, isCorrect: false });
  });
  it("unanswered earns 0", () => {
    expect(autoMark(question, undefined)).toEqual({ pointsAwarded: 0, isCorrect: false });
  });
});

describe("MULTI_CHOICE autoMark", () => {
  const multi = (points: number, correct: number) =>
    q("MULTI_CHOICE", points, [
      ...Array.from({ length: correct }, (_, i) => opt(i + 1, true)),
      opt(90, false),
      opt(91, false),
    ]);
  it.each([
    [[1, 2, 3], 3, true],
    [[1, 2], 2, false],
    [[1], 1, false],
    [[], 0, false],
    [[1, 2, 3, 90], 3, false],
    [[90], 0, false],
  ])("ticking %j of 3 correct (3 points) earns %s", (ticked, want, isCorrect) => {
    expect(autoMark(multi(3, 3), picks(...ticked))).toEqual({ pointsAwarded: want, isCorrect });
  });
  it("thirds round to 2dp", () => {
    expect(autoMark(multi(1, 3), picks(1)).pointsAwarded).toBe(0.33);
  });
});

describe("MATCHING autoMark", () => {
  const matching = (n: number, points: number) =>
    q(
      "MATCHING",
      points,
      Array.from({ length: n }, (_, i) => opt(i + 1, false, "LEFT", 50 + i + 1)).concat(
        Array.from({ length: n }, (_, i) => opt(50 + i + 1, false, "RIGHT")),
      ),
    );
  it("3 of 5 pairs right on 5 points earns 3", () => {
    const ans = pairs([1, 51], [2, 52], [3, 53], [4, 55], [5, 54]);
    expect(autoMark(matching(5, 5), ans)).toEqual({ pointsAwarded: 3, isCorrect: false });
  });
  it("1 of 3 pairs right on 1 point earns 0.33", () => {
    expect(autoMark(matching(3, 1), pairs([1, 51], [2, 53], [3, 52])).pointsAwarded).toBe(0.33);
  });
  it("all pairs right is correct", () => {
    expect(autoMark(matching(3, 3), pairs([1, 51], [2, 52], [3, 53]))).toEqual({ pointsAwarded: 3, isCorrect: true });
  });
});

describe("isAnswered", () => {
  it("single needs one selection", () => {
    const s = q("SINGLE_CHOICE", 1, [opt(1, true), opt(2, false)]);
    expect(isAnswered(s, picks(1))).toBe(true);
    expect(isAnswered(s, picks())).toBe(false);
    expect(isAnswered(s, undefined)).toBe(false);
  });
  it("multi needs at least one", () => {
    const m = q("MULTI_CHOICE", 1, [opt(1, true), opt(2, true)]);
    expect(isAnswered(m, picks(2))).toBe(true);
    expect(isAnswered(m, picks())).toBe(false);
  });
  it("matching is false with one left unpaired", () => {
    const m = q("MATCHING", 1, [
      opt(1, false, "LEFT", 11),
      opt(2, false, "LEFT", 12),
      opt(11, false, "RIGHT"),
      opt(12, false, "RIGHT"),
    ]);
    expect(isAnswered(m, pairs([1, 11], [2, null]))).toBe(false);
    expect(isAnswered(m, pairs([1, 11]))).toBe(false);
    expect(isAnswered(m, pairs([1, 11], [2, 12]))).toBe(true);
  });
  it("blanks is false when one is whitespace only", () => {
    const b = q("FILL_BLANK", 1, [], 2);
    expect(isAnswered(b, blanksAns("a", "   "))).toBe(false);
    expect(isAnswered(b, blanksAns("a", "b"))).toBe(true);
  });
  it("essay needs non-blank text", () => {
    const e = q("ESSAY", 1);
    expect(isAnswered(e, { ...picks(), text: "  " })).toBe(false);
    expect(isAnswered(e, { ...picks(), text: "hi" })).toBe(true);
  });
});

describe("leader marking", () => {
  it("only FILL_BLANK and ESSAY are leader-marked", () => {
    expect(isLeaderMarked("FILL_BLANK")).toBe(true);
    expect(isLeaderMarked("ESSAY")).toBe(true);
    expect(isLeaderMarked("MATCHING")).toBe(false);
    expect(isLeaderMarked("MCQ")).toBe(false);
  });
  it("FILL_BLANK 3 blanks, 2 right, 3 points earns 2", () => {
    const f = q("FILL_BLANK", 3, [], 3);
    const marks = [
      { blankId: 100, correct: true },
      { blankId: 101, correct: true },
      { blankId: 102, correct: false },
    ];
    expect(leaderMark(f, marks)).toBe(2);
  });
  it("ESSAY wrong earns 0, right earns the points", () => {
    const e = q("ESSAY", 5);
    expect(leaderMark(e, [{ blankId: null, correct: false }])).toBe(0);
    expect(leaderMark(e, [{ blankId: null, correct: true }])).toBe(5);
  });
  it("autoMark throws for ESSAY and FILL_BLANK", () => {
    expect(() => autoMark(q("ESSAY", 1), undefined)).toThrow();
    expect(() => autoMark(q("FILL_BLANK", 1, [], 1), undefined)).toThrow();
  });
});
