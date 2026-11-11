import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { closeAttempt, closeIfExpired } from "../../lib/quizzes/close-attempt";
import { createFirstAttempt } from "../../lib/quizzes/start-attempt";
import { toScore } from "../../lib/quizzes/score";
import { bearer, cleanupTestData } from "./fixtures";
import { buildPublishedQuizIn, keyOf, quizGradedCountFor, seedQuizFixtures, type QuizFixtures } from "./quizzes-setup";

/*
 * Timing (spec "Timing"): the start window limits starting only, the time
 * limit runs from the student's first open, and the server closes an expired
 * attempt on the next read or write. No fake clocks: a deadline is moved into
 * the past in the database instead.
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
const ago = (ms: number) => new Date(Date.now() - ms);
const fromNow = (ms: number) => new Date(Date.now() + ms);

const start = (quizId: number) => request(app).put(`/api/v1/quizzes/${quizId}/attempt`).set(bearer(f.studentToken));
const save = (quizId: number, answers: unknown[]) =>
  request(app).patch(`/api/v1/quizzes/${quizId}/attempt`).set(bearer(f.studentToken)).send({ answers });
const submit = (quizId: number) =>
  request(app).post(`/api/v1/quizzes/${quizId}/attempt/submit`).set(bearer(f.studentToken));
const patchQuiz = (quizId: number, body: object) =>
  request(app).patch(`/api/v1/quizzes/${quizId}`).set(bearer(f.adminToken)).send(body);

/** A published quiz (single choice, 2 points, + true/false, 1 point) with the given timing. */
async function timedQuiz(timing: { startsFrom?: Date; startsUntil?: Date; timeLimitMinutes?: number }) {
  const built = await buildPublishedQuizIn(f.seasonId, f.sessionId, { withEssay: false, withTypes: ["TRUE_FALSE"] });
  await db.quiz.update({ where: { id: built.quizId }, data: timing });
  return built;
}

function latest(quizId: number) {
  return db.quizAttempt.findFirstOrThrow({
    where: { quizId, studentUserId: f.ownStudentId },
    orderBy: { attemptNumber: "desc" },
    select: {
      id: true,
      attemptNumber: true,
      status: true,
      deadlineAt: true,
      endReason: true,
      endedById: true,
      autoScore: true,
      totalScore: true,
    },
  });
}

const setDeadline = (attemptId: number, deadlineAt: Date) =>
  db.quizAttempt.update({ where: { id: attemptId }, data: { deadlineAt } });

async function pickParis(questionId: number) {
  return { type: "SINGLE_CHOICE", questionId, optionId: (await keyOf(questionId)).optionId("Paris") };
}

describe("the start window", () => {
  it("refuses a start before the window opens", async () => {
    const { quizId } = await timedQuiz({ startsFrom: fromNow(60 * MIN), startsUntil: fromNow(90 * MIN) });
    const res = await start(quizId);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("quiz_not_open_yet");
    expect(res.body.error.message).toMatch(/^This quiz opens at .+\.$/);
    expect(await db.quizAttempt.count({ where: { quizId } })).toBe(0);
  });

  it("refuses a start after the window closes", async () => {
    const { quizId } = await timedQuiz({ startsFrom: ago(90 * MIN), startsUntil: ago(60 * MIN) });
    const res = await start(quizId);
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({ code: "quiz_start_closed", message: "The time to start this quiz has passed." });
  });

  it("allows a start at startsUntil exactly, and refuses one second later", async () => {
    const until = fromNow(30 * MIN);
    const { quizId } = await timedQuiz({ startsFrom: ago(MIN), startsUntil: until });
    await expect(createFirstAttempt(quizId, f.ownStudentId, new Date(until.getTime() + 1000))).rejects.toMatchObject({
      code: "quiz_start_closed",
    });
    await createFirstAttempt(quizId, f.ownStudentId, until);
    expect((await latest(quizId)).attemptNumber).toBe(1);
  });

  it("lets a student start inside the window over the route", async () => {
    const { quizId } = await timedQuiz({ startsFrom: ago(MIN), startsUntil: fromNow(MIN) });
    const res = await start(quizId);
    expect(res.status).toBe(200);
    expect(res.body.data.stage).toBe("in_progress");
  });
});

describe("the time limit", () => {
  it("sets the deadline on first open and does not move it on re-open", async () => {
    const { quizId } = await timedQuiz({ timeLimitMinutes: 20 });
    const before = Date.now();
    const first = await start(quizId);
    expect(first.status).toBe(200);
    const { deadlineAt } = await latest(quizId);
    expect(deadlineAt).not.toBeNull();
    const ms = (deadlineAt as Date).getTime();
    expect(ms).toBeGreaterThanOrEqual(before + 20 * MIN - 1000);
    expect(ms).toBeLessThanOrEqual(Date.now() + 20 * MIN + 1000);
    expect(first.body.data.deadlineAt).toBe((deadlineAt as Date).toISOString());
    expect(typeof first.body.data.serverNow).toBe("string");

    const again = await start(quizId);
    expect(again.status).toBe(200);
    expect((await latest(quizId)).deadlineAt).toEqual(deadlineAt);
  });

  it("leaves an untimed attempt without a deadline", async () => {
    const { quizId } = await timedQuiz({});
    await start(quizId);
    expect((await latest(quizId)).deadlineAt).toBeNull();
  });

  it("lands a save 5 s after the deadline; refuses one 15 s after and closes the attempt TIMED_OUT", async () => {
    const { quizId, mcqId } = await timedQuiz({ timeLimitMinutes: 20 });
    await start(quizId);
    const { id } = await latest(quizId);

    await setDeadline(id, ago(5000));
    const late = await save(quizId, [await pickParis(mcqId)]);
    expect(late.status).toBe(200);
    expect(await db.quizAnswer.count({ where: { attemptId: id } })).toBe(1);

    await setDeadline(id, ago(15000));
    const tooLate = await save(quizId, [await pickParis(mcqId)]);
    expect(tooLate.status).toBe(409);
    expect(tooLate.body.error.code).toBe("attempt_closed");
    const closed = await latest(quizId);
    expect(closed.status).toBe("GRADED");
    expect(closed.endReason).toBe("TIMED_OUT");
    expect(toScore(closed.totalScore)).toBe(2);
  });

  it("refuses a submit after the deadline as attempt_closed, the attempt TIMED_OUT with partial marks", async () => {
    const { quizId, mcqId, questionIds } = await timedQuiz({ timeLimitMinutes: 20 });
    const trueFalseId = questionIds[1] as number;
    await start(quizId);
    expect((await save(quizId, [await pickParis(mcqId)])).status).toBe(200);
    const { id } = await latest(quizId);
    await setDeadline(id, ago(MIN));
    const before = await quizGradedCountFor(f.ownStudentId);

    const res = await submit(quizId);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("attempt_closed");

    const closed = await latest(quizId);
    expect(closed).toMatchObject({ status: "GRADED", endReason: "TIMED_OUT", endedById: null });
    expect(toScore(closed.autoScore)).toBe(2);
    expect(toScore(closed.totalScore)).toBe(2);
    // Unanswered scores 0, on record.
    const unanswered = await db.quizAnswer.findUniqueOrThrow({
      where: { attemptId_questionId: { attemptId: id, questionId: trueFalseId } },
      select: { isCorrect: true, pointsAwarded: true },
    });
    expect(unanswered.isCorrect).toBe(false);
    expect(toScore(unanswered.pointsAwarded)).toBe(0);
    // A time-out that grades tells the student, once.
    expect((await quizGradedCountFor(f.ownStudentId)) - before).toBe(1);
  });

  it("the student's own read closes an expired attempt (no grace on reads)", async () => {
    const { quizId } = await timedQuiz({ timeLimitMinutes: 20 });
    await start(quizId);
    await setDeadline((await latest(quizId)).id, ago(3000));
    const res = await request(app).get(`/api/v1/quizzes/${quizId}`).set(bearer(f.studentToken));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: "GRADED", endReason: "TIMED_OUT" });
  });

  it("a normal submit records endReason SUBMITTED", async () => {
    const { quizId, mcqId, questionIds } = await timedQuiz({ timeLimitMinutes: 20 });
    await start(quizId);
    const tf = await keyOf(questionIds[1] as number);
    await save(quizId, [
      await pickParis(mcqId),
      { type: "TRUE_FALSE", questionId: questionIds[1], optionId: tf.optionId("True") },
    ]);
    const res = await submit(quizId);
    expect(res.status).toBe(200);
    expect((await latest(quizId)).endReason).toBe("SUBMITTED");
  });
});

describe("closing", () => {
  it("the staff list closes an expired attempt of a phone that never came back", async () => {
    const { quizId } = await timedQuiz({ timeLimitMinutes: 20 });
    await start(quizId);
    await setDeadline((await latest(quizId)).id, ago(MIN));

    const res = await request(app).get(`/api/v1/quizzes/${quizId}/attempts`).set(bearer(f.leaderToken));
    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([expect.objectContaining({ studentUserId: f.ownStudentId, status: "GRADED" })]);
    expect(res.body.data.waiting).toEqual([]);
    expect((await latest(quizId)).endReason).toBe("TIMED_OUT");
  });

  it("closes once when two closes race", async () => {
    const { quizId } = await timedQuiz({ timeLimitMinutes: 20 });
    await start(quizId);
    const { id } = await latest(quizId);
    const results = await Promise.all([closeAttempt(id, "ENDED_BY_STAFF", null), closeAttempt(id, "TIMED_OUT", null)]);
    expect(results.filter((r) => r.closed)).toHaveLength(1);
    expect(await closeAttempt(id, "TIMED_OUT", null)).toEqual({ closed: false });
  });

  it("a close racing the student's submit: exactly one wins, the other is attempt_closed or a no-op", async () => {
    const { quizId, mcqId, questionIds } = await timedQuiz({ timeLimitMinutes: 20 });
    await start(quizId);
    const tf = await keyOf(questionIds[1] as number);
    await save(quizId, [
      await pickParis(mcqId),
      { type: "TRUE_FALSE", questionId: questionIds[1], optionId: tf.optionId("True") },
    ]);
    const { id } = await latest(quizId);
    const [closed, submitted] = await Promise.all([closeAttempt(id, "ENDED_BY_STAFF", null), submit(quizId)]);
    const submitWon = submitted.status === 200;
    expect(closed.closed).toBe(!submitWon);
    if (!submitWon) expect(submitted.body.error.code).toBe("attempt_closed");
    expect((await latest(quizId)).endReason).toBe(submitWon ? "SUBMITTED" : "ENDED_BY_STAFF");
  });

  it("closeIfExpired leaves an attempt before its deadline alone", async () => {
    const { quizId } = await timedQuiz({ timeLimitMinutes: 20 });
    await start(quizId);
    const { id } = await latest(quizId);
    expect(await closeIfExpired(id)).toBe(false);
    expect((await latest(quizId)).status).toBe("IN_PROGRESS");
  });

  it("a reopened timed-out attempt gets a fresh deadline when opened, even after the window", async () => {
    const { quizId } = await timedQuiz({ timeLimitMinutes: 20 });
    await start(quizId);
    await setDeadline((await latest(quizId)).id, ago(MIN));
    expect(await closeIfExpired((await latest(quizId)).id)).toBe(true);
    await db.quiz.update({ where: { id: quizId }, data: { startsFrom: ago(120 * MIN), startsUntil: ago(60 * MIN) } });

    const reopen = await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/reopen`)
      .set(bearer(f.leaderToken))
      .send({ studentUserId: f.ownStudentId });
    expect(reopen.status).toBe(201);
    expect((await latest(quizId)).deadlineAt).toBeNull();

    const opened = await start(quizId);
    expect(opened.status).toBe(200);
    const fresh = await latest(quizId);
    expect(fresh.attemptNumber).toBe(2);
    expect((fresh.deadlineAt as Date).getTime()).toBeGreaterThan(Date.now() + 19 * MIN);
  });
});

describe("editing timing", () => {
  it("sets the window and the limit before any attempt", async () => {
    const { quizId } = await timedQuiz({});
    const from = fromNow(MIN).toISOString();
    const until = fromNow(30 * MIN).toISOString();
    const res = await patchQuiz(quizId, { startsFrom: from, startsUntil: until, timeLimitMinutes: 20 });
    expect(res.status).toBe(200);
    const quiz = await db.quiz.findUniqueOrThrow({ where: { id: quizId } });
    expect(quiz.startsFrom?.toISOString()).toBe(from);
    expect(quiz.startsUntil?.toISOString()).toBe(until);
    expect(quiz.timeLimitMinutes).toBe(20);
  });

  it("refuses a window edit whose ends cross the stored other end", async () => {
    const { quizId } = await timedQuiz({ startsFrom: fromNow(60 * MIN) });
    const res = await patchQuiz(quizId, { startsUntil: fromNow(30 * MIN).toISOString() });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
  });

  it("freezes the time limit once attempts exist; the window can still change", async () => {
    const { quizId } = await timedQuiz({ timeLimitMinutes: 20, startsFrom: ago(MIN), startsUntil: fromNow(MIN) });
    await start(quizId);

    const limit = await patchQuiz(quizId, { timeLimitMinutes: 30 });
    expect(limit.status).toBe(409);
    expect(limit.body.error.code).toBe("quiz_has_attempts");
    // Sending the value it already has is not a change.
    expect((await patchQuiz(quizId, { timeLimitMinutes: 20 })).status).toBe(200);

    const until = fromNow(60 * MIN).toISOString();
    const window = await patchQuiz(quizId, { startsUntil: until });
    expect(window.status).toBe(200);
    const quiz = await db.quiz.findUniqueOrThrow({ where: { id: quizId } });
    expect(quiz).toMatchObject({ timeLimitMinutes: 20 });
    expect(quiz.startsUntil?.toISOString()).toBe(until);
  });
});
