import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { assignmentSavedResponseSchema } from "../../../../../packages/shared/src/index";
import { cleanupTestData } from "./fixtures";
import {
  body,
  essayPart,
  forumPart,
  inconsistentWorks,
  notificationsFor,
  seedAssignmentWriteFixtures,
  seedWork,
  storedParts,
  videoPart,
} from "./assignment-writes-setup";

// 60s: beforeAll performs many sequential writes.
jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let otherSeasonId: number;
let superId: number;
let adminId: number;
let studentAId: number;
let studentBId: number;
let superToken: string;
let adminToken: string;
let otherAdminToken: string;
let leaderToken: string;
let studentToken: string;

beforeAll(async () => {
  ({
    seasonId,
    otherSeasonId,
    superId,
    adminId,
    studentAId,
    studentBId,
    superToken,
    adminToken,
    otherAdminToken,
    leaderToken,
    studentToken,
  } = await seedAssignmentWriteFixtures(app));
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

async function create(over: Record<string, unknown> = {}, token = adminToken) {
  const res = await request(app)
    .post(`/api/v1/seasons/${seasonId}/assignments`)
    .set("authorization", `Bearer ${token}`)
    .send(body(over));
  const id = res.body.data.id as number;
  return { id, parts: await storedParts(id) };
}

function patch(id: number, over: Record<string, unknown> = {}, token = adminToken) {
  return request(app).patch(`/api/v1/assignments/${id}`).set("authorization", `Bearer ${token}`).send(body(over));
}

/** The stored parts sent back as they are, so a test changes only what it names. */
const asSent = (parts: { id: number }[], inputs: Record<string, unknown>[]) =>
  inputs.map((input, i) => ({ ...input, id: parts[i]?.id }));

describe("PATCH /api/v1/assignments/:id", () => {
  it("replaces the fields, keeps the season, stamps updatedById, and reorders parts by id (R67, R68, R71)", async () => {
    const made = await create({ parts: [videoPart(), essayPart()] }, superToken);
    const [video, essay] = made.parts;

    const res = await patch(made.id, {
      title: "Renamed",
      dueDay: null,
      dueTime: null,
      reminder: { enabled: false, days: 5, anchor: "NEXT_SESSION", time: "07:15" },
      parts: [
        { ...essayPart({ prompt: "Now first" }), id: essay?.id },
        { ...videoPart(), id: video?.id },
      ],
      // Not a field: an assignment never moves season. Stripped, not honoured.
      seasonId: otherSeasonId,
    });

    expect(res.status).toBe(200);
    // The full detail plus `reopened`, so the form can show the saved state.
    const saved = assignmentSavedResponseSchema.parse(res.body.data);
    expect(saved).toMatchObject({ id: made.id, reopened: 0, reminderLine: null });
    expect(saved.parts.map((p) => p.kind)).toEqual(["ESSAY", "VIDEO"]);
    const row = await db.assignment.findUnique({
      where: { id: made.id },
      select: {
        seasonId: true,
        title: true,
        dueAt: true,
        reminderEnabled: true,
        reminderDays: true,
        reminderTime: true,
        createdById: true,
        updatedById: true,
      },
    });
    expect(row).toEqual({
      seasonId,
      title: "Renamed",
      dueAt: null,
      reminderEnabled: false,
      reminderDays: 5,
      reminderTime: "07:15",
      createdById: superId,
      updatedById: adminId,
    });
    const parts = await storedParts(made.id);
    expect(parts.map((p) => [p.id, p.position, p.kind])).toEqual([
      [essay?.id, 0, "ESSAY"],
      [video?.id, 1, "VIDEO"],
    ]);
    const prompt = await db.assignmentPart.findUnique({ where: { id: essay?.id }, select: { prompt: true } });
    expect(prompt?.prompt).toBe("Now first");
  });

  it("changes wording freely after students have work, and tells nobody again (R72)", async () => {
    const made = await create({ title: "Typo" });
    await seedWork(made.id, made.parts[0]!.id, studentAId, { submitted: true });

    const res = await patch(made.id, { title: "Typo fixed", parts: asSent(made.parts, [essayPart()]) });
    expect(res.status).toBe(200);
    expect(await notificationsFor(studentAId, made.id)).toHaveLength(1);
  });

  it("adding a part reopens submitted work after confirmation", async () => {
    const made = await create({ parts: [essayPart()] });
    await seedWork(made.id, made.parts[0]!.id, studentAId, { submitted: true });
    const parts = [...asSent(made.parts, [essayPart()]), forumPart()];

    const asked = await patch(made.id, { parts });
    expect(asked.status).toBe(409);
    expect(asked.body.error).toEqual({
      code: "needs_confirmation",
      message: "This changes work 1 student has done.",
    });
    expect(asked.body.students).toBe(1);
    expect(await storedParts(made.id)).toHaveLength(1); // nothing written

    const confirmed = await patch(made.id, { parts, confirm: true });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.data).toMatchObject({ id: made.id, reopened: 1 });
    const sub = await db.submission.findUniqueOrThrow({
      where: { assignmentId_studentUserId: { assignmentId: made.id, studentUserId: studentAId } },
      select: { submittedAt: true, completedAt: true },
    });
    expect(sub).toEqual({ submittedAt: null, completedAt: null });
    expect((await storedParts(made.id)).map((p) => p.kind)).toEqual(["ESSAY", "FORUM"]);
    expect(await inconsistentWorks(made.id)).toEqual([]);
  });

  it("a word-range change asks first and keeps handed-in essays", async () => {
    const made = await create({ parts: [essayPart({ minWords: 50, maxWords: 500 })] });
    await seedWork(made.id, made.parts[0]!.id, studentAId, { submitted: true });
    const parts = asSent(made.parts, [essayPart({ minWords: 300, maxWords: 400 })]);

    const asked = await patch(made.id, { parts });
    expect(asked.status).toBe(409);
    expect(asked.body).toMatchObject({ students: 1, error: { code: "needs_confirmation" } });
    expect((await storedParts(made.id))[0]).toMatchObject({ minWords: 50, maxWords: 500 }); // nothing written

    const res = await patch(made.id, { parts, confirm: true });
    expect(res.status).toBe(200);
    expect(res.body.data.reopened).toBe(0);
    const work = await db.assignmentPartWork.findUniqueOrThrow({
      where: { partId_studentUserId: { partId: made.parts[0]!.id, studentUserId: studentAId } },
      select: { status: true, submission: { select: { submittedAt: true } } },
    });
    expect(work.status).toBe("SUBMITTED");
    expect(work.submission.submittedAt).not.toBeNull();
    expect((await storedParts(made.id))[0]).toMatchObject({ minWords: 300, maxWords: 400 });
    expect(await inconsistentWorks(made.id)).toEqual([]);
  });

  it("a word-range change on an essay nobody has started saves without asking", async () => {
    const made = await create({ parts: [essayPart()] });
    const res = await patch(made.id, { parts: asSent(made.parts, [essayPart({ minWords: null, maxWords: 80 })]) });
    expect(res.status).toBe(200);
  });

  it("changing a video link resets its progress", async () => {
    const made = await create({ parts: [videoPart(), essayPart()] });
    const [video, essay] = made.parts;
    await seedWork(made.id, video!.id, studentAId, { watchedSeconds: 300 });
    await seedWork(made.id, essay!.id, studentAId);
    const question = await db.sessionVideoQuestion.create({
      data: { assignmentPartId: video!.id, atSeconds: 30, prompt: "Who?", options: ["A", "B"], correctIndex: 0 },
      select: { id: true },
    });
    await db.sessionVideoQuestionResponse.create({
      data: { questionId: question.id, studentUserId: studentAId, selectedIndex: 0, isCorrect: true },
    });

    // The same video under another link form is not a change.
    const sameVideo = asSent(made.parts, [videoPart({ youtubeUrl: "https://youtu.be/dQw4w9WgXcQ" }), essayPart()]);
    expect((await patch(made.id, { parts: sameVideo })).status).toBe(200);

    const parts = asSent(made.parts, [videoPart({ youtubeUrl: "https://youtu.be/9bZkp7q19f0" }), essayPart()]);
    const asked = await patch(made.id, { parts });
    expect(asked.status).toBe(409);
    expect(asked.body.students).toBe(1);

    expect((await patch(made.id, { parts, confirm: true })).status).toBe(200);
    expect(await db.assignmentPartWork.count({ where: { partId: video!.id } })).toBe(0);
    expect(await db.sessionVideoQuestionResponse.count({ where: { questionId: question.id } })).toBe(0);
    // The question and the essay's work stay; the part keeps its id with the new video.
    expect(await db.sessionVideoQuestion.count({ where: { id: question.id } })).toBe(1);
    expect(await db.assignmentPartWork.count({ where: { partId: essay!.id } })).toBe(1);
    expect((await storedParts(made.id))[0]).toMatchObject({ id: video!.id, youtubeId: "9bZkp7q19f0" });
    expect(await inconsistentWorks(made.id)).toEqual([]);
  });

  it("a video reset clears completion for a student who only answered its questions", async () => {
    const made = await create({ parts: [videoPart(), essayPart()] });
    const [video, essay] = made.parts;
    // An essay row makes the submission; the video has answers but no work row.
    await seedWork(made.id, essay!.id, studentBId);
    await db.submission.updateMany({
      where: { assignmentId: made.id, studentUserId: studentBId },
      data: { completedAt: new Date() },
    });
    const question = await db.sessionVideoQuestion.create({
      data: { assignmentPartId: video!.id, atSeconds: 30, prompt: "Who?", options: ["A", "B"], correctIndex: 0 },
      select: { id: true },
    });
    await db.sessionVideoQuestionResponse.create({
      data: { questionId: question.id, studentUserId: studentBId, selectedIndex: 0, isCorrect: true },
    });

    const parts = asSent(made.parts, [videoPart({ youtubeUrl: "https://youtu.be/9bZkp7q19f0" }), essayPart()]);
    expect((await patch(made.id, { parts })).body.students).toBe(1);
    expect((await patch(made.id, { parts, confirm: true })).status).toBe(200);
    const after = await db.submission.findUniqueOrThrow({
      where: { assignmentId_studentUserId: { assignmentId: made.id, studentUserId: studentBId } },
      select: { completedAt: true },
    });
    expect(after.completedAt).toBeNull();
  });

  it("removing a part asks first, counting each student once, then deletes their work on it", async () => {
    const made = await create({ parts: [videoPart(), essayPart(), forumPart()] });
    const [video, essay, forum] = made.parts;
    await seedWork(made.id, essay!.id, studentAId);
    await seedWork(made.id, forum!.id, studentAId);
    await seedWork(made.id, forum!.id, studentBId);
    const parts = [{ ...videoPart(), id: video!.id }];

    const asked = await patch(made.id, { parts });
    expect(asked.status).toBe(409);
    expect(asked.body).toMatchObject({ students: 2, error: { message: "This changes work 2 students have done." } });

    expect((await patch(made.id, { parts, confirm: true })).status).toBe(200);
    expect((await storedParts(made.id)).map((p) => p.id)).toEqual([video!.id]);
    expect(await db.assignmentPartWork.count({ where: { partId: { in: [essay!.id, forum!.id] } } })).toBe(0);
    expect(await inconsistentWorks(made.id)).toEqual([]);
  });

  it("an unknown part id is a 400", async () => {
    const made = await create();
    const elsewhere = await create();
    for (const id of [elsewhere.parts[0]!.id, 2147483000]) {
      const res = await patch(made.id, { parts: [{ ...essayPart(), id }] });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("unknown_part");
    }
    expect((await storedParts(made.id)).map((p) => p.id)).toEqual(made.parts.map((p) => p.id));
  });

  it("refuses to turn a part into another kind (400)", async () => {
    const made = await create();
    const res = await patch(made.id, { parts: [{ ...forumPart(), id: made.parts[0]!.id }] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
  });

  it("refuses non-admins of the assignment's season", async () => {
    const made = await create();
    for (const token of [otherAdminToken, leaderToken, studentToken]) {
      expect((await patch(made.id, { title: "Nope" }, token)).status).toBe(403);
    }
  });

  it("returns 404 for a soft-deleted assignment (closes R79) and for a missing one; 400 for a bad id", async () => {
    const made = await create();
    await db.assignment.update({ where: { id: made.id }, data: { deletedAt: new Date() } });
    expect((await patch(made.id, { title: "Changed after delete" })).status).toBe(404);
    // The refusal must come before the write.
    const row = await db.assignment.findUnique({ where: { id: made.id }, select: { title: true } });
    expect(row?.title).toBe("Week 4 reflection");
    expect((await patch(2147483000)).status).toBe(404);
    const bad = await request(app)
      .patch("/api/v1/assignments/abc")
      .set("authorization", `Bearer ${adminToken}`)
      .send(body());
    expect(bad.status).toBe(400);
  });
});

describe("DELETE /api/v1/assignments/:id", () => {
  function del(id: number, token = adminToken) {
    return request(app).delete(`/api/v1/assignments/${id}`).set("authorization", `Bearer ${token}`);
  }

  it("soft-deletes an untouched assignment and keeps its parts (R75, R76)", async () => {
    const made = await create();
    const notifiedBefore = await db.notification.count({ where: { link: `/student/assignments/${made.id}` } });

    const res = await del(made.id);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ deleted: true });

    const row = await db.assignment.findUnique({
      where: { id: made.id },
      select: { deletedAt: true, updatedById: true },
    });
    expect(row?.deletedAt).not.toBeNull();
    expect(row?.updatedById).toBe(adminId);
    expect(await storedParts(made.id)).toHaveLength(1);
    const detail = await request(app)
      .get(`/api/v1/assignments/${made.id}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(detail.status).toBe(404);
    // R66: deleting notifies nobody.
    expect(await db.notification.count({ where: { link: `/student/assignments/${made.id}` } })).toBe(notifiedBefore);
  });

  it("refuses while any submission exists, even one nobody handed in, and leaves the row live (§10 item 4)", async () => {
    const made = await create();
    await seedWork(made.id, made.parts[0]!.id, studentAId);
    const res = await del(made.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("has_submissions");
    const row = await db.assignment.findUnique({ where: { id: made.id }, select: { deletedAt: true } });
    expect(row?.deletedAt).toBeNull();
  });

  it("deletes when the only Submission has no work left (its part was removed), review M6", async () => {
    const made = await create();
    await db.submission.create({
      data: { assignmentId: made.id, studentUserId: studentAId, publicId: `space-v2-test-empty-${made.id}` },
    });
    const res = await del(made.id);
    expect(res.status).toBe(200);
    const row = await db.assignment.findUnique({ where: { id: made.id }, select: { deletedAt: true } });
    expect(row?.deletedAt).not.toBeNull();
  });

  it("cannot delete twice (closes R79), and 404s a missing id", async () => {
    const made = await create();
    expect((await del(made.id)).status).toBe(200);
    expect((await del(made.id)).status).toBe(404);
    expect((await del(2147483000)).status).toBe(404);
  });

  it("refuses non-admins of the assignment's season", async () => {
    const made = await create();
    for (const token of [otherAdminToken, leaderToken, studentToken]) {
      expect((await del(made.id, token)).status).toBe(403);
    }
  });
});
