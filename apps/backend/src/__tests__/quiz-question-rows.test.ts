import type { QuizQuestionInput } from "../../../../packages/shared/src/index";
import { quizQuestionRequestSchema } from "../../../../packages/shared/src/index";
import { questionRowsFor, toAuthoringQuestion, type AuthoringQuestionRow } from "../lib/quizzes/question-rows";

const parse = (input: QuizQuestionInput) => quizQuestionRequestSchema.parse(input);

/** Stands in for the database: ids by index, a LEFT row's matchId resolved from its matchKey. */
function rowOf(input: ReturnType<typeof parse>): AuthoringQuestionRow {
  const { options, blanks } = questionRowsFor(input);
  const idAt = (i: number) => 100 + i;
  const rightIdFor = (key: number | undefined) => {
    const at = options.findIndex((o) => o.side === "RIGHT" && o.matchKey === key);
    return key === undefined || at < 0 ? null : idAt(at);
  };
  return {
    id: 1,
    order: 0,
    type: input.type,
    prompt: input.prompt,
    points: input.points,
    quizOptions: options.map((o, i) => ({
      id: idAt(i),
      position: o.position,
      label: o.label,
      isCorrect: o.isCorrect,
      side: o.side,
      matchId: o.side === "LEFT" ? rightIdFor(o.matchKey) : null,
    })),
    quizBlanks: blanks.map((b, i) => ({ id: 200 + i, position: b.position, expected: b.expected })),
  };
}

describe("questionRowsFor", () => {
  it("TRUE_FALSE yields True and False, marking the right one", () => {
    const yes = questionRowsFor(parse({ type: "TRUE_FALSE", prompt: "Sky is blue", points: 1, correct: true }));
    expect(yes.options.map((o) => [o.label, o.isCorrect])).toEqual([
      ["True", true],
      ["False", false],
    ]);
    const no = questionRowsFor(parse({ type: "TRUE_FALSE", prompt: "Sky is green", points: 1, correct: false }));
    expect(no.options.map((o) => [o.label, o.isCorrect])).toEqual([
      ["True", false],
      ["False", true],
    ]);
  });

  it("MATCHING yields LEFT rows then RIGHT rows linked by matchKey", () => {
    const { options, blanks } = questionRowsFor(
      parse({
        type: "MATCHING",
        prompt: "Match them",
        points: 3,
        pairs: [
          { left: "a", right: "1" },
          { left: "b", right: "2" },
          { left: "c", right: "3" },
        ],
      }),
    );
    expect(blanks).toEqual([]);
    expect(options.map((o) => [o.position, o.side, o.label, o.matchKey])).toEqual([
      [0, "LEFT", "a", 0],
      [1, "LEFT", "b", 1],
      [2, "LEFT", "c", 2],
      [3, "RIGHT", "1", 0],
      [4, "RIGHT", "2", 1],
      [5, "RIGHT", "3", 2],
    ]);
    expect(options.every((o) => o.isCorrect === false)).toBe(true);
  });

  it("FILL_BLANK yields blanks in order and no options", () => {
    const { options, blanks } = questionRowsFor(
      parse({ type: "FILL_BLANK", prompt: "{{blank}} and {{blank}}", points: 2, answers: ["x", "y"] }),
    );
    expect(options).toEqual([]);
    expect(blanks).toEqual([
      { position: 0, expected: "x" },
      { position: 1, expected: "y" },
    ]);
  });

  it("choice types keep option order and correctness; ESSAY has no rows", () => {
    const single = questionRowsFor(
      parse({
        type: "SINGLE_CHOICE",
        prompt: "Pick one",
        points: 1,
        options: [
          { label: "no", isCorrect: false },
          { label: "yes", isCorrect: true },
        ],
      }),
    );
    expect(single.options.map((o) => [o.position, o.label, o.isCorrect, o.side])).toEqual([
      [0, "no", false, null],
      [1, "yes", true, null],
    ]);
    expect(questionRowsFor(parse({ type: "ESSAY", prompt: "Discuss it", points: 5 }))).toEqual({
      options: [],
      blanks: [],
    });
  });
});

describe("toAuthoringQuestion", () => {
  it("round-trips SINGLE_CHOICE and MULTI_CHOICE", () => {
    const single = parse({
      type: "SINGLE_CHOICE",
      prompt: "Pick one",
      points: 2,
      options: [
        { label: "a", isCorrect: false },
        { label: "b", isCorrect: true },
      ],
    });
    const outSingle = toAuthoringQuestion(rowOf(single));
    if (outSingle.type !== "SINGLE_CHOICE") throw new Error("wrong type");
    expect(outSingle).toMatchObject({ points: 2, order: 0, prompt: "Pick one" });
    expect(outSingle.options.map((o) => ({ label: o.label, isCorrect: o.isCorrect }))).toEqual(
      single.type === "SINGLE_CHOICE" ? single.options : [],
    );

    const multi = parse({
      type: "MULTI_CHOICE",
      prompt: "Pick some",
      points: 3,
      options: [
        { label: "a", isCorrect: true },
        { label: "b", isCorrect: true },
        { label: "c", isCorrect: false },
      ],
    });
    const outMulti = toAuthoringQuestion(rowOf(multi));
    if (outMulti.type !== "MULTI_CHOICE") throw new Error("wrong type");
    expect(outMulti.options.map((o) => ({ label: o.label, isCorrect: o.isCorrect }))).toEqual(
      multi.type === "MULTI_CHOICE" ? multi.options : [],
    );
  });

  it("round-trips TRUE_FALSE", () => {
    for (const correct of [true, false]) {
      const input = parse({ type: "TRUE_FALSE", prompt: "Statement", points: 1, correct });
      expect(toAuthoringQuestion(rowOf(input))).toEqual({
        id: 1,
        order: 0,
        type: "TRUE_FALSE",
        prompt: "Statement",
        points: 1,
        correct,
      });
    }
  });

  it("round-trips MATCHING with each left joined to its own right", () => {
    const pairs = [
      { left: "a", right: "1" },
      { left: "b", right: "2" },
      { left: "c", right: "3" },
    ];
    const out = toAuthoringQuestion(rowOf(parse({ type: "MATCHING", prompt: "Match them", points: 3, pairs })));
    if (out.type !== "MATCHING") throw new Error("wrong type");
    expect(out.pairs.map((p) => ({ left: p.left, right: p.right }))).toEqual(pairs);
    expect(new Set(out.pairs.flatMap((p) => [p.leftId, p.rightId])).size).toBe(6);
  });

  it("round-trips FILL_BLANK as ordered blanks", () => {
    const input = parse({ type: "FILL_BLANK", prompt: "{{blank}} and {{blank}}", points: 2, answers: ["x", "y"] });
    const out = toAuthoringQuestion(rowOf(input));
    if (out.type !== "FILL_BLANK") throw new Error("wrong type");
    expect(out.blanks.map((b) => [b.position, b.expected])).toEqual([
      [0, "x"],
      [1, "y"],
    ]);
  });

  it("round-trips ESSAY", () => {
    const input = parse({ type: "ESSAY", prompt: "Discuss it", points: 5 });
    expect(toAuthoringQuestion(rowOf(input))).toEqual({
      id: 1,
      order: 0,
      type: "ESSAY",
      prompt: "Discuss it",
      points: 5,
    });
  });

  it("refuses a legacy MCQ row rather than guessing its shape", () => {
    const row = { ...rowOf(parse({ type: "ESSAY", prompt: "Discuss it", points: 5 })), type: "MCQ" as const };
    expect(() => toAuthoringQuestion(row)).toThrow(/legacy/i);
  });
});
