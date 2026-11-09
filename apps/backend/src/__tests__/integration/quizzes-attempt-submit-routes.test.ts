import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestUser, login } from "./fixtures";
import { buildPublishedQuizIn, quizGradedCountFor, seedQuizFixtures } from "./quizzes-setup";

// Same reason as the submissions suite: the shared Neon staging Postgres
// autosuspends, and the first query after idling has been measured at ~18s.
jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let sessionId: number;
let ownStudentId: number;
let adminToken: string;
let studentToken: string;

beforeAll(async () => {
  ({ seasonId, sessionId, ownStudentId, adminToken, studentToken } = await seedQuizFixtures(app));
});

afterAll(async () => {
  await cleanupTestData();
});

/** See `quizGradedCountFor` in ./quizzes-setup. */
function quizGradedCount(): Promise<number> {
  return quizGradedCountFor(ownStudentId);
}

describe("GET /api/v1/quizzes/:id and the attempt lifecycle", () => {
  let onlineQuizId: number;
  let mcqId: number;
  let essayId: number;

  async function buildPublishedQuiz(opts: { withEssay: boolean }) {
    return buildPublishedQuizIn(seasonId, sessionId, opts);
  }

  beforeEach(async () => {
    const built = await buildPublishedQuiz({ withEssay: true });
    onlineQuizId = built.quizId;
    mcqId = built.mcqId;
    essayId = built.essayId;
  });

  it("submits a mixed quiz to SUBMITTED with autoScore only (R63)", async () => {
    const before = await quizGradedCount();
    await request(app).put(`/api/v1/quizzes/${onlineQuizId}/attempt`).set("authorization", `Bearer ${studentToken}`);
    await request(app)
      .patch(`/api/v1/quizzes/${onlineQuizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({
        answers: [
          { questionId: mcqId, selectedIndex: 1, text: null },
          { questionId: essayId, selectedIndex: null, text: "Because." },
        ],
      });

    const res = await request(app)
      .post(`/api/v1/quizzes/${onlineQuizId}/attempt/submit`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("SUBMITTED");
    // The student sees no score yet — an essay is waiting for a human.
    expect(res.body.data.totalScore).toBeNull();

    const attempt = await db.quizAttempt.findFirst({
      where: { quizId: onlineQuizId, studentUserId: ownStudentId },
      select: { autoScore: true, manualScore: true, totalScore: true, submittedAt: true },
    });
    expect(attempt).toMatchObject({ autoScore: 2, manualScore: null, totalScore: null });
    expect(attempt?.submittedAt).not.toBeNull();

    // R65: the essay path notifies nobody — there is nothing graded to tell them about.
    expect((await quizGradedCount()) - before).toBe(0);
  });

  it("auto-grades an all-MCQ quiz, all-or-nothing, and notifies once (R60, R64, R65)", async () => {
    const built = await buildPublishedQuiz({ withEssay: false });
    const before = await quizGradedCount();
    await request(app).put(`/api/v1/quizzes/${built.quizId}/attempt`).set("authorization", `Bearer ${studentToken}`);
    await request(app)
      .patch(`/api/v1/quizzes/${built.quizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ answers: [{ questionId: built.mcqId, selectedIndex: 0, text: null }] });

    const res = await request(app)
      .post(`/api/v1/quizzes/${built.quizId}/attempt/submit`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("GRADED");
    // Wrong answer: full points or nothing — no partial credit anywhere (R60).
    expect(res.body.data.totalScore).toBe(0);
    expect(res.body.data.questions[0].isCorrect).toBe(false);
    // R34: the student learns WHICH question was wrong, never what was right.
    expect(JSON.stringify(res.body)).not.toContain("correctIndex");

    const attempt = await db.quizAttempt.findFirst({
      where: { quizId: built.quizId, studentUserId: ownStudentId },
      select: { manualScore: true, gradedAt: true, gradedById: true },
    });
    // R64: gradedById stays null on the auto path — nobody graded it.
    expect(attempt).toMatchObject({ manualScore: 0, gradedById: null });
    expect(attempt?.gradedAt).not.toBeNull();

    // Exactly one new row, carrying v1's link (ruling X1 — v1's three sites all
    // write the bare list path; the row is still rendered by v1 today).
    expect((await quizGradedCount()) - before).toBe(1);
  });

  it("scores exactly once when submits race, and a save never lands after scoring (REG-111)", async () => {
    const built = await buildPublishedQuiz({ withEssay: false });
    const before = await quizGradedCount();
    await request(app).put(`/api/v1/quizzes/${built.quizId}/attempt`).set("authorization", `Bearer ${studentToken}`);
    await request(app)
      .patch(`/api/v1/quizzes/${built.quizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ answers: [{ questionId: built.mcqId, selectedIndex: 1, text: null }] });

    const results = await Promise.all([
      ...[0, 1, 2, 3].map(() =>
        request(app)
          .post(`/api/v1/quizzes/${built.quizId}/attempt/submit`)
          .set("authorization", `Bearer ${studentToken}`),
      ),
      request(app)
        .patch(`/api/v1/quizzes/${built.quizId}/attempt`)
        .set("authorization", `Bearer ${studentToken}`)
        .send({ answers: [{ questionId: built.mcqId, selectedIndex: 0, text: null }] }),
    ]);
    const submits = results.slice(0, 4);
    expect(submits.filter((r) => r.status === 200)).toHaveLength(1);
    expect(submits.filter((r) => r.status === 409)).toHaveLength(3);
    expect((await quizGradedCount()) - before).toBe(1);

    // Whatever order the lock serialised them in, the stored answer and the
    // stored score agree: nothing was saved after scoring without being scored.
    const attempt = await db.quizAttempt.findFirst({
      where: { quizId: built.quizId, studentUserId: ownStudentId },
      select: { id: true, totalScore: true },
    });
    const answer = await db.quizAnswer.findFirst({
      where: { attemptId: attempt?.id },
      select: { isCorrect: true, pointsAwarded: true },
    });
    expect(answer?.isCorrect).not.toBeNull();
    expect(attempt?.totalScore).toBe(answer?.pointsAwarded);
  });

  it("a save that was waiting on the attempt lock is refused once the attempt closes (REG-111)", async () => {
    const built = await buildPublishedQuiz({ withEssay: false });
    await request(app).put(`/api/v1/quizzes/${built.quizId}/attempt`).set("authorization", `Bearer ${studentToken}`);
    await request(app)
      .patch(`/api/v1/quizzes/${built.quizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ answers: [{ questionId: built.mcqId, selectedIndex: 1, text: null }] });
    const attempt = await db.quizAttempt.findFirstOrThrow({
      where: { quizId: built.quizId, studentUserId: ownStudentId },
      select: { id: true },
    });

    // Hold the attempt row ourselves: the save passes its cheap IN_PROGRESS
    // pre-check, then must queue on the lock. We close the attempt before
    // releasing it, so only a save that re-reads the status under the lock
    // can notice.
    let waiting: Promise<request.Response> | undefined;
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "QuizAttempt" WHERE "id" = ${attempt.id} FOR UPDATE`;
      waiting = Promise.resolve(
        request(app)
          .patch(`/api/v1/quizzes/${built.quizId}/attempt`)
          .set("authorization", `Bearer ${studentToken}`)
          .send({ answers: [{ questionId: built.mcqId, selectedIndex: 0, text: null }] }),
      );
      await new Promise((resolve) => setTimeout(resolve, 700));
      await tx.quizAttempt.update({ where: { id: attempt.id }, data: { status: "SUBMITTED" } });
    });

    const res = await waiting;
    expect(res?.status).toBe(409);
    expect(res?.body.error.code).toBe("attempt_closed");
    const stored = await db.quizAnswer.findFirstOrThrow({
      where: { attemptId: attempt.id },
      select: { selectedIndex: true },
    });
    expect(stored.selectedIndex).toBe(1);
  });

  it("refuses a second submit and a save after submit (R49, R58)", async () => {
    const built = await buildPublishedQuiz({ withEssay: false });
    await request(app).put(`/api/v1/quizzes/${built.quizId}/attempt`).set("authorization", `Bearer ${studentToken}`);
    await request(app)
      .patch(`/api/v1/quizzes/${built.quizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ answers: [{ questionId: built.mcqId, selectedIndex: 1, text: null }] });
    await request(app)
      .post(`/api/v1/quizzes/${built.quizId}/attempt/submit`)
      .set("authorization", `Bearer ${studentToken}`);

    const resubmit = await request(app)
      .post(`/api/v1/quizzes/${built.quizId}/attempt/submit`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(resubmit.status).toBe(409);
    expect(resubmit.body.error.code).toBe("attempt_closed");

    const lateSave = await request(app)
      .patch(`/api/v1/quizzes/${built.quizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ answers: [{ questionId: built.mcqId, selectedIndex: 0, text: null }] });
    expect(lateSave.status).toBe(409);
    expect(lateSave.body.error.code).toBe("attempt_closed");

    const restart = await request(app)
      .put(`/api/v1/quizzes/${built.quizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`);
    // R45: one attempt per student unless staff reopen it.
    expect(restart.status).toBe(409);
    expect(restart.body.error.code).toBe("attempt_closed");
  });

  it("refuses an attempt from staff and from a student outside the season", async () => {
    const staff = await request(app)
      .put(`/api/v1/quizzes/${onlineQuizId}/attempt`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(staff.status).toBe(403);

    const outsider = await createTestUser("outsider", "STUDENT");
    const outsiderToken = await login(app, outsider.email);
    const res = await request(app)
      .put(`/api/v1/quizzes/${onlineQuizId}/attempt`)
      .set("authorization", `Bearer ${outsiderToken}`);
    expect(res.status).toBe(403);
  });
});
