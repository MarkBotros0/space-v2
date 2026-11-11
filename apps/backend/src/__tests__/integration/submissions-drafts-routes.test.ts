import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { newPublicId } from "../../lib/public-id";
import { handInEssayResponseSchema, saveEssayDraftResponseSchema } from "../../../../../packages/shared/src/index";
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

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");
const auth = (token: string) => ({ authorization: `Bearer ${token}` });

function saveDraft(assignmentId: number, partId: number, text: string, token = f.ownerToken) {
  return request(app).put(`/api/v1/assignments/${assignmentId}/parts/${partId}/essay`).set(auth(token)).send({ text });
}

describe("PUT /api/v1/assignments/:id/parts/:partId/essay — save a draft", () => {
  it("drafts are private until Submit", async () => {
    const a = await createAssignmentWithParts({ seasonId: f.seasonId, title: "Private draft" }, [{ kind: "ESSAY" }]);
    const res = await saveDraft(a.id, a.partIds[0]!, "my thoughts so far");
    expect(res.status).toBe(200);
    const saved = saveEssayDraftResponseSchema.parse(res.body.data);
    expect(saved).toMatchObject({ wordCount: 4, reviewStatus: "DRAFT" });

    // The author reads it; staff are told it does not exist, and the queue never lists it.
    const own = await request(app).get(`/api/v1/submissions/${saved.publicId}`).set(auth(f.ownerToken));
    expect(own.status).toBe(200);
    expect(own.body.data.text).toBe("my thoughts so far");
    for (const token of [f.leaderToken, f.adminToken, f.mentorToken]) {
      const read = await request(app).get(`/api/v1/submissions/${saved.publicId}`).set(auth(token));
      expect(read.status).toBe(404);
      const queue = await request(app).get("/api/v1/submissions?pendingOnly=false&limit=100").set(auth(token));
      expect(queue.body.data.items.some((i: { publicId: string }) => i.publicId === saved.publicId)).toBe(false);
    }

    // Submit (Task 8's route) hands it in; then the leader reads it.
    await db.assignmentPartWork.update({
      where: { publicId: saved.publicId },
      data: { status: "SUBMITTED", submittedAt: new Date() },
    });
    const after = await request(app).get(`/api/v1/submissions/${saved.publicId}`).set(auth(f.leaderToken));
    expect(after.status).toBe(200);
  });

  it("makes the Submission and the essay work on the first save, in step, and reuses them after", async () => {
    const a = await createAssignmentWithParts({ seasonId: f.seasonId, title: "First save" }, [
      { kind: "VIDEO" },
      { kind: "ESSAY" },
    ]);
    const partId = a.partIds[1]!;
    const first = await saveDraft(a.id, partId, "one");
    const second = await saveDraft(a.id, partId, "one two");
    expect(second.body.data.publicId).toBe(first.body.data.publicId);
    expect(second.body.data.wordCount).toBe(2);

    const works = await db.assignmentPartWork.findMany({
      where: { partId, studentUserId: f.studentUserId },
      select: { text: true, status: true, studentUserId: true, submission: true },
    });
    expect(works).toHaveLength(1);
    // The work's part belongs to the submission's assignment, and both are the same student's.
    expect(works[0]!.submission.assignmentId).toBe(a.id);
    expect(works[0]!.submission.studentUserId).toBe(works[0]!.studentUserId);
    expect(works[0]).toMatchObject({ text: "one two", status: "DRAFT" });
    expect(works[0]!.submission.submittedAt).toBeNull();
    expect(await db.submission.count({ where: { assignmentId: a.id, studentUserId: f.studentUserId } })).toBe(1);
  });

  it("counts words on the plain text, so markup and entities count as the app counts them", async () => {
    const a = await createAssignmentWithParts({ seasonId: f.seasonId, title: "Counted plain" }, [{ kind: "ESSAY" }]);
    const res = await saveDraft(a.id, a.partIds[0]!, "un<i>believ</i>able Tom &amp; Jerry");
    expect(res.body.data.wordCount).toBe(4);
    const detail = await request(app).get(`/api/v1/submissions/${res.body.data.publicId}`).set(auth(f.ownerToken));
    expect(detail.body.data.wordCount).toBe(4);
  });

  it("refuses a handed-in essay, and keeps a returned one RETURNED while it is rewritten", async () => {
    const a = await createAssignmentWithParts({ seasonId: f.seasonId, title: "Locked" }, [
      { kind: "ESSAY" },
      { kind: "ESSAY" },
    ]);
    await seedTextWork(a.id, a.partIds[0]!, f.studentUserId, "SUBMITTED");
    await seedTextWork(a.id, a.partIds[1]!, f.studentUserId, "RETURNED", { feedback: "Add a source." });

    const locked = await saveDraft(a.id, a.partIds[0]!, "rewritten");
    expect(locked.status).toBe(409);
    expect(locked.body.error.code).toBe("submission_locked");

    const returned = await saveDraft(a.id, a.partIds[1]!, "a better answer");
    expect(returned.status).toBe(200);
    expect(returned.body.data.reviewStatus).toBe("RETURNED");
    const row = await db.assignmentPartWork.findUniqueOrThrow({
      where: { partId_studentUserId: { partId: a.partIds[1]!, studentUserId: f.studentUserId } },
      select: { text: true, status: true, feedback: true },
    });
    expect(row).toEqual({ text: "a better answer", status: "RETURNED", feedback: "Add a source." });
  });

  it("refuses staff and a student without an active place; 404s a part of another kind or assignment", async () => {
    const a = await createAssignmentWithParts({ seasonId: f.seasonId, title: "Gates" }, [
      { kind: "VIDEO" },
      { kind: "ESSAY" },
    ]);
    expect((await saveDraft(a.id, a.partIds[1]!, "x", f.leaderToken)).status).toBe(403);
    expect((await saveDraft(a.id, a.partIds[1]!, "x", f.adminToken)).status).toBe(403);
    await db.seasonEnrollment.update({
      where: { studentUserId_seasonId: { studentUserId: f.peerUserId, seasonId: f.seasonId } },
      data: { status: "WITHDRAWN" },
    });
    expect((await saveDraft(a.id, a.partIds[1]!, "x", f.peerToken)).status).toBe(403);
    await db.seasonEnrollment.update({
      where: { studentUserId_seasonId: { studentUserId: f.peerUserId, seasonId: f.seasonId } },
      data: { status: "ACTIVE" },
    });

    expect((await saveDraft(a.id, a.partIds[0]!, "x")).status).toBe(404);
    expect((await saveDraft(f.assignmentId, a.partIds[1]!, "x")).status).toBe(404);
    const tooLong = await saveDraft(a.id, a.partIds[1]!, "a".repeat(20_001));
    expect(tooLong.status).toBe(400);
    expect(await db.assignmentPartWork.count({ where: { partId: { in: a.partIds } } })).toBe(0);
  });
});

describe("POST /api/v1/submissions/:publicId/hand-in — a returned essay, again", () => {
  function handIn(publicId: string, token = f.ownerToken) {
    return request(app).post(`/api/v1/submissions/${publicId}/hand-in`).set(auth(token));
  }

  it("hand-in refuses outside the range with the server's count", async () => {
    const a = await createAssignmentWithParts({ seasonId: f.seasonId, title: "Range" }, [
      { kind: "ESSAY", minWords: 150, maxWords: 300 },
    ]);
    const work = await seedTextWork(a.id, a.partIds[0]!, f.studentUserId, "RETURNED", { text: words(142) });

    const short = await handIn(work.publicId);
    expect(short.status).toBe(400);
    expect(short.body.error).toEqual({ code: "word_range", message: "This is 142 words; it needs at least 150." });

    // Markup and pasted line breaks are counted the way the app counts them.
    await db.assignmentPartWork.update({
      where: { publicId: work.publicId },
      data: { text: `<p>${words(200)}</p>\n\n${words(120)}` },
    });
    const long = await handIn(work.publicId);
    expect(long.status).toBe(400);
    expect(long.body.error.message).toBe("This is 320 words; it needs at most 300.");

    // An entity counts as the plain text the app shows: "Tom & Jerry" is three words, so 150 here.
    await db.assignmentPartWork.update({
      where: { publicId: work.publicId },
      data: { text: `${words(147)} Tom &amp; Jerry` },
    });
    expect((await handIn(work.publicId)).status).toBe(200);
    await db.assignmentPartWork.update({
      where: { publicId: work.publicId },
      data: { status: "RETURNED", text: "  " },
    });
    expect((await handIn(work.publicId)).body.error.message).toBe("Write your essay before handing it in.");

    const row = await db.assignmentPartWork.findUniqueOrThrow({
      where: { publicId: work.publicId },
      select: { status: true },
    });
    expect(row.status).toBe("RETURNED");
  });

  it("hand-in again puts only that essay back in the queue and marks the assignment submitted", async () => {
    const a = await createAssignmentWithParts({ seasonId: f.seasonId, title: "Two essays" }, [
      { kind: "VIDEO", durationSeconds: 100 },
      { kind: "ESSAY", prompt: "First question" },
      { kind: "ESSAY", prompt: "Second question" },
    ]);
    await seedVideoWork(a.id, a.partIds[0]!, f.studentUserId, 100);
    const reviewed = await seedTextWork(a.id, a.partIds[1]!, f.studentUserId, "REVIEWED");
    const returned = await seedTextWork(a.id, a.partIds[2]!, f.studentUserId, "RETURNED", {
      publicId: newPublicId(),
    });
    await setSubmitted(a.id, f.studentUserId, null);

    const res = await handIn(returned.publicId);
    expect(res.status).toBe(200);
    expect(handInEssayResponseSchema.parse(res.body.data)).toEqual({
      reviewStatus: "SUBMITTED",
      assignmentSubmitted: true,
    });

    const sub = await db.submission.findUniqueOrThrow({
      where: { assignmentId_studentUserId: { assignmentId: a.id, studentUserId: f.studentUserId } },
      select: { submittedAt: true, completedAt: true },
    });
    expect(sub.submittedAt).not.toBeNull();
    expect(sub.completedAt).toBeNull();

    const queue = await request(app)
      .get(`/api/v1/submissions?seasonId=${f.seasonId}&limit=100`)
      .set(auth(f.leaderToken));
    const ids = (queue.body.data.items as { publicId: string }[]).map((i) => i.publicId);
    expect(ids).toContain(returned.publicId);
    expect(ids).not.toContain(reviewed.publicId);

    // One notification to the leader, naming the essay.
    const sent = await db.notification.findMany({
      where: { userId: f.leaderUserId, type: "SUBMISSION_RECEIVED", link: `/leader/submissions/${returned.publicId}` },
      select: { title: true },
    });
    expect(sent).toEqual([{ title: "Test owner handed in Two essays again: Second question" }]);

    // Once only: it is handed in now.
    const again = await handIn(returned.publicId);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("not_returned");
  });

  it("leaves the assignment unsubmitted while another part is not done", async () => {
    const a = await createAssignmentWithParts({ seasonId: f.seasonId, title: "Video short" }, [
      { kind: "VIDEO", durationSeconds: 100 },
      { kind: "ESSAY" },
    ]);
    await seedVideoWork(a.id, a.partIds[0]!, f.studentUserId, 30);
    const work = await seedTextWork(a.id, a.partIds[1]!, f.studentUserId, "RETURNED");
    const res = await handIn(work.publicId);
    expect(res.status).toBe(200);
    expect(res.body.data.assignmentSubmitted).toBe(false);
    const sub = await db.submission.findUniqueOrThrow({
      where: { assignmentId_studentUserId: { assignmentId: a.id, studentUserId: f.studentUserId } },
      select: { submittedAt: true },
    });
    expect(sub.submittedAt).toBeNull();
  });

  it("is only for a returned essay, and only its author's", async () => {
    const a = await createAssignmentWithParts({ seasonId: f.seasonId, title: "Hand-in gates" }, [
      { kind: "ESSAY" },
      { kind: "ESSAY" },
    ]);
    const draft = await seedTextWork(a.id, a.partIds[0]!, f.studentUserId, "DRAFT");
    const returned = await seedTextWork(a.id, a.partIds[1]!, f.studentUserId, "RETURNED");

    const fromDraft = await handIn(draft.publicId);
    expect(fromDraft.status).toBe(409);
    expect(fromDraft.body.error.code).toBe("not_returned");
    expect((await handIn(returned.publicId, f.peerToken)).status).toBe(403);
    expect((await handIn(returned.publicId, f.leaderToken)).status).toBe(403);
    expect((await handIn("doesnotexi")).status).toBe(404);
  });
});
