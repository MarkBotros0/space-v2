// apps/backend/src/__tests__/integration/forum-response-routes.test.ts
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { postForumResponse } from "../../lib/assignments/forum";
import { createForum, forumPath, OWN_TEXT, resetSubmissions, seedForumFixtures } from "./forum-setup";
import { cleanupTestData } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let assignmentId: number;
let partId: number;
let essayPartId: number;
let openForum: { assignmentId: number; partId: number };
let studentAId: number;
let studentAToken: string;
let studentBToken: string;
let withdrawnToken: string;
let leaderAToken: string;
let adminToken: string;
let mentorToken: string;
let base: string;

beforeAll(async () => {
  ({
    seasonId,
    assignmentId,
    partId,
    essayPartId,
    openForum,
    studentAId,
    studentAToken,
    studentBToken,
    withdrawnToken,
    leaderAToken,
    adminToken,
    mentorToken,
  } = await seedForumFixtures(app));
  base = forumPath({ assignmentId, partId });
});

beforeEach(() => resetSubmissions(seasonId));

afterAll(async () => {
  await cleanupTestData();
});

const post = (token: string, text = OWN_TEXT, path = base) =>
  request(app).put(`${path}/response`).set("authorization", `Bearer ${token}`).send({ text });

describe("PUT /api/v1/assignments/:id/parts/:partId/forum/response", () => {
  it("posts on an assignment the student has never opened — no row exists first", async () => {
    // The whole point. v1's forum writes are addressed by a submission id that
    // `ensureDraftSubmission` created while *rendering* the page; ruling C6
    // removed that read-time write, so this PUT is the creator.
    expect(await db.assignmentPartWork.count({ where: { partId, studentUserId: studentAId } })).toBe(0);

    const res = await post(studentAToken);

    expect(res.status).toBe(200);
    expect(res.body.data.posted).toBe(true);
    expect(res.body.data.status).toBe("SUBMITTED");
    expect(res.body.data.publicId).toEqual(expect.any(String));

    const row = await db.assignmentPartWork.findUnique({
      where: { partId_studentUserId: { partId, studentUserId: studentAId } },
      select: { publicId: true, status: true, submittedAt: true, text: true },
    });
    expect(row?.publicId).toBe(res.body.data.publicId);
    // Readers count any non-DRAFT forum work as posted; a post is SUBMITTED.
    expect(row?.status).toBe("SUBMITTED");
    expect(row?.submittedAt).not.toBeNull();
    // Stored as escaped HTML, shown as paragraphs.
    expect(row?.text).toBe(`<p>${OWN_TEXT}</p>`);
  });

  it("keeps the work's part, Submission and student in step", async () => {
    await post(studentAToken);
    const work = await db.assignmentPartWork.findUniqueOrThrow({
      where: { partId_studentUserId: { partId, studentUserId: studentAId } },
      select: {
        studentUserId: true,
        part: { select: { assignmentId: true } },
        submission: { select: { assignmentId: true, studentUserId: true, submittedAt: true } },
      },
    });
    expect(work.submission.assignmentId).toBe(work.part.assignmentId);
    expect(work.submission.assignmentId).toBe(assignmentId);
    expect(work.submission.studentUserId).toBe(work.studentUserId);
    expect(work.studentUserId).toBe(studentAId);
    // Posting is not Submit: the assignment stays unsubmitted.
    expect(work.submission.submittedAt).toBeNull();
    expect(await db.submission.count({ where: { assignmentId, studentUserId: studentAId } })).toBe(1);
  });

  it("posting marks the forum part done", async () => {
    const before = await request(app)
      .get(`/api/v1/assignments/${assignmentId}`)
      .set("authorization", `Bearer ${studentAToken}`);
    const forumBefore = before.body.data.my.parts.find((w: { partId: number }) => w.partId === partId);
    expect(forumBefore).toMatchObject({ kind: "FORUM", status: "NOT_STARTED" });

    await post(studentAToken);

    const after = await request(app)
      .get(`/api/v1/assignments/${assignmentId}`)
      .set("authorization", `Bearer ${studentAToken}`);
    expect(after.status).toBe(200);
    const forumAfter = after.body.data.my.parts.find((w: { partId: number }) => w.partId === partId);
    expect(forumAfter).toMatchObject({ kind: "FORUM", status: "DONE", forum: { posted: true } });
    // No review: the essay beside it is untouched.
    const essay = after.body.data.my.parts.find((w: { partId: number }) => w.partId === essayPartId);
    expect(essay.status).toBe("NOT_STARTED");
  });

  it("is idempotent and overwrites on a second call (v1 R13)", async () => {
    const first = await post(studentAToken);
    const second = await post(studentAToken, `${OWN_TEXT} seven`);

    expect(second.status).toBe(200);
    expect(second.body.data.publicId).toBe(first.body.data.publicId);
    expect(await db.assignmentPartWork.count({ where: { partId, studentUserId: studentAId } })).toBe(1);
    expect(await db.submission.count({ where: { assignmentId, studentUserId: studentAId } })).toBe(1);
  });

  it("enforces the part's minWords with the count the client shows", async () => {
    const res = await post(studentAToken, "too short");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("too_few_words");
    expect(res.body.error.message).toContain("5");
    expect(await db.assignmentPartWork.count({ where: { partId } })).toBe(0);
  });

  it("refuses an empty response even when there is no minimum (spec 14 D8)", async () => {
    const res = await post(studentBToken, "   ", forumPath(openForum));
    expect(res.status).toBe(400);
  });

  it("refuses a student without a live place in the season", async () => {
    // No group targeting: the whole season has the assignment, and a withdrawn
    // student is out of it.
    const res = await post(withdrawnToken);
    expect(res.status).toBe(403);
    expect(await db.assignmentPartWork.count({ where: { partId } })).toBe(0);
  });

  it("lets a student in any group post (the assignment covers the whole season)", async () => {
    expect((await post(studentBToken)).status).toBe(200);
  });

  it("refuses staff — a leader has no response of their own", async () => {
    for (const token of [leaderAToken, adminToken, mentorToken]) {
      const res = await post(token);
      expect(res.status).toBe(403);
    }
  });

  it("allows a late post, deliberately (spec 14 D5)", async () => {
    const past = await createForum(seasonId, "space-v2-test-forum-overdue", {}, { dueAt: new Date("2000-01-01") });
    const res = await post(studentAToken, OWN_TEXT, forumPath(past));
    expect(res.status).toBe(200);
  });

  it("404s a part that isn't a forum, and a forum part named under another assignment", async () => {
    const essay = await post(studentAToken, OWN_TEXT, forumPath({ assignmentId, partId: essayPartId }));
    expect(essay.status).toBe(404);
    const mismatched = await post(studentAToken, OWN_TEXT, forumPath({ assignmentId, partId: openForum.partId }));
    expect(mismatched.status).toBe(404);
    expect(await db.assignmentPartWork.count({ where: { studentUserId: studentAId } })).toBe(0);
  });

  it("a part removed before the write lands answers 404, not 500", async () => {
    const gone = await createForum(seasonId, "space-v2-test-forum-gone");
    await db.assignmentPart.delete({ where: { id: gone.partId } });
    await expect(postForumResponse(gone.partId, studentAId, OWN_TEXT)).rejects.toMatchObject({ status: 404 });

    // The assignment soft-deleted under the request: the same 404.
    const deleted = await createForum(seasonId, "space-v2-test-forum-deleted");
    await db.assignment.update({ where: { id: deleted.assignmentId }, data: { deletedAt: new Date() } });
    await expect(postForumResponse(deleted.partId, studentAId, OWN_TEXT)).rejects.toMatchObject({ status: 404 });
    expect(await db.submission.count({ where: { assignmentId: deleted.assignmentId } })).toBe(0);
  });

  it("a second forum part on the same assignment is impossible (DB unique)", async () => {
    await expect(
      db.assignmentPart.create({
        data: { assignmentId, position: 5, kind: "FORUM", prompt: "space-v2-test second forum" },
      }),
    ).rejects.toThrow();
    expect(await db.assignmentPart.count({ where: { assignmentId, kind: "FORUM" } })).toBe(1);
  });
});
