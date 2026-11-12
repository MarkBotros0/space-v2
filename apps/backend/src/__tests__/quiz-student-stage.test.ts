import { studentQuizStage } from "../lib/quizzes/student-stage";

describe("studentQuizStage", () => {
  it("is not_started with no attempt", () => {
    expect(studentQuizStage(null, false, false, false)).toBe("not_started");
    expect(studentQuizStage(null, false, true, false)).toBe("not_started");
  });

  it("is in_progress while the latest attempt is open", () => {
    expect(studentQuizStage({ status: "IN_PROGRESS" }, false, false, false)).toBe("in_progress");
    expect(studentQuizStage({ status: "IN_PROGRESS" }, false, true, false)).toBe("in_progress");
  });

  it("is in_progress for a retake even when an earlier attempt is graded and answers are out", () => {
    expect(studentQuizStage({ status: "IN_PROGRESS" }, true, false, false)).toBe("in_progress");
    expect(studentQuizStage({ status: "IN_PROGRESS" }, true, true, false)).toBe("in_progress");
  });

  it("is submitted while handed in and nothing is graded, released or not", () => {
    expect(studentQuizStage({ status: "SUBMITTED" }, false, false, false)).toBe("submitted");
    expect(studentQuizStage({ status: "SUBMITTED" }, false, true, false)).toBe("submitted");
  });

  it("is graded (score only) once any attempt is graded and answers are held", () => {
    expect(studentQuizStage({ status: "GRADED" }, true, false, false)).toBe("graded");
    // A handed-in retake waiting for marking still shows the earlier graded score.
    expect(studentQuizStage({ status: "SUBMITTED" }, true, false, false)).toBe("graded");
  });

  it("is answers once released and any attempt is graded", () => {
    expect(studentQuizStage({ status: "GRADED" }, true, true, false)).toBe("answers");
    expect(studentQuizStage({ status: "SUBMITTED" }, true, true, false)).toBe("answers");
  });

  it("is graded with an admin score and no graded attempt, and never answers", () => {
    expect(studentQuizStage(null, false, false, true)).toBe("graded");
    expect(studentQuizStage(null, false, true, true)).toBe("graded");
    expect(studentQuizStage({ status: "SUBMITTED" }, false, true, true)).toBe("graded");
  });

  it("still needs a graded attempt for answers when an admin score exists", () => {
    expect(studentQuizStage({ status: "GRADED" }, true, true, true)).toBe("answers");
    expect(studentQuizStage({ status: "GRADED" }, true, false, true)).toBe("graded");
  });
});
