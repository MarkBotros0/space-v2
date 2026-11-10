import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { reviewEssayResponseSchema, submissionDetailSchema } from "../../../../../packages/shared/src/index";
import { createAssignmentWithParts, seedTextWork, seedVideoWork, setSubmitted } from "./assignment-reads-setup";
import { cleanupTestData } from "./fixtures";
import { seedSubmissionFixtures, seedSubmissionFor, type SubmissionFixtures } from "./submissions-setup";

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

/** The owner's essay on a brand-new one-essay assignment, in a known state. */
function seedSubmission(status: "SUBMITTED" | "DRAFT" | "REVIEWED", title: string): Promise<string> {
  return seedSubmissionFor(f.seasonId, f.studentUserId, status, title);
}

function review(publicId: string, body: object, token = f.leaderToken) {
  return request(app).post(`/api/v1/submissions/${publicId}/review`).set(auth(token)).send(body);
}

describe("GET /api/v1/submissions/:publicId — one essay", () => {
  it("returns the essay, its question and its limits to its author", async () => {
    const res = await request(app).get(`/api/v1/submissions/${f.publicId}`).set(auth(f.ownerToken));
    expect(res.status).toBe(200);
    const detail = submissionDetailSchema.parse(res.body.data);
    expect(detail).toMatchObject({
      publicId: f.publicId,
      status: "DRAFT",
      text: "first draft",
      wordCount: 2,
      partId: f.partId,
      prompt: "What did you learn?",
      minWords: null,
      maxWords: null,
      maxFileSizeMb: null,
      assignmentId: f.assignmentId,
      assignmentTitle: "Essay",
      assignmentDescription: "Write it",
      studentUserId: f.studentUserId,
      studentName: "Test owner",
      files: [],
      // This essay takes no files.
      canUploadFiles: false,
    });
  });

  it("allows the student's group leader and the season admin; refuses a peer", async () => {
    const pid = await seedSubmission("SUBMITTED", "Staff read");
    expect((await request(app).get(`/api/v1/submissions/${pid}`).set(auth(f.leaderToken))).status).toBe(200);
    expect((await request(app).get(`/api/v1/submissions/${pid}`).set(auth(f.adminToken))).status).toBe(200);
    const peer = await request(app).get(`/api/v1/submissions/${pid}`).set(auth(f.peerToken));
    expect(peer.status).toBe(403);
    expect(peer.body.error.code).toBe("forbidden");
  });

  it("hides a DRAFT from everyone but its author, as if it did not exist", async () => {
    for (const token of [f.leaderToken, f.adminToken, f.mentorToken, f.peerToken]) {
      const res = await request(app).get(`/api/v1/submissions/${f.publicId}`).set(auth(token));
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("not_found");
    }
  });

  it("is 404 for an unknown publicId and for a forum post's work, and 401 without a token", async () => {
    expect((await request(app).get("/api/v1/submissions/doesnotexi").set(auth(f.ownerToken))).status).toBe(404);
    const a = await createAssignmentWithParts({ seasonId: f.seasonId, title: "Forum only" }, [{ kind: "FORUM" }]);
    const post = await seedTextWork(a.id, a.partIds[0]!, f.studentUserId, "SUBMITTED");
    expect((await request(app).get(`/api/v1/submissions/${post.publicId}`).set(auth(f.leaderToken))).status).toBe(404);
    expect((await request(app).get(`/api/v1/submissions/${f.publicId}`)).status).toBe(401);
  });

  it("returns text and feedback as plain text, never stored markup (ruling C11)", async () => {
    const pid = await seedSubmission("SUBMITTED", "Sanitised read");
    await db.assignmentPartWork.update({
      where: { publicId: pid },
      data: {
        text: "<p>Hello &amp; <b>world</b></p><script>alert(1)</script><p>Line two</p>",
        feedback: "<p>Nice &lt;work&gt;</p>",
      },
    });
    const res = await request(app).get(`/api/v1/submissions/${pid}`).set(auth(f.ownerToken));
    expect(res.body.data.text).not.toMatch(/<\/?(p|b|script)/i);
    expect(res.body.data.text).toContain("Hello & world");
    expect(res.body.data.feedback).toBe("Nice <work>");
  });

  it("names the student's group in that assignment's season (C9)", async () => {
    const pid = await seedSubmission("SUBMITTED", "Group named");
    const res = await request(app).get(`/api/v1/submissions/${pid}`).set(auth(f.leaderToken));
    expect(res.body.data).toMatchObject({ groupId: f.groupAId, groupName: "Group A" });
    const ungrouped = await seedSubmissionFor(f.seasonId, f.peerUserId, "SUBMITTED", "Ungrouped peer");
    const read = await request(app).get(`/api/v1/submissions/${ungrouped}`).set(auth(f.adminToken));
    expect(read.body.data).toMatchObject({ groupId: null, groupName: null });
  });
});

describe("POST /api/v1/submissions/:publicId/review — each essay on its own", () => {
  it("lets the group's leader mark an essay reviewed and tells the student", async () => {
    const pid = await seedSubmission("SUBMITTED", "Leader reviews");
    const res = await review(pid, { action: "reviewed", feedback: "Good work." });
    expect(res.status).toBe(200);
    expect(reviewEssayResponseSchema.parse(res.body.data)).toEqual({ reviewStatus: "REVIEWED" });
    const row = await db.assignmentPartWork.findUniqueOrThrow({
      where: { publicId: pid },
      select: { status: true, feedback: true, reviewedAt: true, reviewedById: true },
    });
    expect(row).toMatchObject({ status: "REVIEWED", feedback: "Good work.", reviewedById: f.leaderUserId });
    expect(row.reviewedAt).not.toBeNull();
    const n = await db.notification.findFirst({
      where: { userId: f.studentUserId, type: "SUBMISSION_REVIEWED", title: { contains: "Leader reviews" } },
      select: { title: true, body: true },
    });
    expect(n).toEqual({ title: 'Feedback ready on "Leader reviews"', body: null });
  });

  it("marks reviewed with no feedback, but a return needs a note", async () => {
    const pid = await seedSubmission("SUBMITTED", "Note needed");
    for (const feedback of [null, "  "]) {
      const res = await review(pid, { action: "return", feedback });
      expect(res.status).toBe(400);
      expect(res.body.error).toEqual({ code: "bad_request", message: "Say what to change" });
    }
    expect((await review(pid, { returnForRevision: true, feedback: "old body" })).status).toBe(400);
    const ok = await review(pid, { action: "reviewed", feedback: null });
    expect(ok.status).toBe(200);
  });

  it("returning one essay reopens only it", async () => {
    const a = await createAssignmentWithParts({ seasonId: f.seasonId, title: "Mixed parts" }, [
      { kind: "VIDEO", durationSeconds: 100 },
      { kind: "ESSAY", prompt: "One" },
      { kind: "ESSAY", prompt: "Two" },
      { kind: "FORUM" },
    ]);
    const [videoId, essay1, essay2, forumId] = a.partIds as [number, number, number, number];
    await seedVideoWork(a.id, videoId, f.studentUserId, 95);
    await seedTextWork(a.id, essay1, f.studentUserId, "REVIEWED", { feedback: "Fine." });
    const second = await seedTextWork(a.id, essay2, f.studentUserId, "SUBMITTED");
    await seedTextWork(a.id, forumId, f.studentUserId, "SUBMITTED", { text: "my post" });
    await setSubmitted(a.id, f.studentUserId, new Date());

    const res = await review(second.publicId, { action: "return", feedback: "Answer the second half." });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ reviewStatus: "RETURNED" });

    const works = await db.assignmentPartWork.findMany({
      where: { part: { assignmentId: a.id }, studentUserId: f.studentUserId },
      select: { partId: true, status: true, feedback: true, watchedSeconds: true, text: true },
    });
    const by = new Map(works.map((w) => [w.partId, w]));
    expect(by.get(essay1)).toMatchObject({ status: "REVIEWED", feedback: "Fine." });
    expect(by.get(essay2)).toMatchObject({ status: "RETURNED", feedback: "Answer the second half." });
    expect(by.get(videoId)).toMatchObject({ watchedSeconds: 95 });
    expect(by.get(forumId)).toMatchObject({ status: "SUBMITTED", text: "my post" });
    const sub = await db.submission.findUniqueOrThrow({
      where: { assignmentId_studentUserId: { assignmentId: a.id, studentUserId: f.studentUserId } },
      select: { submittedAt: true, completedAt: true },
    });
    expect(sub).toEqual({ submittedAt: null, completedAt: null });

    const n = await db.notification.findFirst({
      where: { userId: f.studentUserId, type: "SUBMISSION_REVIEWED", title: { contains: "Mixed parts" } },
      select: { title: true },
    });
    expect(n?.title).toBe("Mixed parts was returned for revision");
  });

  it("completes the assignment once every essay of it is reviewed", async () => {
    const a = await createAssignmentWithParts({ seasonId: f.seasonId, title: "Complete me" }, [
      { kind: "ESSAY" },
      { kind: "ESSAY" },
    ]);
    const one = await seedTextWork(a.id, a.partIds[0]!, f.studentUserId, "SUBMITTED");
    const two = await seedTextWork(a.id, a.partIds[1]!, f.studentUserId, "SUBMITTED");
    await setSubmitted(a.id, f.studentUserId, new Date());
    const completedAt = () =>
      db.submission
        .findUniqueOrThrow({
          where: { assignmentId_studentUserId: { assignmentId: a.id, studentUserId: f.studentUserId } },
          select: { completedAt: true },
        })
        .then((s) => s.completedAt);

    await review(one.publicId, { action: "reviewed", feedback: null });
    expect(await completedAt()).toBeNull();
    await review(two.publicId, { action: "reviewed", feedback: "Both good." });
    expect(await completedAt()).not.toBeNull();
  });

  it("refuses the author, a mentor and an unrelated student; 404s a DRAFT; 409s a returned essay", async () => {
    const pid = await seedSubmission("SUBMITTED", "Review refusals");
    for (const token of [f.ownerToken, f.mentorToken, f.peerToken]) {
      expect((await review(pid, { action: "reviewed", feedback: "no" }, token)).status).toBe(403);
    }
    // A MENTOR reads every essay but reviews none.
    const read = await request(app).get(`/api/v1/submissions/${pid}`).set(auth(f.mentorToken));
    expect(read.status).toBe(200);
    expect(read.body.data.canReview).toBe(false);

    const draft = await seedSubmission("DRAFT", "Never submitted");
    for (const body of [
      { action: "reviewed", feedback: "?" },
      { action: "return", feedback: "?" },
    ]) {
      const res = await review(draft, body, f.adminToken);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("not_found");
    }

    await review(pid, { action: "return", feedback: "Again." });
    const twice = await review(pid, { action: "reviewed", feedback: null });
    expect(twice.status).toBe(409);
    expect(twice.body.error.code).toBe("not_handed_in");
    const rows = await db.assignmentPartWork.findMany({
      where: { publicId: { in: [pid, draft] } },
      select: { publicId: true, status: true },
    });
    expect(new Map(rows.map((r) => [r.publicId, r.status]))).toEqual(
      new Map([
        [pid, "RETURNED"],
        [draft, "DRAFT"],
      ]),
    );
  });
});

describe("sibling essays of one student, written at once", () => {
  async function twoEssays(title: string) {
    const a = await createAssignmentWithParts({ seasonId: f.seasonId, title }, [{ kind: "ESSAY" }, { kind: "ESSAY" }]);
    const standing = () =>
      db.submission.findUniqueOrThrow({
        where: { assignmentId_studentUserId: { assignmentId: a.id, studentUserId: f.studentUserId } },
        select: { submittedAt: true, completedAt: true },
      });
    return { a, standing };
  }

  it("two reviewers marking the last two essays together complete the assignment", async () => {
    const { a, standing } = await twoEssays("Reviewed together");
    const one = await seedTextWork(a.id, a.partIds[0]!, f.studentUserId, "SUBMITTED");
    const two = await seedTextWork(a.id, a.partIds[1]!, f.studentUserId, "SUBMITTED");
    await setSubmitted(a.id, f.studentUserId, new Date());
    const [r1, r2] = await Promise.all([
      review(one.publicId, { action: "reviewed", feedback: null }, f.leaderToken),
      review(two.publicId, { action: "reviewed", feedback: null }, f.adminToken),
    ]);
    expect([r1.status, r2.status]).toEqual([200, 200]);
    expect((await standing()).completedAt).not.toBeNull();
  });

  it("a return racing a hand-in of the other essay leaves the assignment unsubmitted", async () => {
    const { a, standing } = await twoEssays("Return races hand-in");
    const back = await seedTextWork(a.id, a.partIds[0]!, f.studentUserId, "RETURNED");
    const waiting = await seedTextWork(a.id, a.partIds[1]!, f.studentUserId, "SUBMITTED");
    await setSubmitted(a.id, f.studentUserId, null);
    const [handIn, ret] = await Promise.all([
      request(app).post(`/api/v1/submissions/${back.publicId}/hand-in`).set(auth(f.ownerToken)),
      review(waiting.publicId, { action: "return", feedback: "Redo this one." }),
    ]);
    expect([handIn.status, ret.status]).toEqual([200, 200]);
    // Whichever ran first, essay two is now returned, so the assignment is not submitted.
    expect(await standing()).toEqual({ submittedAt: null, completedAt: null });
  });

  it("stores no feedback, not an empty one, for a blank note on reviewed", async () => {
    const pid = await seedSubmission("SUBMITTED", "Blank note");
    expect((await review(pid, { action: "reviewed", feedback: "   " })).status).toBe(200);
    const row = await db.assignmentPartWork.findUniqueOrThrow({ where: { publicId: pid }, select: { feedback: true } });
    expect(row.feedback).toBeNull();
  });
});
