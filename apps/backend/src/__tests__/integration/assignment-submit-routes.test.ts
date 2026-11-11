import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { submitAssignmentResponseSchema } from "../../../../../packages/shared/src/index";
import { createAssignmentWithParts, seedTextWork, seedVideoWork, setSubmitted } from "./assignment-reads-setup";
import { cleanupTestData } from "./fixtures";
import { seedSubmissionFixtures, type SubmissionFixtures } from "./submissions-setup";

// Generous for a cold database's first query.
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

function submit(assignmentId: number, token = f.ownerToken) {
  return request(app).post(`/api/v1/assignments/${assignmentId}/submit`).set(auth(token)).send({});
}

function submission(assignmentId: number, studentUserId = f.studentUserId) {
  return db.submission.findUniqueOrThrow({
    where: { assignmentId_studentUserId: { assignmentId, studentUserId } },
    select: { submittedAt: true, completedAt: true },
  });
}

function leaderNotices(title: string) {
  return db.notification.findMany({
    where: { userId: f.leaderUserId, type: "SUBMISSION_RECEIVED", title: { contains: title } },
    select: { title: true, link: true },
  });
}

describe("POST /api/v1/assignments/:id/submit", () => {
  it("submit is refused while a video is short (409 not_finished with the blocker line)", async () => {
    const a = await createAssignmentWithParts({ seasonId: f.seasonId, title: "Short video" }, [
      { kind: "VIDEO", title: "Luke 15 talk", durationSeconds: 600 },
      { kind: "ESSAY" },
    ]);
    await seedVideoWork(a.id, a.partIds[0]!, f.studentUserId, 120);
    const essay = await seedTextWork(a.id, a.partIds[1]!, f.studentUserId, "DRAFT");

    const res = await submit(a.id);
    expect(res.status).toBe(409);
    // 90% of 10 min is 9 min; 2 are watched.
    expect(res.body.error).toMatchObject({
      code: "not_finished",
      message: "Finish Luke 15 talk (7 min left) to submit",
    });
    expect(await submission(a.id)).toEqual({ submittedAt: null, completedAt: null });
    const row = await db.assignmentPartWork.findUniqueOrThrow({ where: { id: essay.id }, select: { status: true } });
    expect(row.status).toBe("DRAFT");
    expect(await leaderNotices("Short video")).toEqual([]);
  });

  it("submit with every part done hands the essays in and notifies the leader once", async () => {
    const a = await createAssignmentWithParts({ seasonId: f.seasonId, title: "All done" }, [
      { kind: "VIDEO", durationSeconds: 600, questions: 1 },
      { kind: "ESSAY", minWords: 2, maxWords: 10 },
      { kind: "FORUM" },
    ]);
    await seedVideoWork(a.id, a.partIds[0]!, f.studentUserId, 560, { answered: 1 });
    const essay = await seedTextWork(a.id, a.partIds[1]!, f.studentUserId, "DRAFT", { text: "Three words here" });
    await seedTextWork(a.id, a.partIds[2]!, f.studentUserId, "SUBMITTED");

    const res = await submit(a.id);
    expect(res.status).toBe(200);
    expect(submitAssignmentResponseSchema.parse(res.body.data).completedAt).toBeNull();

    const handedIn = await db.assignmentPartWork.findUniqueOrThrow({
      where: { id: essay.id },
      select: { status: true, submittedAt: true },
    });
    expect(handedIn.status).toBe("SUBMITTED");
    expect(handedIn.submittedAt).not.toBeNull();
    const sub = await submission(a.id);
    expect(sub.submittedAt).not.toBeNull();
    // An essay waits for review, so the assignment is submitted, not complete.
    expect(sub.completedAt).toBeNull();
    expect(await leaderNotices("All done")).toEqual([
      { title: "Test owner submitted All done", link: `/leader/submissions/${essay.publicId}` },
    ]);

    // A second Submit is refused and tells nobody again.
    const again = await submit(a.id);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("already_submitted");
    expect(await leaderNotices("All done")).toHaveLength(1);
  });

  it("an assignment with no essay is complete when submitted, and the leader opens the assignment", async () => {
    const a = await createAssignmentWithParts({ seasonId: f.seasonId, title: "Video only" }, [{ kind: "VIDEO" }]);
    await seedVideoWork(a.id, a.partIds[0]!, f.studentUserId, 600);

    const res = await submit(a.id);
    expect(res.status).toBe(200);
    const sub = await submission(a.id);
    expect(sub.submittedAt).not.toBeNull();
    expect(sub.completedAt).toEqual(sub.submittedAt);
    expect(await leaderNotices("Video only")).toEqual([
      { title: "Test owner submitted Video only", link: `/student/assignments/${a.id}` },
    ]);
  });

  it("refuses a draft outside the essay's word range", async () => {
    const a = await createAssignmentWithParts({ seasonId: f.seasonId, title: "Too short" }, [
      { kind: "ESSAY", minWords: 50 },
    ]);
    await seedTextWork(a.id, a.partIds[0]!, f.studentUserId, "DRAFT", { text: "Too few" });
    const res = await submit(a.id);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: "not_finished", message: "Finish the essay to submit" });
  });

  it("refuses staff and a student with no live place (403), and 404s an unknown or deleted assignment", async () => {
    const a = await createAssignmentWithParts({ seasonId: f.seasonId, title: "Gated" }, [{ kind: "FORUM" }]);
    expect((await submit(a.id, f.leaderToken)).status).toBe(403);
    expect((await submit(a.id, f.adminToken)).status).toBe(403);
    expect((await submit(999999999)).status).toBe(404);
    const gone = await createAssignmentWithParts({ seasonId: f.seasonId, title: "Gone", deletedAt: new Date() }, [
      { kind: "FORUM" },
    ]);
    expect((await submit(gone.id)).status).toBe(404);
    expect((await request(app).post(`/api/v1/assignments/${a.id}/submit`)).status).toBe(401);
  });
});

describe("editing after students submitted", () => {
  const videoInput = (youtubeUrl: string) => ({
    kind: "VIDEO",
    title: "Watch this",
    youtubeUrl,
    blockSkipping: false,
    durationSeconds: 600,
  });
  const essayInput = (prompt: string) => ({
    kind: "ESSAY",
    prompt,
    minWords: null,
    maxWords: null,
    maxFileSizeMb: null,
    allowedMimeCategories: [],
  });
  const writeBody = (parts: object[]) => ({
    title: "Edited",
    description: null,
    dueDay: null,
    dueTime: null,
    reminder: { enabled: false, days: 2, anchor: "NEXT_SESSION", time: "09:00" },
    parts,
    confirm: true,
  });
  const patch = (id: number, parts: object[]) =>
    request(app).patch(`/api/v1/assignments/${id}`).set(auth(f.adminToken)).send(writeBody(parts));

  it("a video reset reopens a submitted student", async () => {
    const a = await createAssignmentWithParts({ seasonId: f.seasonId, title: "Reset reopens" }, [
      { kind: "VIDEO" },
      { kind: "ESSAY" },
    ]);
    await seedVideoWork(a.id, a.partIds[0]!, f.studentUserId, 600);
    await seedTextWork(a.id, a.partIds[1]!, f.studentUserId, "REVIEWED");
    const at = new Date();
    await db.submission.updateMany({
      where: { assignmentId: a.id, studentUserId: f.studentUserId },
      data: { submittedAt: at, completedAt: at },
    });

    const res = await patch(a.id, [
      { ...videoInput("https://youtu.be/9bZkp7q19f0"), id: a.partIds[0] },
      { ...essayInput("What did you learn?"), id: a.partIds[1] },
    ]);
    expect(res.status).toBe(200);
    expect(await submission(a.id)).toEqual({ submittedAt: null, completedAt: null });
  });

  it("a range change then a video reset reopens the student, who can submit again once they rewatch", async () => {
    const a = await createAssignmentWithParts({ seasonId: f.seasonId, title: "Range then reset" }, [
      { kind: "VIDEO" },
      { kind: "ESSAY" },
    ]);
    // Handed in at 3 words, with no range.
    await seedVideoWork(a.id, a.partIds[0]!, f.studentUserId, 600);
    await seedTextWork(a.id, a.partIds[1]!, f.studentUserId, "SUBMITTED", { text: "Three words here" });
    await setSubmitted(a.id, f.studentUserId, new Date());

    const essay = { ...essayInput("What did you learn?"), minWords: 50, id: a.partIds[1] };
    const res = await patch(a.id, [{ ...videoInput("https://youtu.be/9bZkp7q19f0"), id: a.partIds[0] }, essay]);
    expect(res.status).toBe(200);
    expect((await submission(a.id)).submittedAt).toBeNull();

    // Only the video blocks: the handed-in essay stays done under its new range.
    const blocked = await submit(a.id);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.message).toBe("Finish Watch this (9 min left) to submit");

    await seedVideoWork(a.id, a.partIds[0]!, f.studentUserId, 600);
    expect((await submit(a.id)).status).toBe(200);
  });

  it("removing the only unreviewed essay completes a submitted student", async () => {
    const a = await createAssignmentWithParts({ seasonId: f.seasonId, title: "Removal completes" }, [
      { kind: "VIDEO" },
      { kind: "ESSAY", prompt: "First" },
      { kind: "ESSAY", prompt: "Second" },
    ]);
    await seedVideoWork(a.id, a.partIds[0]!, f.studentUserId, 600);
    await seedTextWork(a.id, a.partIds[1]!, f.studentUserId, "REVIEWED");
    await seedTextWork(a.id, a.partIds[2]!, f.studentUserId, "SUBMITTED");
    await setSubmitted(a.id, f.studentUserId, new Date());

    const res = await patch(a.id, [
      { ...videoInput("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), id: a.partIds[0] },
      { ...essayInput("First"), id: a.partIds[1] },
    ]);
    expect(res.status).toBe(200);
    const sub = await submission(a.id);
    expect(sub.submittedAt).not.toBeNull();
    expect(sub.completedAt).not.toBeNull();
  });
});
