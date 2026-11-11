import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { closeAllExpired } from "../../lib/quizzes/close-attempt";
import { getHandlers } from "../../lib/scheduler/registry";
import { createFirstAttempt } from "../../lib/quizzes/start-attempt";
import { bearer, cleanupTestData } from "./fixtures";
import { buildPublishedQuizIn, seedQuizFixtures, setLatestAttempt, type QuizFixtures } from "./quizzes-setup";

/* Staff End (spec "Live screen") and the scheduler's quiz-deadlines handler. */
jest.setTimeout(60000);

const app = createApp();
let f: QuizFixtures;

beforeAll(async () => {
  f = await seedQuizFixtures(app);
});

afterAll(async () => {
  await cleanupTestData();
});

const end = (quizId: number, token: string, studentUserId: number) =>
  request(app).post(`/api/v1/quizzes/${quizId}/attempts/end`).set(bearer(token)).send({ studentUserId });

async function openQuiz() {
  const { quizId } = await buildPublishedQuizIn(f.seasonId, f.sessionId, {
    withEssay: false,
    withTypes: ["TRUE_FALSE"],
  });
  await createFirstAttempt(quizId, f.ownStudentId);
  return quizId;
}

const latest = (quizId: number) =>
  db.quizAttempt.findFirstOrThrow({
    where: { quizId, studentUserId: f.ownStudentId },
    orderBy: { attemptNumber: "desc" },
    select: { id: true, status: true, endReason: true, endedById: true, deadlineAt: true },
  });

describe("POST /quizzes/:id/attempts/end", () => {
  it("a leader ends a student's open attempt", async () => {
    const quizId = await openQuiz();
    const before = await latest(quizId);
    const res = await end(quizId, f.leaderToken, f.ownStudentId);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ attemptId: before.id, status: expect.stringMatching(/^(SUBMITTED|GRADED)$/) });
    const after = await latest(quizId);
    expect(after.status).toBe(res.body.data.status);
    expect(after.endReason).toBe("ENDED_BY_STAFF");
    expect(after.endedById).not.toBeNull();
  });

  it("an admin and a super can end", async () => {
    for (const token of [f.adminToken, f.superToken]) {
      const quizId = await openQuiz();
      const res = await end(quizId, token, f.ownStudentId);
      expect(res.status).toBe(200);
      expect((await latest(quizId)).endReason).toBe("ENDED_BY_STAFF");
    }
  });

  it("closes a timed attempt that was never started (no deadline)", async () => {
    const quizId = await openQuiz();
    await db.quiz.update({ where: { id: quizId }, data: { timeLimitMinutes: 30 } });
    await db.quizAttempt.updateMany({ where: { quizId }, data: { deadlineAt: null } });
    const res = await end(quizId, f.adminToken, f.ownStudentId);
    expect(res.status).toBe(200);
    expect((await latest(quizId)).endReason).toBe("ENDED_BY_STAFF");
  });

  it("refuses a leader outside the student's group", async () => {
    const quizId = await openQuiz();
    const res = await end(quizId, f.leaderToken, f.otherGroupStudentId);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("student_not_in_scope");
  });

  it("refuses a student and an admin of another season", async () => {
    const quizId = await openQuiz();
    expect((await end(quizId, f.studentToken, f.ownStudentId)).status).toBe(403);
    expect((await end(quizId, f.otherAdminToken, f.ownStudentId)).status).toBe(403);
  });

  it("an already closed attempt is attempt_closed", async () => {
    const quizId = await openQuiz();
    await setLatestAttempt(quizId, f.ownStudentId, { status: "SUBMITTED" });
    const res = await end(quizId, f.adminToken, f.ownStudentId);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("attempt_closed");
  });

  it("a student with no attempt is no_attempt, a missing quiz is 404, a bad body is 400", async () => {
    const { quizId } = await buildPublishedQuizIn(f.seasonId, f.sessionId, { withEssay: false });
    expect((await end(quizId, f.adminToken, f.ownStudentId)).body.error.code).toBe("no_attempt");
    expect((await end(999999999, f.adminToken, f.ownStudentId)).status).toBe(404);
    const bad = await request(app).post(`/api/v1/quizzes/${quizId}/attempts/end`).set(bearer(f.adminToken)).send({});
    expect(bad.status).toBe(400);
  });
});

describe("the quiz-deadlines handler", () => {
  it("is registered with the scheduler", () => {
    expect(getHandlers().map((h) => h.name)).toContain("quiz-deadlines");
  });

  it("closes expired attempts across quizzes, leaves the rest, and counts them", async () => {
    const now = new Date();
    const a = await openQuiz();
    const b = await openQuiz();
    const fresh = await openQuiz();
    const grace = await openQuiz();
    await db.quizAttempt.updateMany({ where: { quizId: a }, data: { deadlineAt: new Date(now.getTime() - 60_000) } });
    await db.quizAttempt.updateMany({ where: { quizId: b }, data: { deadlineAt: new Date(now.getTime() - 60_000) } });
    await db.quizAttempt.updateMany({
      where: { quizId: fresh },
      data: { deadlineAt: new Date(now.getTime() + 60_000) },
    });
    await db.quizAttempt.updateMany({
      where: { quizId: grace },
      data: { deadlineAt: new Date(now.getTime() - 3_000) },
    });

    expect(await closeAllExpired(now)).toBeGreaterThanOrEqual(2);
    for (const q of [a, b]) {
      const row = await latest(q);
      expect(row.status).not.toBe("IN_PROGRESS");
      expect(row.endReason).toBe("TIMED_OUT");
      expect(row.endedById).toBeNull();
    }
    expect((await latest(fresh)).status).toBe("IN_PROGRESS");
    expect((await latest(grace)).status).toBe("IN_PROGRESS");
  });
});
