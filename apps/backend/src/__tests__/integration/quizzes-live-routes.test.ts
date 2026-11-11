import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { bearer, cleanupTestData } from "./fixtures";
import { buildPublishedQuizIn, seedQuizFixtures, setLatestAttempt, type QuizFixtures } from "./quizzes-setup";

/* The staff live screen and the exit log on the grading list (plan "Quiz integrity", Task 2). */
jest.setTimeout(60000);

const app = createApp();
let f: QuizFixtures;

beforeAll(async () => {
  f = await seedQuizFixtures(app);
});

afterAll(async () => {
  await cleanupTestData();
});

const live = (quizId: number, token = f.adminToken) =>
  request(app).get(`/api/v1/quizzes/${quizId}/live`).set(bearer(token));

async function newQuiz(timeLimitMinutes: number | null = null) {
  const { quizId } = await buildPublishedQuizIn(f.seasonId, f.sessionId, { withEssay: false });
  await db.quiz.update({ where: { id: quizId }, data: { timeLimitMinutes } });
  return quizId;
}

async function startOwn(quizId: number) {
  const res = await request(app).put(`/api/v1/quizzes/${quizId}/attempt`).set(bearer(f.studentToken));
  expect(res.status).toBeLessThan(300);
  return db.quizAttempt.findFirstOrThrow({
    where: { quizId, studentUserId: f.ownStudentId },
    orderBy: { attemptNumber: "desc" },
    select: { id: true },
  });
}

const addEvent = (attemptId: number, kind: "EXIT" | "RELAUNCH" | "SCREENSHOT", leftAt: Date, n: number) =>
  db.quizAttemptEvent.create({
    data: { attemptId, kind, clientEventId: `00000000-0000-4000-8000-00000000${String(n).padStart(4, "0")}`, leftAt },
  });

describe("GET /quizzes/:id/live", () => {
  it("live lists every student in scope with state", async () => {
    const quizId = await newQuiz();
    const before = await live(quizId);
    expect(before.status).toBe(200);
    expect(before.body.data.quizId).toBe(quizId);
    expect(before.body.data.timeLimitMinutes).toBeNull();
    expect(typeof before.body.data.serverNow).toBe("string");
    const states = Object.fromEntries(
      before.body.data.rows.map((r: { studentUserId: number; state: string }) => [r.studentUserId, r.state]),
    );
    expect(states).toEqual({ [f.ownStudentId]: "not_started", [f.otherGroupStudentId]: "not_started" });

    await startOwn(quizId);
    const open = (await live(quizId)).body.data.rows;
    const own = open.find((r: { studentUserId: number }) => r.studentUserId === f.ownStudentId);
    expect(own).toMatchObject({ state: "in_progress", groupName: "Group A", exits: 0, lastExitAt: null });
    // The in_progress student sorts before the not started one.
    expect(open[0].studentUserId).toBe(f.ownStudentId);

    await setLatestAttempt(quizId, f.ownStudentId, { status: "SUBMITTED" });
    const done = (await live(quizId)).body.data.rows;
    expect(done.find((r: { studentUserId: number }) => r.studentUserId === f.ownStudentId).state).toBe("submitted");
    // Not started comes before finished.
    expect(done[0].studentUserId).toBe(f.otherGroupStudentId);
    // No answer content anywhere in the body.
    expect(JSON.stringify(done)).not.toMatch(/answers|isCorrect|options/);
  });

  it("exits and lastExitAt reflect events", async () => {
    const quizId = await newQuiz();
    const { id } = await startOwn(quizId);
    const t1 = new Date(Date.now() - 60_000);
    const t2 = new Date(Date.now() - 30_000);
    await addEvent(id, "EXIT", t1, 1);
    await addEvent(id, "RELAUNCH", t2, 2);
    await addEvent(id, "SCREENSHOT", new Date(), 3);
    const rows = (await live(quizId)).body.data.rows;
    expect(rows[0]).toMatchObject({
      studentUserId: f.ownStudentId,
      state: "in_progress",
      exits: 2,
      lastExitAt: t2.toISOString(),
    });
  });

  it("expired attempt shows timed_out", async () => {
    const quizId = await newQuiz(30);
    const { id } = await startOwn(quizId);
    await db.quizAttempt.update({ where: { id }, data: { deadlineAt: new Date(Date.now() - 5 * 60_000) } });
    const rows = (await live(quizId)).body.data.rows;
    const own = rows.find((r: { studentUserId: number }) => r.studentUserId === f.ownStudentId);
    expect(own).toMatchObject({ state: "timed_out", deadlineAt: null });
    expect((await db.quizAttempt.findUniqueOrThrow({ where: { id } })).endReason).toBe("TIMED_OUT");
  });

  it("ended by exits and by staff map from the end reason", async () => {
    const quizId = await newQuiz();
    const { id } = await startOwn(quizId);
    await db.quizAttempt.update({
      where: { id },
      data: { status: "GRADED", endReason: "ENDED_BY_EXITS", submittedAt: new Date() },
    });
    const own = (rows: { studentUserId: number }[]) => rows.find((r) => r.studentUserId === f.ownStudentId);
    expect(own((await live(quizId)).body.data.rows)).toMatchObject({ state: "ended_by_exits" });
    await db.quizAttempt.update({ where: { id }, data: { endReason: "ENDED_BY_STAFF" } });
    expect(own((await live(quizId)).body.data.rows)).toMatchObject({ state: "ended_by_staff" });
  });

  it("leader sees only their students; admin and super see all", async () => {
    const quizId = await newQuiz();
    const ids = async (token: string) =>
      (await live(quizId, token)).body.data.rows.map((r: { studentUserId: number }) => r.studentUserId).sort();
    expect(await ids(f.leaderToken)).toEqual([f.ownStudentId]);
    expect(await ids(f.adminToken)).toEqual([f.ownStudentId, f.otherGroupStudentId].sort());
    expect(await ids(f.superToken)).toEqual([f.ownStudentId, f.otherGroupStudentId].sort());
  });

  it("students and other seasons' admins are refused; unknown quiz is 404", async () => {
    const quizId = await newQuiz();
    expect((await live(quizId, f.studentToken)).status).toBe(403);
    expect((await live(quizId, f.otherAdminToken)).status).toBe(403);
    expect((await live(999999999)).status).toBe(404);
  });
});

describe("GET /quizzes/:id/attempts exit log", () => {
  it("grading attempts carry the exit log", async () => {
    const quizId = await newQuiz();
    const { id } = await startOwn(quizId);
    const t1 = new Date(Date.now() - 60_000);
    const t2 = new Date(Date.now() - 30_000);
    await addEvent(id, "RELAUNCH", t2, 11);
    await addEvent(id, "EXIT", t1, 12);
    await db.quizAttemptEvent.updateMany({
      where: { attemptId: id, kind: "EXIT" },
      data: { returnedAt: new Date(t1.getTime() + 5_000) },
    });
    await db.quizAttempt.update({
      where: { id },
      data: { status: "GRADED", endReason: "ENDED_BY_EXITS", submittedAt: new Date() },
    });
    const res = await request(app).get(`/api/v1/quizzes/${quizId}/attempts`).set(bearer(f.adminToken));
    expect(res.status).toBe(200);
    const item = res.body.data.items.find((i: { attemptId: number }) => i.attemptId === id);
    expect(item.endReason).toBe("ENDED_BY_EXITS");
    expect(item.endedByName).toBeNull();
    expect(item.events).toEqual([
      { kind: "EXIT", leftAt: t1.toISOString(), returnedAt: new Date(t1.getTime() + 5_000).toISOString() },
      { kind: "RELAUNCH", leftAt: t2.toISOString(), returnedAt: null },
    ]);
    for (const w of res.body.data.waiting) expect(w).toHaveProperty("endReason", null);
  });

  it("an ended-by-staff attempt names who ended it, and an open one shows its deadline in waiting", async () => {
    const quizId = await newQuiz(30);
    const { id } = await startOwn(quizId);
    const deadline = new Date(Date.now() + 20 * 60_000);
    await db.quizAttempt.update({ where: { id }, data: { deadlineAt: deadline } });
    const open = await request(app).get(`/api/v1/quizzes/${quizId}/attempts`).set(bearer(f.adminToken));
    const waiting = open.body.data.waiting.find((w: { studentUserId: number }) => w.studentUserId === f.ownStudentId);
    expect(waiting.deadlineAt).toBe(deadline.toISOString());

    const admin = await db.user.findFirstOrThrow({ where: { name: "Test admin" }, select: { id: true } });
    await db.quizAttempt.update({
      where: { id },
      data: { status: "GRADED", endReason: "ENDED_BY_STAFF", endedById: admin.id, submittedAt: new Date() },
    });
    const res = await request(app).get(`/api/v1/quizzes/${quizId}/attempts`).set(bearer(f.adminToken));
    const item = res.body.data.items.find((i: { attemptId: number }) => i.attemptId === id);
    expect(item).toMatchObject({ endReason: "ENDED_BY_STAFF", endedByName: "Test admin", events: [] });
  });
});
