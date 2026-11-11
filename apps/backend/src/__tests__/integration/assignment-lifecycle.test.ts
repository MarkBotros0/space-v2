import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { body, essayPart, forumPart, storedParts, videoPart } from "./assignment-writes-setup";
import { cleanupTestData } from "./fixtures";
import { seedSubmissionFixtures, type SubmissionFixtures } from "./submissions-setup";

/*
 * One student through the whole chain, through the routes only: watch the
 * video and answer its question, draft the essay, Submit, the leader returns
 * the essay, hand it in again, the leader reviews it (complete), then an admin
 * adds a part (reopened). Each step is tested on its own elsewhere; this holds
 * them together.
 */

jest.setTimeout(60000);

const app = createApp();

let f: SubmissionFixtures;

beforeAll(async () => {
  f = await seedSubmissionFixtures(app);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

const VIDEO = videoPart({ title: "Luke 15 talk", durationSeconds: 60 });
const ESSAY = essayPart({ minWords: 2, maxWords: 50, maxFileSizeMb: null, allowedMimeCategories: [] });

describe("one student, one assignment, start to finish", () => {
  it("watch, answer, draft, submit, returned, handed in again, reviewed, then reopened by a new part", async () => {
    // The admin publishes a video and an essay, then adds a timed question to the video.
    const made = await request(app)
      .post(`/api/v1/seasons/${f.seasonId}/assignments`)
      .set(auth(f.adminToken))
      .send(body({ title: "The lost son", parts: [VIDEO, ESSAY] }));
    expect(made.status).toBe(201);
    const id = made.body.data.id as number;
    const parts = await storedParts(id);
    const video = parts[0]!;
    const essay = parts[1]!;
    const base = `/api/v1/assignments/${id}`;
    const question = await request(app)
      .post(`${base}/parts/${video.id}/video-questions`)
      .set(auth(f.adminToken))
      .send({ atSeconds: 20, prompt: "Who ran to meet him?", options: ["The father", "The brother"], correctIndex: 0 });
    expect(question.status).toBe(201);

    const standing = () =>
      db.submission.findUniqueOrThrow({
        where: { assignmentId_studentUserId: { assignmentId: id, studentUserId: f.studentUserId } },
        select: { submittedAt: true, completedAt: true },
      });
    const student = auth(f.ownerToken);

    // 1. Watch the video (two reports a minute apart: the server credits no more than the clock) and answer.
    expect(
      (
        await request(app)
          .put(`${base}/parts/${video.id}/video/progress`)
          .set(student)
          .send({ intervals: [[0, 15]], position: 15 })
      ).status,
    ).toBe(200);
    await db.assignmentPartWork.update({
      where: { partId_studentUserId: { partId: video.id, studentUserId: f.studentUserId } },
      data: { lastReportAt: new Date(Date.now() - 60_000) },
    });
    const watched = await request(app)
      .put(`${base}/parts/${video.id}/video/progress`)
      .set(student)
      .send({ intervals: [[15, 60]], position: 60 });
    expect(watched.body.data).toMatchObject({ watchedSeconds: 60, completedAt: null });
    const answered = await request(app)
      .post(`${base}/parts/${video.id}/video/answers`)
      .set(student)
      .send({ questionId: question.body.data.question.id, selectedIndex: 0 });
    expect(answered.status).toBe(200);
    expect(answered.body.data.completedAt).toEqual(expect.any(String));

    // 2. Draft the essay.
    const draft = await request(app)
      .put(`${base}/parts/${essay.id}/essay`)
      .set(student)
      .send({ text: "The father ran first." });
    expect(draft.status).toBe(200);
    const essayId = draft.body.data.publicId as string;

    // 3. Submit: the essay is handed in and waits for review.
    expect((await request(app).post(`${base}/submit`).set(student).send({})).status).toBe(200);
    expect((await standing()).submittedAt).not.toBeNull();
    expect((await standing()).completedAt).toBeNull();

    // 4. The leader returns the essay: the assignment is not submitted any more.
    const returned = await request(app)
      .post(`/api/v1/submissions/${essayId}/review`)
      .set(auth(f.leaderToken))
      .send({ action: "return", feedback: "Say why he ran." });
    expect(returned.status).toBe(200);
    expect(await standing()).toEqual({ submittedAt: null, completedAt: null });

    // 5. The student edits it and hands it in again: submitted again, with no second Submit.
    expect(
      (
        await request(app)
          .put(`${base}/parts/${essay.id}/essay`)
          .set(student)
          .send({ text: "He ran because he loved him." })
      ).status,
    ).toBe(200);
    expect((await request(app).post(`/api/v1/submissions/${essayId}/hand-in`).set(student)).status).toBe(200);
    expect((await standing()).submittedAt).not.toBeNull();
    expect((await standing()).completedAt).toBeNull();

    // 6. The leader marks it reviewed: complete.
    const reviewed = await request(app)
      .post(`/api/v1/submissions/${essayId}/review`)
      .set(auth(f.leaderToken))
      .send({ action: "reviewed", feedback: null });
    expect(reviewed.status).toBe(200);
    expect((await standing()).completedAt).not.toBeNull();

    // 7. The admin adds a forum part (asked first, since a submitted student is touched): reopened.
    const edit = body({
      title: "The lost son",
      parts: [{ ...VIDEO, id: video.id }, { ...ESSAY, id: essay.id }, forumPart()],
    });
    const asked = await request(app).patch(base).set(auth(f.adminToken)).send(edit);
    expect(asked.status).toBe(409);
    expect(asked.body.error).toMatchObject({ code: "needs_confirmation" });
    const saved = await request(app)
      .patch(base)
      .set(auth(f.adminToken))
      .send({ ...edit, confirm: true });
    expect(saved.status).toBe(200);
    expect(saved.body.data.reopened).toBe(1);
    expect(await standing()).toEqual({ submittedAt: null, completedAt: null });
    // The finished work stays done: the video and the reviewed essay.
    const works = await db.assignmentPartWork.findMany({
      where: { submission: { assignmentId: id }, studentUserId: f.studentUserId },
      orderBy: { partId: "asc" },
      select: { status: true, doneAt: true },
    });
    expect(works[0]?.doneAt).not.toBeNull();
    expect(works[1]?.status).toBe("REVIEWED");
  });
});
