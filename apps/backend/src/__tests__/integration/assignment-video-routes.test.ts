import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { studentVideoPartSchema, videoPartProgressResponseSchema } from "../../../../../packages/shared/src/index";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";
import { createAssignmentWithParts } from "./assignment-reads-setup";
import { inconsistentWorks } from "./assignment-writes-setup";

// 60s: the first query after idle can be slow and beforeAll writes a lot.
jest.setTimeout(60000);

const app = createApp();

let assignmentId: number;
let longPartId: number;
let shortPartId: number;
let essayPartId: number;
let blockedAssignmentId: number;
let blockedPartId: number;
let finishedAssignmentId: number;
let finishedPartId: number;
let studentId: number;
let studentToken: string;
let outsiderToken: string;
let adminToken: string;
let leaderToken: string;

beforeAll(async () => {
  await cleanupTestData();
  const seasonId = (await createTestSeason()).id;
  const otherSeasonId = (await createTestSeason({ year: 2100 })).id;

  const student = await createTestUser("video-student", "STUDENT");
  const outsider = await createTestUser("video-outsider", "STUDENT");
  const admin = await createTestUser("video-admin", "ADMIN");
  const leader = await createTestUser("video-leader", "LEADER");
  studentId = student.id;

  const groupId = (await db.group.create({ data: { seasonId, name: "Group A" }, select: { id: true } })).id;
  await db.groupLeader.create({ data: { groupId, userId: leader.id } });
  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  await db.seasonEnrollment.createMany({
    data: [
      { seasonId, studentUserId: student.id, groupId, status: "ACTIVE" },
      // A student of another season, live there.
      { seasonId: otherSeasonId, studentUserId: outsider.id, status: "ACTIVE" },
    ],
  });

  const made = await createAssignmentWithParts({ seasonId, title: "Luke 15" }, [
    { kind: "VIDEO", title: "Luke 15 talk", durationSeconds: 1080 },
    { kind: "VIDEO", title: "Short clip", durationSeconds: 60, questions: 2 },
    { kind: "ESSAY" },
  ]);
  assignmentId = made.id;
  [longPartId, shortPartId, essayPartId] = made.partIds as [number, number, number];

  const blocked = await createAssignmentWithParts({ seasonId, title: "No skipping" }, [
    { kind: "VIDEO", title: "Watch it all", durationSeconds: 600 },
  ]);
  blockedAssignmentId = blocked.id;
  blockedPartId = blocked.partIds[0]!;
  await db.assignmentPart.update({ where: { id: blockedPartId }, data: { blockSkipping: true } });

  // The same student finished an earlier season: they still see its video, and can't add to it.
  const finishedSeasonId = (await createTestSeason({ status: "COMPLETED", year: 2098 })).id;
  await db.seasonEnrollment.create({
    data: { seasonId: finishedSeasonId, studentUserId: student.id, status: "COMPLETED" },
  });
  const finished = await createAssignmentWithParts({ seasonId: finishedSeasonId, title: "Last season" }, [
    { kind: "VIDEO", title: "Old talk", durationSeconds: 600, questions: 1 },
  ]);
  finishedAssignmentId = finished.id;
  finishedPartId = finished.partIds[0]!;

  studentToken = await login(app, student.email);
  outsiderToken = await login(app, outsider.email);
  adminToken = await login(app, admin.email);
  leaderToken = await login(app, leader.email);
});

beforeEach(async () => {
  const ids = [assignmentId, blockedAssignmentId];
  await db.sessionVideoQuestionResponse.deleteMany({
    where: { question: { assignmentPart: { assignmentId: { in: ids } } } },
  });
  await db.submission.deleteMany({ where: { assignmentId: { in: ids } } });
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const partPath = (partId: number, a = assignmentId) => `/api/v1/assignments/${a}/parts/${partId}`;

async function report(partId: number, intervals: [number, number][], position: number, a = assignmentId) {
  return request(app)
    .put(`${partPath(partId, a)}/video/progress`)
    .set(auth(studentToken))
    .send({ intervals, position });
}

/** Pretends the student's last report was `seconds` ago. */
async function lastReportAgo(partId: number, seconds: number) {
  await db.assignmentPartWork.update({
    where: { partId_studentUserId: { partId, studentUserId: studentId } },
    data: { lastReportAt: new Date(Date.now() - seconds * 1000) },
  });
}

async function answer(partId: number, questionId: number, selectedIndex = 0) {
  return request(app)
    .post(`${partPath(partId)}/video/answers`)
    .set(auth(studentToken))
    .send({ questionId, selectedIndex });
}

async function questionIds(partId: number): Promise<number[]> {
  const rows = await db.sessionVideoQuestion.findMany({
    where: { assignmentPartId: partId },
    orderBy: [{ atSeconds: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

describe("watching a video part", () => {
  it("jumping to the end is not watching", async () => {
    const res = await report(longPartId, [[1060, 1080]], 1080);
    expect(res.status).toBe(200);
    const progress = videoPartProgressResponseSchema.parse(res.body.data);
    // A first report counts at most 15 s; the end is reached, not watched.
    expect(progress).toMatchObject({ watchedSeconds: 15, durationSeconds: 1080, furthestSeconds: 1080 });
    expect(progress.completedAt).toBeNull();

    const read = await request(app)
      .get(`${partPath(longPartId)}/video`)
      .set(auth(studentToken));
    expect(read.status).toBe(200);
    const video = studentVideoPartSchema.parse(read.body.data);
    expect(video).toMatchObject({ watchedSeconds: 15, furthestSeconds: 1080, completedAt: null, blockSkipping: false });
    expect(video.watchedIntervals).toEqual([[1060, 1075]]);
  });

  it("overlapping and repeated reports count once", async () => {
    expect((await report(longPartId, [[0, 10]], 10)).body.data.watchedSeconds).toBe(10);
    await lastReportAgo(longPartId, 60);
    expect((await report(longPartId, [[5, 40]], 40)).body.data.watchedSeconds).toBe(40);
    await lastReportAgo(longPartId, 60);
    const again = await report(
      longPartId,
      [
        [0, 40],
        [10, 30],
      ],
      40,
    );
    expect(again.body.data.watchedSeconds).toBe(40);
  });

  it("a report faster than real time is clamped", async () => {
    // The first report counts at most 15 s, whatever it claims.
    expect((await report(longPartId, [[0, 300]], 300)).body.data.watchedSeconds).toBe(15);
    await lastReportAgo(longPartId, 10);
    // 10 s later it claims another 300 s: only the 10 s that passed and 2 s of slack count.
    expect((await report(longPartId, [[300, 600]], 600)).body.data.watchedSeconds).toBe(27);
  });

  it("a short clip can't be watched in one request", async () => {
    const res = await report(shortPartId, [[0, 55]], 55);
    expect(res.body.data).toMatchObject({ watchedSeconds: 15, completedAt: null });
  });

  it("two reports at once merge, and still count no more than the clock allows", async () => {
    await Promise.all([report(longPartId, [[0, 10]], 10), report(longPartId, [[5, 20]], 20)]);
    const work = await db.assignmentPartWork.findUniqueOrThrow({
      where: { partId_studentUserId: { partId: longPartId, studentUserId: studentId } },
      select: { watchedIntervals: true, watchedSeconds: true },
    });
    const intervals = work.watchedIntervals as [number, number][];
    // Merged: sorted, not overlapping, and the total is what is stored.
    for (let i = 1; i < intervals.length; i += 1) expect(intervals[i]![0]).toBeGreaterThan(intervals[i - 1]![1]);
    expect(intervals.reduce((sum, [a, b]) => sum + b - a, 0)).toBe(work.watchedSeconds);
    // The first report's 15 s plus the second's 2 s of slack at most.
    expect(work.watchedSeconds).toBeGreaterThanOrEqual(10);
    expect(work.watchedSeconds).toBeLessThanOrEqual(17);
  });

  it("done needs 90% and every question answered", async () => {
    const [q1, q2] = (await questionIds(shortPartId)) as [number, number];
    expect((await answer(shortPartId, q1)).status).toBe(200);
    const last = await answer(shortPartId, q2);
    expect(last.status).toBe(200);
    // Every question answered, nothing watched: not done.
    expect(last.body.data.completedAt).toBeNull();

    expect((await report(shortPartId, [[0, 10]], 10)).body.data.completedAt).toBeNull();
    await lastReportAgo(shortPartId, 60);
    // 50 of 60 s is 83%: not done.
    expect((await report(shortPartId, [[10, 50]], 50)).body.data.completedAt).toBeNull();
    await lastReportAgo(shortPartId, 30);
    // 55 of 60 s is 92%, and the questions are answered.
    const done = await report(shortPartId, [[50, 55]], 55);
    expect(done.body.data).toMatchObject({ watchedSeconds: 55, answered: 2, questionCount: 2 });
    expect(done.body.data.completedAt).toEqual(expect.any(String));
  });

  it("watching first, the last answer makes it done", async () => {
    const [q1, q2] = (await questionIds(shortPartId)) as [number, number];
    expect((await report(shortPartId, [[0, 15]], 15)).body.data.watchedSeconds).toBe(15);
    await lastReportAgo(shortPartId, 60);
    expect((await report(shortPartId, [[15, 60]], 60)).body.data).toMatchObject({
      watchedSeconds: 60,
      completedAt: null,
    });
    expect((await answer(shortPartId, q1)).body.data.completedAt).toBeNull();
    expect((await answer(shortPartId, q2)).body.data.completedAt).toEqual(expect.any(String));
    const read = await request(app)
      .get(`${partPath(shortPartId)}/video`)
      .set(auth(studentToken));
    expect(read.body.data.completedAt).toEqual(expect.any(String));
    expect(read.body.data.nextQuestionId).toBeNull();
  });

  it("with blockSkipping, a range past the furthest point is ignored", async () => {
    expect((await report(blockedPartId, [[0, 10]], 10, blockedAssignmentId)).body.data.watchedSeconds).toBe(10);
    await lastReportAgo(blockedPartId, 60);
    const res = await report(
      blockedPartId,
      [
        [300, 320],
        [12, 20],
      ],
      320,
      blockedAssignmentId,
    );
    expect(res.body.data).toMatchObject({ watchedSeconds: 18, furthestSeconds: 20 });
  });

  it("keeps the work row's keys in step with the submission's", async () => {
    await report(longPartId, [[0, 10]], 10);
    await report(shortPartId, [[0, 10]], 10);
    expect(await db.assignmentPartWork.count({ where: { studentUserId: studentId, part: { assignmentId } } })).toBe(2);
    expect(await inconsistentWorks(assignmentId)).toEqual([]);
    expect(await db.submission.count({ where: { assignmentId, studentUserId: studentId } })).toBe(1);
  });

  it("refuses a body that isn't intervals", async () => {
    const res = await report(longPartId, [[30, 10]], 30);
    expect(res.status).toBe(400);
    const tooMany = Array.from({ length: 51 }, (_, i): [number, number] => [i * 2, i * 2 + 1]);
    expect((await report(longPartId, tooMany, 0)).status).toBe(400);
  });

  it("is a video part of this assignment, or 404", async () => {
    expect(
      (
        await request(app)
          .get(`${partPath(essayPartId)}/video`)
          .set(auth(studentToken))
      ).status,
    ).toBe(404);
    const elsewhere = await request(app)
      .get(`${partPath(blockedPartId)}/video`)
      .set(auth(studentToken));
    expect(elsewhere.status).toBe(404);
  });

  it("a student of another season gets 403", async () => {
    const read = await request(app)
      .get(`${partPath(longPartId)}/video`)
      .set(auth(outsiderToken));
    expect(read.status).toBe(403);
    const write = await request(app)
      .put(`${partPath(longPartId)}/video/progress`)
      .set(auth(outsiderToken))
      .send({ intervals: [[0, 10]], position: 10 });
    expect(write.status).toBe(403);
    const [q1] = (await questionIds(shortPartId)) as [number];
    const ans = await request(app)
      .post(`${partPath(shortPartId)}/video/answers`)
      .set(auth(outsiderToken))
      .send({ questionId: q1, selectedIndex: 0 });
    expect(ans.status).toBe(403);
  });
});

describe("a finished season's video part", () => {
  it("its participant reads their progress but can't report or answer", async () => {
    const path = partPath(finishedPartId, finishedAssignmentId);
    const read = await request(app).get(`${path}/video`).set(auth(studentToken));
    expect(read.status).toBe(200);
    expect(read.body.data).toMatchObject({ watchedSeconds: 0, completedAt: null });

    const write = await request(app)
      .put(`${path}/video/progress`)
      .set(auth(studentToken))
      .send({ intervals: [[0, 10]], position: 10 });
    expect(write.status).toBe(403);
    const [q1] = (await questionIds(finishedPartId)) as [number];
    const ans = await request(app)
      .post(`${path}/video/answers`)
      .set(auth(studentToken))
      .send({ questionId: q1, selectedIndex: 0 });
    expect(ans.status).toBe(403);
  });
});

describe("timed questions on a video part", () => {
  it("never sends the answer key to a student, and keeps the session order gate", async () => {
    const read = await request(app)
      .get(`${partPath(shortPartId)}/video`)
      .set(auth(studentToken));
    expect(JSON.stringify(read.body)).not.toMatch(/correctIndex/);
    const [q1, q2] = (await questionIds(shortPartId)) as [number, number];
    expect(read.body.data.nextQuestionId).toBe(q1);

    const early = await answer(shortPartId, q2);
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe("out_of_order");

    const first = await answer(shortPartId, q1, 1);
    expect(first.body.data).toMatchObject({ isCorrect: false, correctIndex: 0, nextQuestionId: q2 });
    // A second answer replays the first.
    expect((await answer(shortPartId, q1, 0)).body.data).toMatchObject({ isCorrect: false, nextQuestionId: q2 });
  });

  it("an admin of the season writes them; a leader or student cannot", async () => {
    const path = `${partPath(longPartId)}/video-questions`;
    const input = { atSeconds: 120, prompt: "Who ran?", options: ["The father", "The son"], correctIndex: 0 };
    expect((await request(app).post(path).set(auth(leaderToken)).send(input)).status).toBe(403);
    expect((await request(app).post(path).set(auth(studentToken)).send(input)).status).toBe(403);

    const created = await request(app).post(path).set(auth(adminToken)).send(input);
    expect(created.status).toBe(201);
    const id = created.body.data.question.id as number;
    // Not past the video's end.
    const late = await request(app)
      .post(path)
      .set(auth(adminToken))
      .send({ ...input, atSeconds: 2000 });
    expect(late.status).toBe(400);

    const list = await request(app).get(path).set(auth(adminToken));
    expect(list.body.data.questions.map((q: { id: number }) => q.id)).toEqual([id]);
    expect((await request(app).get(path).set(auth(leaderToken))).status).toBe(403);

    const edit = { ...input, prompt: "Who ran first?" };
    expect((await request(app).patch(`/api/v1/video-questions/${id}`).set(auth(leaderToken)).send(edit)).status).toBe(
      403,
    );
    const patched = await request(app).patch(`/api/v1/video-questions/${id}`).set(auth(adminToken)).send(edit);
    expect(patched.status).toBe(200);
    expect(patched.body.data.question.prompt).toBe("Who ran first?");

    expect((await request(app).delete(`/api/v1/video-questions/${id}`).set(auth(leaderToken))).status).toBe(403);
    const deleted = await request(app).delete(`/api/v1/video-questions/${id}`).set(auth(adminToken));
    expect(deleted.body.data).toEqual({ deleted: true, responsesRemoved: 0 });
  });
});
