import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { bearer, cleanupTestData } from "./fixtures";
import { buildPublishedQuizIn, keyOf, seedQuizFixtures, type QuizFixtures } from "./quizzes-setup";

/*
 * GET /api/v1/me/open-quiz-attempt (spec "Relaunch"): the quiz whose attempt the student has open,
 * read after the lazy close, so the app opens straight into it and nowhere else.
 */
jest.setTimeout(60000);

const app = createApp();
let f: QuizFixtures;

beforeAll(async () => {
  f = await seedQuizFixtures(app);
});

afterAll(async () => {
  await cleanupTestData();
});

const MIN = 60_000;
const openAttempt = (token: string) => request(app).get("/api/v1/me/open-quiz-attempt").set(bearer(token));
const start = (quizId: number) => request(app).put(`/api/v1/quizzes/${quizId}/attempt`).set(bearer(f.studentToken));

/** Close every open attempt the suite's student has, so each test starts with none. */
async function closeOpenAttempts() {
  await db.quizAttempt.updateMany({
    where: { studentUserId: f.ownStudentId, status: "IN_PROGRESS" },
    data: { status: "SUBMITTED", submittedAt: new Date() },
  });
}

beforeEach(closeOpenAttempts);

describe("GET /me/open-quiz-attempt", () => {
  it("returns the open attempt's quiz, null after submit, null after it expired", async () => {
    expect((await openAttempt(f.studentToken)).body).toEqual({ data: { quizId: null } });

    // Open, untimed: reported.
    const untimed = await buildPublishedQuizIn(f.seasonId, f.sessionId, { withEssay: false });
    expect((await start(untimed.quizId)).status).toBe(200);
    const res = await openAttempt(f.studentToken);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { quizId: untimed.quizId } });

    // Submitted: nothing open.
    const optionId = (await keyOf(untimed.mcqId)).optionId("Paris");
    const saved = await request(app)
      .patch(`/api/v1/quizzes/${untimed.quizId}/attempt`)
      .set(bearer(f.studentToken))
      .send({ answers: [{ type: "SINGLE_CHOICE", questionId: untimed.mcqId, optionId }] });
    expect(saved.status).toBe(200);
    const submitted = await request(app)
      .post(`/api/v1/quizzes/${untimed.quizId}/attempt/submit`)
      .set(bearer(f.studentToken));
    expect(submitted.status).toBe(200);
    expect((await openAttempt(f.studentToken)).body).toEqual({ data: { quizId: null } });

    // Timed and past its deadline: the read closes it TIMED_OUT and reports nothing.
    const timed = await buildPublishedQuizIn(f.seasonId, f.sessionId, { withEssay: false });
    await db.quiz.update({ where: { id: timed.quizId }, data: { timeLimitMinutes: 10 } });
    expect((await start(timed.quizId)).status).toBe(200);
    expect((await openAttempt(f.studentToken)).body).toEqual({ data: { quizId: timed.quizId } });
    await db.quizAttempt.updateMany({
      where: { quizId: timed.quizId, studentUserId: f.ownStudentId },
      data: { deadlineAt: new Date(Date.now() - 5 * MIN) },
    });
    expect((await openAttempt(f.studentToken)).body).toEqual({ data: { quizId: null } });
    const closed = await db.quizAttempt.findFirstOrThrow({
      where: { quizId: timed.quizId, studentUserId: f.ownStudentId },
      select: { status: true, endReason: true },
    });
    expect(closed.status).not.toBe("IN_PROGRESS");
    expect(closed.endReason).toBe("TIMED_OUT");
  });

  it("reports a reopened timed attempt that hasn't started (it is open, its clock isn't)", async () => {
    const { quizId } = await buildPublishedQuizIn(f.seasonId, f.sessionId, { withEssay: false });
    await db.quiz.update({ where: { id: quizId }, data: { timeLimitMinutes: 10 } });
    await db.quizAttempt.create({
      data: { quizId, studentUserId: f.ownStudentId, attemptNumber: 2, status: "IN_PROGRESS", deadlineAt: null },
    });
    expect((await openAttempt(f.studentToken)).body).toEqual({ data: { quizId } });
  });

  it("ignores an attempt left open in a season the student no longer studies in", async () => {
    const { quizId } = await buildPublishedQuizIn(f.seasonId, f.sessionId, { withEssay: false });
    expect((await start(quizId)).status).toBe(200);
    await db.seasonEnrollment.update({
      where: { studentUserId_seasonId: { studentUserId: f.ownStudentId, seasonId: f.seasonId } },
      data: { status: "WITHDRAWN" },
    });
    try {
      expect((await openAttempt(f.studentToken)).body).toEqual({ data: { quizId: null } });
    } finally {
      await db.seasonEnrollment.update({
        where: { studentUserId_seasonId: { studentUserId: f.ownStudentId, seasonId: f.seasonId } },
        data: { status: "ACTIVE" },
      });
    }
  });

  it("is null for staff, who are never held on a quiz", async () => {
    const res = await openAttempt(f.leaderToken);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { quizId: null } });
  });

  it("needs a signed-in caller", async () => {
    expect((await request(app).get("/api/v1/me/open-quiz-attempt")).status).toBe(401);
  });
});
