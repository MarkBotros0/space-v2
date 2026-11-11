import { randomUUID } from "node:crypto";
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { recordAttemptEvents } from "../../lib/quizzes/attempt-events";
import { createFirstAttempt } from "../../lib/quizzes/start-attempt";
import { bearer, cleanupTestData, login } from "./fixtures";
import { buildPublishedQuizIn, quizGradedCountFor, seedQuizFixtures, type QuizFixtures } from "./quizzes-setup";

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
/** An event that happened now: after the attempt was created, so it is that attempt's. */
const event = (kind: Kind = "EXIT", clientEventId = randomUUID(), leftAt = new Date()) => ({
  clientEventId,
  kind,
  leftAt: leftAt.toISOString(),
  returnedAt: new Date(leftAt.getTime() + 1_000).toISOString(),
});

const post = (quizId: number, events: unknown[], token = f.studentToken) =>
  request(app).post(`/api/v1/quizzes/${quizId}/attempt/events`).set(bearer(token)).send({ events });

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
    await post(quizId, [event(), event()]);
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

  it("an event from before the attempt existed (a replay onto a retake) is dropped", async () => {
    const quizId = await openQuiz();
    const { id } = await latest(quizId);
    const created = (await db.quizAttempt.findUniqueOrThrow({ where: { id }, select: { createdAt: true } })).createdAt;
    const old = (n: number) => event("EXIT", randomUUID(), new Date(created.getTime() - n * 60_000));
    const res = await post(quizId, [old(3), old(2), old(1)]);
    expect(res.body.data).toEqual({ exits: 0, ended: false, status: "IN_PROGRESS" });
    expect(await storedEvents(quizId)).toBe(0);
    // Mixed with one of its own: only that one counts.
    expect((await post(quizId, [old(1), event()])).body.data.exits).toBe(1);
    expect(await storedEvents(quizId)).toBe(1);
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

  it("refuses an event from the future and a bad body", async () => {
    const quizId = await openQuiz();
    const future = { ...event(), leftAt: new Date(Date.now() + 5 * 60_000).toISOString(), returnedAt: null };
    const res = await post(quizId, [future]);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("event_in_future");
    expect((await post(quizId, [])).status).toBe(400);
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
