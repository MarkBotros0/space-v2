import { randomUUID } from "node:crypto";
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { recordAttemptEvents } from "../../lib/quizzes/attempt-events";
import { createFirstAttempt } from "../../lib/quizzes/start-attempt";
import { bearer, cleanupTestData, login } from "./fixtures";
import {
  buildPublishedQuizIn,
  quizGradedCountFor,
  seedQuizFixtures,
  setLatestAttempt,
  type QuizFixtures,
} from "./quizzes-setup";

/* The phone's exit reports (plan "Quiz integrity", Task 1): the server counts, the third exit ends the attempt. */
jest.setTimeout(60000);

const app = createApp();
let f: QuizFixtures;
let otherStudentToken: string;

beforeAll(async () => {
  f = await seedQuizFixtures(app);
  const other = await db.user.findUniqueOrThrow({ where: { id: f.otherGroupStudentId }, select: { email: true } });
  otherStudentToken = await login(app, other.email);
});

afterAll(async () => {
  await cleanupTestData();
});

type Kind = "EXIT" | "RELAUNCH" | "SCREENSHOT";
/** An event that happened just now, by the phone's clock. */
const event = (kind: Kind = "EXIT", clientEventId = randomUUID(), leftAt = new Date()) => ({
  clientEventId,
  kind,
  leftAt: leftAt.toISOString(),
  returnedAt: new Date(leftAt.getTime() + 1_000).toISOString(),
});

/** Posts as the phone does: naming the attempt it saw, by default the own student's latest. */
async function post(quizId: number, events: unknown[], token = f.studentToken, attemptId?: number) {
  const seen =
    attemptId ??
    (
      await db.quizAttempt.findFirst({
        where: { quizId, studentUserId: f.ownStudentId },
        orderBy: { attemptNumber: "desc" },
        select: { id: true },
      })
    )?.id ??
    1;
  return request(app)
    .post(`/api/v1/quizzes/${quizId}/attempt/events`)
    .set(bearer(token))
    .send({ attemptId: seen, events });
}

/** A started attempt with the choice question answered correctly, so a close has something to mark. */
async function openQuiz() {
  const { quizId, mcqId } = await buildPublishedQuizIn(f.seasonId, f.sessionId, { withEssay: false });
  const student = bearer(f.studentToken);
  await request(app).put(`/api/v1/quizzes/${quizId}/attempt`).set(student);
  const right = await db.quizOption.findFirstOrThrow({ where: { questionId: mcqId, isCorrect: true } });
  const saved = await request(app)
    .patch(`/api/v1/quizzes/${quizId}/attempt`)
    .set(student)
    .send({ answers: [{ type: "SINGLE_CHOICE", questionId: mcqId, optionId: right.id }] });
  expect(saved.status).toBe(200);
  return quizId;
}

const latest = (quizId: number) =>
  db.quizAttempt.findFirstOrThrow({
    where: { quizId, studentUserId: f.ownStudentId },
    orderBy: { attemptNumber: "desc" },
    select: { id: true, status: true, endReason: true, totalScore: true },
  });

const storedEvents = async (quizId: number) => db.quizAttemptEvent.count({ where: { attempt: { quizId } } });

describe("POST /quizzes/:id/attempt/events", () => {
  it("first and second exit return ended false", async () => {
    const quizId = await openQuiz();
    const first = await post(quizId, [event()]);
    expect(first.status).toBe(200);
    expect(first.body.data).toEqual({ exits: 1, ended: false, status: "IN_PROGRESS" });
    const second = await post(quizId, [event()]);
    expect(second.body.data).toEqual({ exits: 2, ended: false, status: "IN_PROGRESS" });
    expect((await latest(quizId)).status).toBe("IN_PROGRESS");
  });

  it("third exit ends the attempt ENDED_BY_EXITS and marks saved answers", async () => {
    const quizId = await openQuiz();
    const before = await quizGradedCountFor(f.ownStudentId);
    await post(quizId, [event(), event()]);
    const third = await post(quizId, [event()]);
    expect(third.status).toBe(200);
    expect(third.body.data).toEqual({ exits: 3, ended: true, status: "GRADED" });
    const after = await latest(quizId);
    expect(after.status).toBe("GRADED");
    expect(after.endReason).toBe("ENDED_BY_EXITS");
    // The saved right answer is marked: 2 points.
    expect(Number(after.totalScore)).toBe(2);
    // One "Your score is in", sent after the commit.
    expect(await quizGradedCountFor(f.ownStudentId)).toBe(before + 1);
    // A fourth exit after the close is ignored: no second close, no error.
    const fourth = await post(quizId, [event()]);
    expect(fourth.status).toBe(200);
    expect(fourth.body.data).toEqual({ exits: 3, ended: false, status: "GRADED" });
    expect(await quizGradedCountFor(f.ownStudentId)).toBe(before + 1);
  });

  it("duplicate clientEventId counts once", async () => {
    const quizId = await openQuiz();
    const one = event();
    expect((await post(quizId, [one])).body.data.exits).toBe(1);
    expect((await post(quizId, [one])).body.data.exits).toBe(1);
    // The same id twice in one batch, and a retry of the whole batch.
    const two = event();
    expect((await post(quizId, [two, two])).body.data.exits).toBe(2);
    expect((await post(quizId, [one, two])).body.data).toEqual({ exits: 2, ended: false, status: "IN_PROGRESS" });
    expect(await storedEvents(quizId)).toBe(2);
  });

  it("screenshot events don't count", async () => {
    const quizId = await openQuiz();
    const res = await post(quizId, [event("SCREENSHOT"), event("SCREENSHOT"), event("SCREENSHOT")]);
    expect(res.body.data).toEqual({ exits: 0, ended: false, status: "IN_PROGRESS" });
    // Logged all the same.
    expect(await storedEvents(quizId)).toBe(3);
  });

  it("relaunch counts as an exit", async () => {
    const quizId = await openQuiz();
    await post(quizId, [event("EXIT"), event("RELAUNCH")]);
    const third = await post(quizId, [event("RELAUNCH")]);
    expect(third.body.data).toEqual({ exits: 3, ended: true, status: "GRADED" });
    expect((await latest(quizId)).endReason).toBe("ENDED_BY_EXITS");
  });

  it("exit on a closed attempt is ignored", async () => {
    const quizId = await openQuiz();
    // Two exits that left before the deadline below.
    const early = () => event("EXIT", randomUUID(), new Date(Date.now() - 120_000));
    await post(quizId, [early(), early()]);
    // The deadline closed it (past the save grace) before the third exit arrived.
    await db.quiz.update({ where: { id: quizId }, data: { timeLimitMinutes: 30 } });
    await db.quizAttempt.updateMany({ where: { quizId }, data: { deadlineAt: new Date(Date.now() - 60_000) } });
    const before = await quizGradedCountFor(f.ownStudentId);
    const res = await post(quizId, [event()]);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ exits: 2, ended: false, status: "GRADED" });
    const after = await latest(quizId);
    expect(after.endReason).toBe("TIMED_OUT");
    expect(await storedEvents(quizId)).toBe(2);
    expect(await quizGradedCountFor(f.ownStudentId)).toBe(before + 1);
    // And once more: still closed, nothing stored, no second close.
    expect((await post(quizId, [event()])).body.data.ended).toBe(false);
    expect(await quizGradedCountFor(f.ownStudentId)).toBe(before + 1);
  });

  it("an expired attempt reaching the lock closes TIMED_OUT and stores nothing (the race past the route)", async () => {
    const quizId = await openQuiz();
    await db.quiz.update({ where: { id: quizId }, data: { timeLimitMinutes: 30 } });
    await db.quizAttempt.updateMany({ where: { quizId }, data: { deadlineAt: new Date(Date.now() - 60_000) } });
    const before = await quizGradedCountFor(f.ownStudentId);
    const { id } = await latest(quizId);
    expect(await recordAttemptEvents(id, [event(), event(), event()])).toEqual({ exits: 0, ended: false });
    expect((await latest(quizId)).endReason).toBe("TIMED_OUT");
    expect(await storedEvents(quizId)).toBe(0);
    expect(await quizGradedCountFor(f.ownStudentId)).toBe(before + 1);
  });

  it("an exit that left at or after the deadline (inside the save grace) is stored but not counted", async () => {
    const quizId = await openQuiz();
    await db.quiz.update({ where: { id: quizId }, data: { timeLimitMinutes: 30 } });
    const deadline = new Date(Date.now() - 3_000);
    await db.quizAttempt.updateMany({ where: { quizId }, data: { deadlineAt: deadline } });
    const before = (ms: number) => event("EXIT", randomUUID(), new Date(deadline.getTime() - ms));
    expect((await post(quizId, [before(60_000), before(30_000)])).body.data.exits).toBe(2);

    // Time had run out when these left: logged, never the third exit.
    const late = await post(quizId, [event("EXIT", randomUUID(), deadline), event("RELAUNCH")]);
    expect(late.status).toBe(200);
    expect(late.body.data).toEqual({ exits: 2, ended: false, status: "IN_PROGRESS" });
    expect(await storedEvents(quizId)).toBe(4);
    expect((await latest(quizId)).endReason).toBeNull();
  });

  it("two exits racing at a count of two close the attempt once", async () => {
    const quizId = await openQuiz();
    await post(quizId, [event(), event()]);
    const before = await quizGradedCountFor(f.ownStudentId);
    const [a, b] = await Promise.all([post(quizId, [event()]), post(quizId, [event()])]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect([a.body.data.ended, b.body.data.ended].filter(Boolean)).toHaveLength(1);
    expect((await latest(quizId)).endReason).toBe("ENDED_BY_EXITS");
    expect(await quizGradedCountFor(f.ownStudentId)).toBe(before + 1);
  });

  it("events queued for an older attempt (replayed onto a retake) are dropped", async () => {
    const quizId = await openQuiz();
    const first = (await latest(quizId)).id;
    await post(quizId, [event(), event()]);
    await setLatestAttempt(quizId, f.ownStudentId, { status: "GRADED" });
    const reopened = await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/reopen`)
      .set(bearer(f.leaderToken))
      .send({ studentUserId: f.ownStudentId });
    expect(reopened.status).toBe(201);
    const retake = reopened.body.data.attemptId as number;
    await request(app).put(`/api/v1/quizzes/${quizId}/attempt`).set(bearer(f.studentToken));

    const replay = await post(quizId, [event(), event(), event()], f.studentToken, first);
    expect(replay.status).toBe(200);
    expect(replay.body.data).toEqual({ exits: 0, ended: false, status: "IN_PROGRESS" });
    expect(await db.quizAttemptEvent.count({ where: { attemptId: retake } })).toBe(0);
    expect(await db.quizAttemptEvent.count({ where: { attemptId: first } })).toBe(2);
    expect((await post(quizId, [event()], f.studentToken, retake)).body.data.exits).toBe(1);
  });

  it("a reopened timed attempt not started yet stores nothing", async () => {
    const { quizId } = await buildPublishedQuizIn(f.seasonId, f.sessionId, { withEssay: false });
    await db.quiz.update({ where: { id: quizId }, data: { timeLimitMinutes: 30 } });
    await createFirstAttempt(quizId, f.ownStudentId);
    await db.quizAttempt.updateMany({ where: { quizId }, data: { deadlineAt: null } });
    const res = await post(quizId, [event(), event(), event()]);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ exits: 0, ended: false, status: "IN_PROGRESS" });
    expect(await storedEvents(quizId)).toBe(0);
  });

  it("another student's attempt is unreachable", async () => {
    const quizId = await openQuiz();
    const res = await post(quizId, [event(), event(), event()], otherStudentToken);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("no_attempt");
    expect(await storedEvents(quizId)).toBe(0);
    const staff = await post(quizId, [event()], f.leaderToken);
    expect(staff.status).toBe(403);
    expect((await latest(quizId)).status).toBe("IN_PROGRESS");
  });

  it("a phone clock running fast or absurdly slow never loses an exit: times are clamped", async () => {
    const quizId = await openQuiz();
    const { id } = await latest(quizId);
    const fast = new Date(Date.now() + 5 * 60_000);
    const res = await post(quizId, [event("EXIT", randomUUID(), fast), event("EXIT", randomUUID(), new Date(0))]);
    expect(res.status).toBe(200);
    expect(res.body.data.exits).toBe(2);
    const created = (await db.quizAttempt.findUniqueOrThrow({ where: { id }, select: { createdAt: true } })).createdAt;
    const [slow, quick] = (
      await db.quizAttemptEvent.findMany({ where: { attemptId: id }, orderBy: { leftAt: "asc" } })
    ).map((r) => ({ leftAt: r.leftAt.getTime(), returnedAt: r.returnedAt?.getTime() ?? 0 }));
    expect(slow?.leftAt).toBe(created.getTime() - 24 * 60 * 60_000);
    expect(quick?.leftAt).toBeLessThanOrEqual(Date.now());
    expect(quick?.returnedAt).toBeLessThanOrEqual(Date.now());
    expect(quick?.returnedAt).toBeGreaterThanOrEqual(quick?.leftAt ?? Infinity);
  });

  it("refuses a bad body", async () => {
    const quizId = await openQuiz();
    expect((await post(quizId, [])).status).toBe(400);
    const noAttemptId = await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempt/events`)
      .set(bearer(f.studentToken))
      .send({ events: [event()] });
    expect(noAttemptId.status).toBe(400);
    expect((await post(quizId, [{ ...event(), clientEventId: "not-a-uuid" }])).status).toBe(400);
    const backFirst = { ...event(), returnedAt: new Date(Date.now() - 60_000).toISOString() };
    expect((await post(quizId, [backFirst])).status).toBe(400);
    expect(await storedEvents(quizId)).toBe(0);
  });

  it("raw JSON of the response has no answer data", async () => {
    const quizId = await openQuiz();
    const res = await post(quizId, [event()]);
    expect(Object.keys(res.body.data).sort()).toEqual(["ended", "exits", "status"]);
    for (const word of ["isCorrect", "optionId", "answers", "Paris", "totalScore", "points"]) {
      expect(res.text).not.toContain(word);
    }
  });
});
