import {
  endAttemptRequestSchema,
  endAttemptResponseSchema,
  quizAttemptEndReasonSchema,
  updateQuizRequestSchema,
} from "../index";

describe("quiz timing settings", () => {
  it("refuses startsFrom after startsUntil", () => {
    const r = updateQuizRequestSchema.safeParse({
      startsFrom: "2026-11-14T10:00:00.000Z",
      startsUntil: "2026-11-14T09:00:00.000Z",
    });
    expect(r.success).toBe(false);
  });

  it("refuses an equal start and end, accepts start before end, accepts one alone", () => {
    const same = "2026-11-14T10:00:00.000Z";
    expect(updateQuizRequestSchema.safeParse({ startsFrom: same, startsUntil: same }).success).toBe(false);
    expect(
      updateQuizRequestSchema.safeParse({ startsFrom: same, startsUntil: "2026-11-14T11:00:00.000Z" }).success,
    ).toBe(true);
    expect(updateQuizRequestSchema.safeParse({ startsFrom: same }).success).toBe(true);
    expect(updateQuizRequestSchema.safeParse({ startsUntil: same }).success).toBe(true);
  });

  it("refuses a non-ISO date", () => {
    expect(updateQuizRequestSchema.safeParse({ startsFrom: "tomorrow" }).success).toBe(false);
  });

  it("timeLimitMinutes 0 refused, 1 and 300 ok, 301 refused, 1.5 refused", () => {
    expect(updateQuizRequestSchema.safeParse({ timeLimitMinutes: 0 }).success).toBe(false);
    expect(updateQuizRequestSchema.safeParse({ timeLimitMinutes: 1 }).success).toBe(true);
    expect(updateQuizRequestSchema.safeParse({ timeLimitMinutes: 300 }).success).toBe(true);
    expect(updateQuizRequestSchema.safeParse({ timeLimitMinutes: 301 }).success).toBe(false);
    expect(updateQuizRequestSchema.safeParse({ timeLimitMinutes: 1.5 }).success).toBe(false);
  });

  it("null clears each setting and counts as something to update", () => {
    for (const body of [{ startsFrom: null }, { startsUntil: null }, { timeLimitMinutes: null }]) {
      const r = updateQuizRequestSchema.safeParse(body);
      expect(r.success).toBe(true);
      if (r.success) expect(r.data).toEqual(body);
    }
  });
});

describe("ending an attempt", () => {
  it("takes a student id and answers with the attempt and its status", () => {
    expect(endAttemptRequestSchema.safeParse({ studentUserId: 4 }).success).toBe(true);
    expect(endAttemptRequestSchema.safeParse({}).success).toBe(false);
    expect(endAttemptResponseSchema.safeParse({ attemptId: 1, status: "SUBMITTED" }).success).toBe(true);
    expect(endAttemptResponseSchema.safeParse({ attemptId: 1, status: "DONE" }).success).toBe(false);
  });

  it("knows the four end reasons", () => {
    expect(quizAttemptEndReasonSchema.options).toEqual(["SUBMITTED", "TIMED_OUT", "ENDED_BY_STAFF", "ENDED_BY_EXITS"]);
  });
});
