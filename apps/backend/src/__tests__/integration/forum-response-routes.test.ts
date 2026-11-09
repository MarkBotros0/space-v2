// apps/backend/src/__tests__/integration/forum-response-routes.test.ts
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { OWN_TEXT, resetSubmissions, seedForumFixtures } from "./forum-setup";
import { cleanupTestData } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let assignmentId: number;
let untargetedAssignmentId: number;
let studentAId: number;
let studentAToken: string;
let studentBToken: string;
let leaderAToken: string;
let adminToken: string;
let mentorToken: string;

beforeAll(async () => {
  ({
    seasonId,
    assignmentId,
    untargetedAssignmentId,
    studentAId,
    studentAToken,
    studentBToken,
    leaderAToken,
    adminToken,
    mentorToken,
  } = await seedForumFixtures(app));
});

beforeEach(() => resetSubmissions(seasonId));

afterAll(async () => {
  await cleanupTestData();
});

describe("PUT /api/v1/assignments/:id/forum/response", () => {
  it("posts on an assignment the student has never opened — no row exists first", async () => {
    // The whole point. v1's forum writes are addressed by a submission id that
    // `ensureDraftSubmission` created while *rendering* the page; ruling C6
    // removed that read-time write, so this PUT is the creator.
    expect(await db.submission.count({ where: { assignmentId, studentUserId: studentAId } })).toBe(0);

    const res = await request(app)
      .put(`/api/v1/assignments/${assignmentId}/forum/response`)
      .set("authorization", `Bearer ${studentAToken}`)
      .send({ text: OWN_TEXT });

    expect(res.status).toBe(200);
    expect(res.body.data.posted).toBe(true);
    expect(res.body.data.submissionPublicId).toEqual(expect.any(String));

    const row = await db.submission.findUnique({
      where: { assignmentId_studentUserId: { assignmentId, studentUserId: studentAId } },
      select: { status: true, submittedAt: true, text: true },
    });
    expect(row?.status).toBe("SUBMITTED");
    expect(row?.submittedAt).not.toBeNull();
    // Stored as escaped HTML so v1's renderer, which is live against this same
    // database, shows it as paragraphs rather than one run-on line.
    expect(row?.text).toBe(`<p>${OWN_TEXT}</p>`);
  });

  it("is idempotent and overwrites on a second call (v1 R13)", async () => {
    const first = await request(app)
      .put(`/api/v1/assignments/${assignmentId}/forum/response`)
      .set("authorization", `Bearer ${studentAToken}`)
      .send({ text: OWN_TEXT });
    const second = await request(app)
      .put(`/api/v1/assignments/${assignmentId}/forum/response`)
      .set("authorization", `Bearer ${studentAToken}`)
      .send({ text: `${OWN_TEXT} seven` });

    expect(second.status).toBe(200);
    expect(second.body.data.submissionPublicId).toBe(first.body.data.submissionPublicId);
    expect(await db.submission.count({ where: { assignmentId, studentUserId: studentAId } })).toBe(1);
  });

  it("enforces forumMinWords with the count the client shows", async () => {
    const res = await request(app)
      .put(`/api/v1/assignments/${assignmentId}/forum/response`)
      .set("authorization", `Bearer ${studentAToken}`)
      .send({ text: "too short" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("too_few_words");
    expect(res.body.error.message).toContain("5");
  });

  it("refuses an empty response even when the minimum is zero (spec 14 D8)", async () => {
    const res = await request(app)
      .put(`/api/v1/assignments/${untargetedAssignmentId}/forum/response`)
      .set("authorization", `Bearer ${studentBToken}`)
      .send({ text: "   " });
    expect(res.status).toBe(400);
  });

  it("REFUSES an assignment the student is not targeted by", async () => {
    // v1's post action checks identity, type and word count and nothing else —
    // targeting exists only as a page's early return (spec 14 R7/R15).
    const res = await request(app)
      .put(`/api/v1/assignments/${untargetedAssignmentId}/forum/response`)
      .set("authorization", `Bearer ${studentAToken}`)
      .send({ text: OWN_TEXT });
    expect(res.status).toBe(403);
    expect(await db.submission.count({ where: { assignmentId: untargetedAssignmentId } })).toBe(0);
  });

  it("refuses staff — a leader has no response of their own", async () => {
    for (const token of [leaderAToken, adminToken, mentorToken]) {
      const res = await request(app)
        .put(`/api/v1/assignments/${assignmentId}/forum/response`)
        .set("authorization", `Bearer ${token}`)
        .send({ text: OWN_TEXT });
      expect(res.status).toBe(403);
    }
  });

  it("allows a late post, deliberately (spec 14 D5)", async () => {
    // dueAt on this assignment is in the past relative to nothing — it is
    // 2099-01-01 and the fixture posts "after" it only conceptually; what this
    // pins is that no due-date branch exists at all in the handler.
    const past = await db.assignment.create({
      data: {
        seasonId,
        title: "space-v2-test-forum-overdue",
        type: "FORUM",
        forumMinWords: 0,
        isAllGroups: true,
        dueAt: new Date("2000-01-01T00:00:00.000Z"),
      },
      select: { id: true },
    });
    const res = await request(app)
      .put(`/api/v1/assignments/${past.id}/forum/response`)
      .set("authorization", `Bearer ${studentAToken}`)
      .send({ text: OWN_TEXT });
    expect(res.status).toBe(200);
  });

  it("404s a STANDARD assignment", async () => {
    const standard = await db.assignment.create({
      data: { seasonId, title: "space-v2-test-standard", type: "STANDARD", isAllGroups: true },
      select: { id: true },
    });
    const res = await request(app)
      .put(`/api/v1/assignments/${standard.id}/forum/response`)
      .set("authorization", `Bearer ${studentAToken}`)
      .send({ text: OWN_TEXT });
    expect(res.status).toBe(404);
  });
});
