import {
  addForumCommentRequestSchema,
  createJpcEventRequestSchema,
  studentVideoQuestionSchema,
  submitForumResponseRequestSchema,
  videoProgressRequestSchema,
  videoQuestionInputSchema,
} from "../index";

describe("videoQuestionInputSchema", () => {
  const valid = {
    atSeconds: 30,
    prompt: "Which one?",
    options: ["a", "b"],
    correctIndex: 1,
    points: 2,
  };

  it("mirrors v1's bounds", () => {
    expect(videoQuestionInputSchema.parse(valid).points).toBe(2);
    expect(videoQuestionInputSchema.parse({ ...valid, points: undefined }).points).toBe(1);
    expect(videoQuestionInputSchema.safeParse({ ...valid, atSeconds: 86_401 }).success).toBe(false);
    expect(videoQuestionInputSchema.safeParse({ ...valid, prompt: "x" }).success).toBe(false);
    expect(videoQuestionInputSchema.safeParse({ ...valid, options: ["a"] }).success).toBe(false);
    expect(
      videoQuestionInputSchema.safeParse({ ...valid, options: ["a", "b", "c", "d", "e", "f", "g"] })
        .success,
    ).toBe(false);
  });

  it("refuses a correct index outside the options (v1 R4)", () => {
    const result = videoQuestionInputSchema.safeParse({ ...valid, correctIndex: 2 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["correctIndex"]);
    }
  });
});

describe("studentVideoQuestionSchema — the answer-key split", () => {
  const row = {
    id: 1,
    atSeconds: 30,
    prompt: "Which one?",
    options: ["a", "b"],
    points: 1,
    answered: false,
    selectedIndex: null,
    isCorrect: null,
  };

  it("parses a student row", () => {
    expect(studentVideoQuestionSchema.parse(row).answered).toBe(false);
  });

  it("REFUSES a payload carrying correctIndex", () => {
    // The schema is .strict() precisely so a backend that starts leaking the
    // answer key fails at the client boundary instead of rendering it.
    expect(studentVideoQuestionSchema.safeParse({ ...row, correctIndex: 1 }).success).toBe(false);
  });
});

describe("videoProgressRequestSchema", () => {
  it("has no `completed` field — completion is server-derived (spec 13 D3)", () => {
    const parsed = videoProgressRequestSchema.parse({ furthestSeconds: 10, completed: true });
    expect(parsed).toEqual({ furthestSeconds: 10 });
  });

  it("bounds furthestSeconds", () => {
    expect(videoProgressRequestSchema.safeParse({ furthestSeconds: -1 }).success).toBe(false);
    expect(videoProgressRequestSchema.safeParse({ furthestSeconds: 86_401 }).success).toBe(false);
  });
});

describe("submitForumResponseRequestSchema", () => {
  it("requires at least one word regardless of forumMinWords (spec 14 D8)", () => {
    expect(submitForumResponseRequestSchema.safeParse({ text: "   " }).success).toBe(false);
    expect(submitForumResponseRequestSchema.safeParse({ text: "" }).success).toBe(false);
    expect(submitForumResponseRequestSchema.safeParse({ text: "one" }).success).toBe(true);
  });

  it("caps the body at 20,000 characters — v1 had no cap at all", () => {
    expect(submitForumResponseRequestSchema.safeParse({ text: "x".repeat(20_001) }).success).toBe(
      false,
    );
  });
});

describe("addForumCommentRequestSchema", () => {
  it("trims to 1..5000, exactly v1's shape", () => {
    expect(addForumCommentRequestSchema.parse({ body: "  hi  " }).body).toBe("hi");
    expect(addForumCommentRequestSchema.safeParse({ body: "   " }).success).toBe(false);
    expect(addForumCommentRequestSchema.safeParse({ body: "x".repeat(5001) }).success).toBe(false);
  });
});

describe("createJpcEventRequestSchema", () => {
  const valid = {
    title: "space-v2-test-retreat",
    day: "2099-06-01",
    time: null,
    endDay: null,
    description: null,
    url: null,
    visibility: "ALL" as const,
    seasonId: null,
  };

  it("refuses an end day before the start day (v1 R11)", () => {
    expect(createJpcEventRequestSchema.safeParse({ ...valid, endDay: "2099-05-01" }).success).toBe(
      false,
    );
    expect(createJpcEventRequestSchema.safeParse({ ...valid, endDay: "2099-06-01" }).success).toBe(
      true,
    );
  });

  it("requires a season for a SEASON event (v1 R12)", () => {
    expect(createJpcEventRequestSchema.safeParse({ ...valid, visibility: "SEASON" }).success).toBe(
      false,
    );
    expect(
      createJpcEventRequestSchema.safeParse({ ...valid, visibility: "SEASON", seasonId: 3 })
        .success,
    ).toBe(true);
  });

  it("takes org wall-clock fields, never a device-composed instant (ruling X13)", () => {
    // v1 posted naive strings and let the server resolve them in the *host's*
    // zone (R15/R20). v2 keeps the wall-clock shape but names the zone: the
    // server composes the instant in config.orgTimezone. An ISO instant is
    // refused, because accepting one is how a device's zone leaks back in.
    expect(
      createJpcEventRequestSchema.safeParse({ ...valid, day: "2099-06-01T00:00:00.000Z" }).success,
    ).toBe(false);
    expect(createJpcEventRequestSchema.safeParse({ ...valid, time: "18:30" }).success).toBe(true);
    expect(createJpcEventRequestSchema.safeParse({ ...valid, time: "24:00" }).success).toBe(false);
    expect(createJpcEventRequestSchema.safeParse({ ...valid, time: "6pm" }).success).toBe(false);
  });
});
