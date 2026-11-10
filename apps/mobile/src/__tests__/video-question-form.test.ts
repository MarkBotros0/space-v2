import {
  EMPTY_VIDEO_QUESTION_FORM,
  TIMESTAMP_HINT,
  formFromQuestion,
  updatedQuestionStatus,
  videoQuestionBody,
} from "../lib/video-question-form";

const form = (over = {}) => ({
  ...EMPTY_VIDEO_QUESTION_FORM,
  timestamp: "2:30",
  prompt: "What colour?",
  options: ["Red", "Blue"],
  ...over,
});

describe("video question form", () => {
  it("parses the timestamp first, and says how to write one", () => {
    expect(videoQuestionBody(form({ timestamp: "two thirty" }))).toEqual({
      ok: false,
      field: "timestamp",
      message: TIMESTAMP_HINT,
    });
  });

  it("builds the body the schema accepts", () => {
    expect(videoQuestionBody(form({ points: "3", correctIndex: 1 }))).toEqual({
      ok: true,
      input: { atSeconds: 150, prompt: "What colour?", options: ["Red", "Blue"], correctIndex: 1, points: 3 },
    });
  });

  it("puts a schema refusal on the form, with the schema's own message", () => {
    const res = videoQuestionBody(form({ prompt: "" }));
    expect(res.ok).toBe(false);
    expect(res).toMatchObject({ field: "form" });
  });

  it("opens a question for editing as it is stored", () => {
    expect(
      formFromQuestion({
        id: 4,
        atSeconds: 3725,
        prompt: "P",
        options: ["a", "b", "c"],
        correctIndex: 2,
        points: 2,
      } as never),
    ).toEqual({
      editingId: 4,
      timestamp: "1:02:05",
      prompt: "P",
      options: ["a", "b", "c"],
      correctIndex: 2,
      points: "2",
    });
  });

  it("says what an update did", () => {
    expect(updatedQuestionStatus({ regradedCount: 0, pointsChanged: false })).toBe("Question updated.");
    expect(updatedQuestionStatus({ regradedCount: 3, pointsChanged: true })).toBe(
      "3 recorded answers were re-graded. Points changed — every student's score for this question moved.",
    );
  });
});
