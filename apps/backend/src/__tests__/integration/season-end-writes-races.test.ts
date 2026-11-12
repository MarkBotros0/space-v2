import request from "supertest";

import { db } from "../../db/client";
import { lockSeason } from "../../lib/roles";
import { bearer, cleanupTestData } from "./fixtures";
import { behind, holdTransaction } from "./lock-holds";
import { app, bodyFrom, endCheck, postEnd, seedEndWorld, type EndWorld } from "./season-end-passing-setup";

/*
 * A staff write that changes a score (an attendance save, a paper grade, a leader's grading or a
 * reopened retake) takes the Season FOR SHARE
 * first, as a staff mark and the admin's score do. End takes it FOR NO KEY UPDATE, so the write
 * lands wholly before End (and End then sees the changed score) or waits for End and finds the
 * season finished. A super may still write a finished season, as today; anyone else, whose grants
 * End takes away, gets the 403 they would get on their next request.
 */
jest.setTimeout(90000);

const DAY = 86_400_000;

beforeEach(async () => {
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

/** A past session with both students marked PRESENT, so attendance carries weight. */
async function withSession(w: EndWorld) {
  // Enrolled before it, so it is theirs to attend.
  await db.seasonEnrollment.updateMany({
    where: { seasonId: w.seasonId },
    data: { enrolledAt: new Date(Date.now() - 10 * DAY) },
  });
  const session = await db.session.create({
    data: { seasonId: w.seasonId, title: "Week 1", startsAt: new Date(Date.now() - 3 * DAY) },
  });
  await db.attendance.createMany({
    data: [w.users.high.id, w.users.low.id].map((studentUserId) => ({
      sessionId: session.id,
      studentUserId,
      status: "PRESENT" as const,
    })),
  });
  return session.id;
}

const CRITERIA = { weights: { attendance: 40, assignments: 30, quizzes: 30 }, passMark: 60 };

/** End's first two steps, held open: the Season FOR NO KEY UPDATE and the claim. */
const holdEnd = (seasonId: number) =>
  holdTransaction(async (tx) => {
    await lockSeason(tx, seasonId, "update");
    await tx.season.update({ where: { id: seasonId }, data: { status: "COMPLETED" } });
  });

const saveAttendance = (sessionId: number, token: string, studentUserId: number) =>
  request(app)
    .post(`/api/v1/sessions/${sessionId}/attendance`)
    .set(bearer(token))
    .send({ entries: [{ studentUserId, status: "ABSENT" }] });

const saveGrade = (quizId: number, token: string, studentUserId: number) =>
  request(app)
    .post(`/api/v1/quizzes/${quizId}/grades`)
    .set(bearer(token))
    .send({ entries: [{ studentUserId, score: 100, notes: null }] });

/** A published ONLINE quiz with one essay, and the low student's GRADED attempt at it (5 of 5). */
async function withGradedAttempt(w: EndWorld) {
  const quiz = await db.quiz.create({
    data: { seasonId: w.seasonId, title: "Online", kind: "ONLINE", maxScore: 5, publishedAt: new Date() },
  });
  const question = await db.quizQuestion.create({
    data: { quizId: quiz.id, order: 1, type: "ESSAY", prompt: "Why?", points: 5, options: [] },
  });
  const attempt = await db.quizAttempt.create({
    data: {
      quizId: quiz.id,
      studentUserId: w.users.low.id,
      attemptNumber: 1,
      status: "GRADED",
      autoScore: 0,
      manualScore: 5,
      totalScore: 5,
      shuffleSeed: 1,
      submittedAt: new Date(),
    },
  });
  await db.quizAnswer.create({
    data: { attemptId: attempt.id, questionId: question.id, text: "Because", isCorrect: true, pointsAwarded: 5 },
  });
  return { quizId: quiz.id, questionId: question.id, attemptId: attempt.id };
}

describe("staff writes against End", () => {
  it("an attendance save waits for End and, finding the season finished, writes nothing", async () => {
    const w = await seedEndWorld();
    const sessionId = await withSession(w);
    const held = await holdEnd(w.seasonId);
    const res = await behind(held, () => saveAttendance(sessionId, w.tokens.admin, w.users.low.id));
    expect(res.status).toBe(403);
    const row = await db.attendance.findFirstOrThrow({ where: { sessionId, studentUserId: w.users.low.id } });
    expect(row.status).toBe("PRESENT");
  });

  it("a paper grade waits for End and, finding the season finished, writes nothing", async () => {
    const w = await seedEndWorld();
    const held = await holdEnd(w.seasonId);
    const res = await behind(held, () => saveGrade(w.quizId!, w.tokens.admin, w.users.low.id));
    expect(res.status).toBe(403);
    const grade = await db.quizGrade.findFirstOrThrow({ where: { quizId: w.quizId!, studentUserId: w.users.low.id } });
    expect(Number(grade.score)).toBe(30);
  });

  it("a leader's re-grade and a reopened retake wait for End and, finding the season finished, write nothing", async () => {
    const w = await seedEndWorld();
    const q = await withGradedAttempt(w);
    const held = await holdEnd(w.seasonId);
    const regrade = await behind(held, () =>
      request(app)
        .post(`/api/v1/quizzes/${q.quizId}/attempts/${q.attemptId}/grade`)
        .set(bearer(w.tokens.leader))
        .send({ marks: [{ questionId: q.questionId, blankId: null, correct: false }] }),
    );
    expect(regrade.status).toBe(403);
    const attempt = await db.quizAttempt.findUniqueOrThrow({ where: { id: q.attemptId } });
    expect(Number(attempt.totalScore)).toBe(5);

    await db.season.update({ where: { id: w.seasonId }, data: { status: "ACTIVE" } });
    const heldAgain = await holdEnd(w.seasonId);
    const reopen = await behind(heldAgain, () =>
      request(app)
        .post(`/api/v1/quizzes/${q.quizId}/attempts/reopen`)
        .set(bearer(w.tokens.leader))
        .send({ studentUserId: w.users.low.id }),
    );
    expect(reopen.status).toBe(403);
    expect(await db.quizAttempt.count({ where: { quizId: q.quizId } })).toBe(1);
  });

  it("End waits for an attendance re-save holding the season, then refuses the score it changed", async () => {
    const w = await seedEndWorld();
    const sessionId = await withSession(w);
    const shown = await endCheck(w.seasonId, w.tokens.admin);

    // An attendance re-save in flight: the Season FOR SHARE, then the row, as the save does.
    const held = await holdTransaction(
      (tx) => lockSeason(tx, w.seasonId, "share"),
      (tx) =>
        tx.attendance.update({
          where: { sessionId_studentUserId: { sessionId, studentUserId: w.users.low.id } },
          data: { status: "ABSENT" },
        }),
    );
    const res = await behind(held, () => postEnd(w.seasonId, w.tokens.admin, bodyFrom(shown, CRITERIA)));
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe("The scores changed; check the season again.");
    expect((await db.season.findUniqueOrThrow({ where: { id: w.seasonId } })).status).toBe("ACTIVE");
  });

  it("a super still saves attendance and grades in a finished season", async () => {
    const w = await seedEndWorld();
    const sessionId = await withSession(w);
    await db.season.update({ where: { id: w.seasonId }, data: { status: "COMPLETED" } });
    expect((await saveAttendance(sessionId, w.tokens.super, w.users.low.id)).status).toBe(200);
    expect((await saveGrade(w.quizId!, w.tokens.super, w.users.low.id)).status).toBe(200);
  });
});
