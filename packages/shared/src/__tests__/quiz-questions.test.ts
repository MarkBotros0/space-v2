import { BLANK_TOKEN, countBlanks, quizQuestionRequestSchema } from "../index";

const opt = (label: string, isCorrect = false) => ({ label, isCorrect });

describe("quizQuestionRequestSchema", () => {
  it("accepts each type's minimal valid body", () => {
    const bodies = [
      { type: "SINGLE_CHOICE", prompt: "Pick one", points: 1, options: [opt("a", true), opt("b")] },
      { type: "MULTI_CHOICE", prompt: "Pick two", points: 2, options: [opt("a", true), opt("b", true), opt("c")] },
      { type: "TRUE_FALSE", prompt: "The sky is blue", points: 1, correct: true },
      {
        type: "MATCHING",
        prompt: "Match them",
        points: 3,
        pairs: [
          { left: "a", right: "1" },
          { left: "b", right: "2" },
        ],
      },
      { type: "FILL_BLANK", prompt: `Jesus was born in ${BLANK_TOKEN}`, points: 1, answers: ["Bethlehem"] },
      { type: "ESSAY", prompt: "Discuss.", points: 5 },
    ];
    for (const body of bodies) {
      expect(quizQuestionRequestSchema.safeParse(body).success).toBe(true);
    }
  });

  it("SINGLE_CHOICE with two correct is refused", () => {
    const body = { type: "SINGLE_CHOICE", prompt: "Pick one", points: 1, options: [opt("a", true), opt("b", true)] };
    expect(quizQuestionRequestSchema.safeParse(body).success).toBe(false);
  });

  it("MULTI_CHOICE with one correct is refused", () => {
    const body = { type: "MULTI_CHOICE", prompt: "Pick", points: 1, options: [opt("a", true), opt("b"), opt("c")] };
    expect(quizQuestionRequestSchema.safeParse(body).success).toBe(false);
  });

  it("MULTI_CHOICE with all correct is refused", () => {
    const body = {
      type: "MULTI_CHOICE",
      prompt: "Pick",
      points: 1,
      options: [opt("a", true), opt("b", true), opt("c", true)],
    };
    expect(quizQuestionRequestSchema.safeParse(body).success).toBe(false);
  });

  it("FILL_BLANK with answers.length !== countBlanks(prompt) is refused", () => {
    const base = { type: "FILL_BLANK", points: 1 };
    const two = `a ${BLANK_TOKEN} b ${BLANK_TOKEN}`;
    expect(quizQuestionRequestSchema.safeParse({ ...base, prompt: two, answers: ["x"] }).success).toBe(false);
    expect(quizQuestionRequestSchema.safeParse({ ...base, prompt: "no blanks here", answers: [] }).success).toBe(false);
    expect(quizQuestionRequestSchema.safeParse({ ...base, prompt: two, answers: ["x", "y"] }).success).toBe(true);
  });

  it("MATCHING with duplicate left label is refused", () => {
    const body = {
      type: "MATCHING",
      prompt: "Match them",
      points: 1,
      pairs: [
        { left: "a", right: "1" },
        { left: " a ", right: "2" },
      ],
    };
    expect(quizQuestionRequestSchema.safeParse(body).success).toBe(false);
  });

  it("countBlanks counts the {{blank}} tokens", () => {
    expect(countBlanks("a {{blank}} b {{blank}}")).toBe(2);
    expect(countBlanks("none")).toBe(0);
  });
});
