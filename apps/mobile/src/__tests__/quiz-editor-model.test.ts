import { quizQuestionRequestSchema } from "@space/shared";

import {
  emptyDraft,
  fieldErrors,
  fromAuthoring,
  blankContext,
  insertBlank,
  insertBlankWithAnswer,
  questionSummary,
  switchType,
  syncBlankAnswers,
} from "../screens/quiz-edit/editors/editor-model";
import { readablePrompt } from "../screens/quiz-detail/blank-segments";

describe("insertBlank", () => {
  it("puts the blank token at the cursor and moves the cursor after it", () => {
    expect(insertBlank("The sky is .", 11)).toEqual({ prompt: "The sky is {{blank}}.", cursor: 20 });
  });

  it("clamps a cursor past the end to the end", () => {
    expect(insertBlank("Hi ", 99)).toEqual({ prompt: "Hi {{blank}}", cursor: 12 });
  });
});

describe("readablePrompt", () => {
  it("numbers the blanks for reading", () => {
    expect(readablePrompt("In the {{blank}} was the {{blank}}.")).toBe("In the (1) was the (2).");
  });
});

describe("insertBlankWithAnswer", () => {
  it("puts the new blank's empty answer at its place, so the key does not shift", () => {
    expect(insertBlankWithAnswer("A {{blank}} B", 0, ["x"])).toEqual({
      prompt: "{{blank}}A {{blank}} B",
      cursor: 9,
      answers: ["", "x"],
    });
    expect(insertBlankWithAnswer("A {{blank}} B", 13, ["x"]).answers).toEqual(["x", ""]);
  });
});

describe("blankContext", () => {
  it("names the words before each gap", () => {
    const prompt = "{{blank}} In the very first {{blank}}{{blank}}";
    expect(blankContext(prompt, 0)).toBe("at the start");
    expect(blankContext(prompt, 1)).toBe('after "the very first"');
    expect(blankContext(prompt, 2)).toBe("right after the previous blank");
  });
});

describe("syncBlankAnswers", () => {
  it("grows to one answer per blank, keeping the existing ones by index", () => {
    expect(syncBlankAnswers("{{blank}} and {{blank}} and {{blank}}", ["a"])).toEqual(["a", "", ""]);
  });

  it("shrinks when a blank is removed", () => {
    expect(syncBlankAnswers("Only {{blank}} here", ["a", "b", "c"])).toEqual(["a"]);
    expect(syncBlankAnswers("No gaps", ["a"])).toEqual([]);
  });
});

describe("switchType", () => {
  it("SINGLE to MULTI keeps the prompt, the points and the option labels", () => {
    const single = {
      type: "SINGLE_CHOICE" as const,
      prompt: "Pick",
      points: 3,
      options: [
        { label: "A", isCorrect: true },
        { label: "B", isCorrect: false },
        { label: "C", isCorrect: false },
      ],
    };
    const multi = switchType(single, "MULTI_CHOICE");
    expect(multi).toEqual({ ...single, type: "MULTI_CHOICE" });
  });

  it("pads to multiple choice's minimum of three options", () => {
    const single = { ...emptyDraft("SINGLE_CHOICE"), prompt: "Pick" };
    const multi = switchType(single, "MULTI_CHOICE");
    expect(multi.type === "MULTI_CHOICE" && multi.options.length).toBe(3);
  });

  it("MULTI to SINGLE keeps the labels and clears the marks when more than one was correct", () => {
    const multi = {
      type: "MULTI_CHOICE" as const,
      prompt: "Pick",
      points: 2,
      options: [
        { label: "A", isCorrect: true },
        { label: "B", isCorrect: true },
        { label: "C", isCorrect: false },
      ],
    };
    expect(switchType(multi, "SINGLE_CHOICE")).toEqual({
      type: "SINGLE_CHOICE",
      prompt: "Pick",
      points: 2,
      options: [
        { label: "A", isCorrect: false },
        { label: "B", isCorrect: false },
        { label: "C", isCorrect: false },
      ],
    });
  });

  it("to any other type keeps only the prompt and points", () => {
    const single = { ...emptyDraft("SINGLE_CHOICE"), prompt: "Pick", points: 4 };
    expect(switchType(single, "ESSAY")).toEqual({ type: "ESSAY", prompt: "Pick", points: 4 });
    expect(switchType(single, "MATCHING")).toEqual({ ...emptyDraft("MATCHING"), prompt: "Pick", points: 4 });
  });

  it("to fill in the blank gives one answer per blank already in the prompt", () => {
    const essay = { type: "ESSAY" as const, prompt: "A {{blank}} B {{blank}}", points: 1 };
    expect(switchType(essay, "FILL_BLANK")).toEqual({ ...essay, type: "FILL_BLANK", answers: ["", ""] });
  });
});

describe("fromAuthoring", () => {
  it("turns each authoring read into the request the editor sends back", () => {
    expect(
      fromAuthoring({
        id: 1,
        order: 0,
        type: "FILL_BLANK",
        prompt: "{{blank}} then {{blank}}",
        points: 2,
        blanks: [
          { id: 9, position: 1, expected: "second" },
          { id: 8, position: 0, expected: "first" },
        ],
      }),
    ).toEqual({ type: "FILL_BLANK", prompt: "{{blank}} then {{blank}}", points: 2, answers: ["first", "second"] });
    expect(
      fromAuthoring({
        id: 2,
        order: 1,
        type: "MATCHING",
        prompt: "Match",
        points: 1,
        pairs: [{ leftId: 1, left: "a", rightId: 2, right: "b" }],
      }),
    ).toEqual({ type: "MATCHING", prompt: "Match", points: 1, pairs: [{ left: "a", right: "b" }] });
  });
});

describe("fieldErrors", () => {
  it("keys the schema's first message per field path", () => {
    const parsed = quizQuestionRequestSchema.safeParse({
      type: "MATCHING",
      prompt: "Match",
      points: 1,
      pairs: [
        { left: "a", right: "x" },
        { left: "a", right: "y" },
      ],
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(fieldErrors(parsed.error.issues).pairs).toBe("Each left item must differ.");
  });
});

describe("questionSummary", () => {
  it("names the type and counts what the question holds", () => {
    expect(
      questionSummary({
        id: 1,
        order: 0,
        type: "MATCHING",
        prompt: "M",
        points: 1,
        pairs: [1, 2, 3, 4, 5].map((n) => ({ leftId: n, left: `l${n}`, rightId: n + 10, right: `r${n}` })),
      }),
    ).toEqual({ type: "Matching", count: "5 pairs", key: null });
    expect(
      questionSummary({
        id: 2,
        order: 1,
        type: "SINGLE_CHOICE",
        prompt: "S",
        points: 1,
        options: [
          { id: 1, label: "A", isCorrect: false },
          { id: 2, label: "B", isCorrect: true },
          { id: 3, label: "C", isCorrect: false },
          { id: 4, label: "D", isCorrect: false },
        ],
      }),
    ).toEqual({ type: "Single choice", count: "4 options", key: "B" });
    expect(
      questionSummary({
        id: 3,
        order: 2,
        type: "FILL_BLANK",
        prompt: "{{blank}} {{blank}}",
        points: 1,
        blanks: [
          { id: 1, position: 0, expected: "a" },
          { id: 2, position: 1, expected: "b" },
        ],
      }),
    ).toEqual({ type: "Fill in the blank", count: "2 blanks", key: null });
    expect(questionSummary({ id: 4, order: 3, type: "TRUE_FALSE", prompt: "T", points: 1, correct: false })).toEqual({
      type: "True or false",
      count: null,
      key: "False",
    });
  });
});
