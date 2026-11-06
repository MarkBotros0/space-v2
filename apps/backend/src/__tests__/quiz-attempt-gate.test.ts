/**
 * The enrolment gate on a student's quiz attempt writes (start, save, submit).
 *
 * Unit test with a mocked db: every refusal here happens before the attempt is
 * looked up, so a gated request never touches the attempt rows at all.
 */
const mockDb = {
  quiz: { findUnique: jest.fn() },
  seasonEnrollment: { findUnique: jest.fn() },
  quizAttempt: { findFirst: jest.fn(), upsert: jest.fn() },
};
jest.mock("../db/client", () => ({ db: mockDb }));
jest.mock("../routes/quizzes/student-detail", () => ({
  loadStudentQuizDetail: jest.fn().mockResolvedValue({ id: 7 }),
}));

import type { Request, Response } from "express";

import type { SessionUser } from "../lib/auth/tokens";
import { saveAttemptAnswers, startAttempt, submitAttempt } from "../routes/quizzes/attempts";

function student(over: Partial<SessionUser> = {}): SessionUser {
  return {
    userId: 10, role: "STUDENT", seasonAdminIds: [], groupLeaderIds: [],
    activeSeasonId: 3, graduationYear: null, ...over,
  };
}

function call(
  handler: (req: Request, res: Response) => Promise<unknown>,
  user: SessionUser,
  body: unknown = {},
) {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: unknown) { this.body = payload; return this; },
  };
  const req = { user, params: { id: "7" }, body } as unknown as Request;
  return handler(req, res as unknown as Response).then(() => res);
}

const saveBody = { answers: [{ questionId: 1, selectedIndex: 0, text: null }] };

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.quiz.findUnique.mockResolvedValue({
    title: "Q", seasonId: 3, kind: "ONLINE", publishedAt: new Date(),
  });
  mockDb.quizAttempt.findFirst.mockResolvedValue(null);
});

describe.each([
  ["start", startAttempt, {}],
  ["save", saveAttemptAnswers, saveBody],
  ["submit", submitAttempt, {}],
] as const)("%s attempt", (_name, handler, body) => {
  it.each(["WITHDRAWN", "COMPLETED"])("refuses a %s enrolment with 403", async (status) => {
    mockDb.seasonEnrollment.findUnique.mockResolvedValue({ status });
    const res = await call(handler, student(), body);
    expect(res.statusCode).toBe(403);
    expect(mockDb.quizAttempt.findFirst).not.toHaveBeenCalled();
  });

  it("refuses a student with no enrolment, even in their active season", async () => {
    mockDb.seasonEnrollment.findUnique.mockResolvedValue(null);
    const res = await call(handler, student({ activeSeasonId: 3 }), body);
    expect(res.statusCode).toBe(403);
  });

  it("refuses an alumnus even with an ACTIVE enrolment row", async () => {
    mockDb.seasonEnrollment.findUnique.mockResolvedValue({ status: "ACTIVE", season: { status: "ACTIVE", deletedAt: null } });
    const res = await call(handler, student({ graduationYear: 2025 }), body);
    expect(res.statusCode).toBe(403);
    expect(mockDb.quizAttempt.findFirst).not.toHaveBeenCalled();
  });

  it("lets an ACTIVE student through to the attempt lookup", async () => {
    mockDb.seasonEnrollment.findUnique.mockResolvedValue({ status: "ACTIVE", season: { status: "ACTIVE", deletedAt: null } });
    const res = await call(handler, student(), body);
    expect(res.statusCode).not.toBe(403);
    expect(mockDb.quizAttempt.findFirst).toHaveBeenCalled();
  });
});
