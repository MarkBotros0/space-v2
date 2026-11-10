// QUIZ_PUBLISHED with the database mocked: who hears about a newly published
// ONLINE quiz, and that only the draft → published transition notifies.

const mockDb = {
  quiz: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  quizQuestion: { findMany: jest.fn() },
  quizAttempt: { count: jest.fn() },
  seasonEnrollment: { findMany: jest.fn() },
};
jest.mock("../db/client", () => ({ db: mockDb }));

const mockNotify = jest.fn();
jest.mock("../lib/notifications", () => ({
  createNotificationsBulk: (...a: unknown[]) => mockNotify(...a),
}));
jest.mock("../lib/permissions", () => ({
  ...jest.requireActual("../lib/permissions"),
  canManageQuiz: jest.fn(async () => true),
}));

import type { Request, Response } from "express";

import type { SessionUser } from "../lib/auth/tokens";
import { parseNotificationLink } from "../lib/notification-target";
import { notifyQuizPublished } from "../lib/quizzes/notify";
import { publishQuiz } from "../routes/quizzes/questions";

const admin: SessionUser = {
  userId: 1,
  role: "ADMIN",
  seasonAdminIds: [7],
  groupLeaderIds: [],
  activeSeasonId: 7,
  graduationYear: null,
};

function fakeRes() {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}
const publishReq = (publish: boolean) =>
  ({ user: admin, params: { id: "5" }, query: {}, body: { publish } }) as unknown as Request;

const publishedAt = new Date("2026-11-04T10:00:00Z");

beforeEach(() => {
  jest.resetAllMocks();
  mockDb.quiz.findUnique.mockResolvedValue({ id: 5, kind: "ONLINE" });
  mockDb.quizQuestion.findMany.mockResolvedValue([{ type: "ESSAY", quizOptions: [], quizBlanks: [] }]);
  mockDb.quizAttempt.count.mockResolvedValue(0);
  mockDb.quiz.findUniqueOrThrow.mockResolvedValue({ publishedAt, seasonId: 7, title: "Week 3 check" });
  mockDb.quiz.update.mockResolvedValue({ publishedAt, seasonId: 7, title: "Week 3 check" });
  mockDb.seasonEnrollment.findMany.mockResolvedValue([{ studentUserId: 11 }, { studentUserId: 12 }]);
  mockNotify.mockResolvedValue({ written: 2, suppressed: 0 });
  const { canManageQuiz } = jest.requireMock("../lib/permissions");
  (canManageQuiz as jest.Mock).mockResolvedValue(true);
});

describe("notifyQuizPublished", () => {
  it("tells every ACTIVE enrolment in the quiz's season — the student list's audience", async () => {
    await notifyQuizPublished({ seasonId: 7, title: "Week 3 check" });

    expect(mockDb.seasonEnrollment.findMany).toHaveBeenCalledWith({
      where: { seasonId: 7, status: "ACTIVE", season: { status: "ACTIVE" }, studentUser: { deletedAt: null } },
      select: { studentUserId: true },
    });
    expect(mockNotify).toHaveBeenCalledWith([11, 12], {
      type: "QUIZ_PUBLISHED",
      title: "New quiz: Week 3 check",
      link: "/student/quizzes",
    });
  });

  it("links to the quiz list target", () => {
    expect(parseNotificationLink("/student/quizzes")).toEqual({ entityType: "quiz", entityId: null });
  });

  it("never rejects into the publish that triggered it", async () => {
    mockDb.seasonEnrollment.findMany.mockRejectedValue(new Error("db down"));
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(notifyQuizPublished({ seasonId: 7, title: "t" })).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("POST /quizzes/:id/publish", () => {
  it("notifies on the draft → published transition", async () => {
    mockDb.quiz.updateMany.mockResolvedValue({ count: 1 });
    const res = fakeRes();
    await publishQuiz(publishReq(true), res as unknown as Response);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockDb.quiz.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 5, publishedAt: null } }),
    );
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify).toHaveBeenCalledWith([11, 12], expect.objectContaining({ type: "QUIZ_PUBLISHED" }));
  });

  it("stays silent on a republish of a quiz that is already live", async () => {
    mockDb.quiz.updateMany.mockResolvedValue({ count: 0 });
    const res = fakeRes();
    await publishQuiz(publishReq(true), res as unknown as Response);

    expect(res.status).toHaveBeenCalledWith(200);
    // The republish still moves the timestamp, as before.
    expect(mockDb.quiz.update).toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("stays silent on an unpublish", async () => {
    mockDb.quiz.update.mockResolvedValue({ publishedAt: null, seasonId: 7, title: "t" });
    const res = fakeRes();
    await publishQuiz(publishReq(false), res as unknown as Response);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockDb.quiz.updateMany).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("does not notify for a PAPER quiz, which cannot be published", async () => {
    mockDb.quiz.findUnique.mockResolvedValue({ id: 5, kind: "PAPER" });
    const res = fakeRes();
    await publishQuiz(publishReq(true), res as unknown as Response);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockNotify).not.toHaveBeenCalled();
  });
});
