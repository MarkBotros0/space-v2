import { MAX_EXITS, quizAttemptEventsRequestSchema, quizAttemptEventsResponseSchema } from "../index";

const ok = {
  clientEventId: "3b241101-e2bb-4255-8caf-4136c566a962",
  kind: "EXIT",
  leftAt: "2026-11-14T10:00:00.000Z",
  returnedAt: "2026-11-14T10:00:20.000Z",
};

describe("quiz attempt events", () => {
  it("the exit limit is three", () => {
    expect(MAX_EXITS).toBe(3);
  });

  it("accepts 1 to 20 events, a null returnedAt and every kind", () => {
    for (const kind of ["EXIT", "RELAUNCH", "SCREENSHOT"]) {
      expect(quizAttemptEventsRequestSchema.safeParse({ events: [{ ...ok, kind }] }).success).toBe(true);
    }
    expect(quizAttemptEventsRequestSchema.safeParse({ events: [{ ...ok, returnedAt: null }] }).success).toBe(true);
    expect(quizAttemptEventsRequestSchema.safeParse({ events: [] }).success).toBe(false);
    expect(quizAttemptEventsRequestSchema.safeParse({ events: Array(21).fill(ok) }).success).toBe(false);
  });

  it("refuses a non-UUID id, an unknown kind, a non-ISO time and extra keys", () => {
    for (const bad of [
      { ...ok, clientEventId: "1" },
      { ...ok, kind: "PEEK" },
      { ...ok, leftAt: "yesterday" },
      { ...ok, extra: true },
    ]) {
      expect(quizAttemptEventsRequestSchema.safeParse({ events: [bad] }).success).toBe(false);
    }
  });

  it("the response is the count, whether this report ended it, and the status", () => {
    expect(quizAttemptEventsResponseSchema.parse({ exits: 3, ended: true, status: "GRADED" })).toEqual({
      exits: 3,
      ended: true,
      status: "GRADED",
    });
  });
});
