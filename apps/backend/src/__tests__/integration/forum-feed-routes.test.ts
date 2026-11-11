// apps/backend/src/__tests__/integration/forum-feed-routes.test.ts
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { newPublicId } from "../../lib/public-id";
import { forumPath, OWN_TEXT, resetSubmissions, seedForumFixtures } from "./forum-setup";
import { cleanupTestData, createTestUser, login } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let assignmentId: number;
let partId: number;
let essayPartId: number;
let base: string;
let groupAId: number;
let studentAId: number;
let studentA2Id: number;
let studentAToken: string;
let studentA2Token: string;
let studentBToken: string;
let withdrawnToken: string;
let leaderAToken: string;
let leaderBToken: string;
let adminToken: string;
let mentorToken: string;

beforeAll(async () => {
  ({
    seasonId,
    assignmentId,
    partId,
    essayPartId,
    groupAId,
    studentAId,
    studentA2Id,
    studentAToken,
    studentA2Token,
    studentBToken,
    withdrawnToken,
    leaderAToken,
    leaderBToken,
    adminToken,
    mentorToken,
  } = await seedForumFixtures(app));
  base = forumPath({ assignmentId, partId });
});

beforeEach(() => resetSubmissions(seasonId));

afterAll(async () => {
  await cleanupTestData();
});

/** studentA2's work on the forum part, written straight to the database. */
async function seedPeerWork(status: "DRAFT" | "SUBMITTED", text: string | null) {
  const submission = await db.submission.create({
    data: { assignmentId, studentUserId: studentA2Id, publicId: newPublicId() },
    select: { id: true },
  });
  await db.assignmentPartWork.create({
    data: {
      publicId: newPublicId(),
      partId,
      submissionId: submission.id,
      studentUserId: studentA2Id,
      status,
      text,
      submittedAt: status === "DRAFT" ? null : new Date(),
    },
  });
}

describe("GET /api/v1/assignments/:id/parts/:partId/forum", () => {
  it("404s a part that isn't a forum, for student and staff alike", async () => {
    for (const token of [studentAToken, adminToken]) {
      const res = await request(app)
        .get(forumPath({ assignmentId, partId: essayPartId }))
        .set("authorization", `Bearer ${token}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("not_found");
    }
  });

  it("404s an assignment that is gone, before any audience check", async () => {
    const res = await request(app)
      .get(forumPath({ assignmentId: 987_654_321, partId }))
      .set("authorization", `Bearer ${studentBToken}`);
    expect(res.status).toBe(404);
  });

  it("renders for a student with no submission row at all", async () => {
    const res = await request(app).get(base).set("authorization", `Bearer ${studentAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.own).toMatchObject({
      publicId: null,
      text: "",
      status: "DRAFT",
      wordCount: 0,
      posted: false,
    });
    expect(res.body.data.locked).toBe(true);
    expect(res.body.data.posts).toEqual([]);
    expect(res.body.data.minWords).toBe(5);
    // The forum's own settings come from its part.
    expect(res.body.data).toMatchObject({ partId, prompt: "space-v2-test share one idea", allowComments: true });
    // v1's FORUM branch renders no due date at all (spec 14 R33/D10).
    expect(res.body.data.dueAt).toBe("2099-01-01T00:00:00.000Z");
  });

  it("keeps the feed locked until the student posts, then unlocks it", async () => {
    await request(app)
      .put(`${base}/response`)
      .set("authorization", `Bearer ${studentA2Token}`)
      .send({ text: `${OWN_TEXT} peer` });

    const locked = await request(app).get(base).set("authorization", `Bearer ${studentAToken}`);
    expect(locked.body.data.locked).toBe(true);
    expect(locked.body.data.posts).toEqual([]);

    await request(app).put(`${base}/response`).set("authorization", `Bearer ${studentAToken}`).send({ text: OWN_TEXT });

    const unlocked = await request(app).get(base).set("authorization", `Bearer ${studentAToken}`);
    expect(unlocked.body.data.locked).toBe(false);
    expect(unlocked.body.data.posts).toHaveLength(1);
    expect(unlocked.body.data.posts[0].studentUserId).toBe(studentA2Id);
  });

  it("never exposes an unposted peer's draft text (spec 14 R23)", async () => {
    // The single most important privacy rule in the domain, and in v1 it lives
    // entirely in a where clause.
    await seedPeerWork("DRAFT", "<p>space-v2-test-secret-draft</p>");
    await request(app).put(`${base}/response`).set("authorization", `Bearer ${studentAToken}`).send({ text: OWN_TEXT });

    const res = await request(app).get(base).set("authorization", `Bearer ${studentAToken}`);

    expect(res.body.data.posts).toEqual([]);
    expect(JSON.stringify(res.body)).not.toContain("secret-draft");
  });

  it("never serves a posted-looking peer row that has no text (spec 14 R23)", async () => {
    // The other half of the rule: a non-DRAFT row whose text is null (a
    // file-only submission, say) is not a forum post and must not appear as an
    // empty one.
    await seedPeerWork("SUBMITTED", null);
    await request(app).put(`${base}/response`).set("authorization", `Bearer ${studentAToken}`).send({ text: OWN_TEXT });

    const res = await request(app).get(base).set("authorization", `Bearer ${studentAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.posts).toEqual([]);
  });

  it("shows only the reader's own group", async () => {
    for (const token of [studentAToken, studentA2Token, studentBToken]) {
      await request(app).put(`${base}/response`).set("authorization", `Bearer ${token}`).send({ text: OWN_TEXT });
    }

    const res = await request(app).get(base).set("authorization", `Bearer ${studentAToken}`);

    expect(res.body.data.groupId).toBe(groupAId);
    expect(res.body.data.posts).toHaveLength(1);
    expect(res.body.data.posts[0].studentUserId).toBe(studentA2Id);
  });

  it("sends plain text and never an email address (spec 14 D6)", async () => {
    await request(app)
      .put(`${base}/response`)
      .set("authorization", `Bearer ${studentA2Token}`)
      .send({ text: OWN_TEXT });
    await request(app).put(`${base}/response`).set("authorization", `Bearer ${studentAToken}`).send({ text: OWN_TEXT });

    const res = await request(app).get(base).set("authorization", `Bearer ${studentAToken}`);

    expect(res.body.data.posts[0].text).toBe(OWN_TEXT);
    expect(res.body.data.posts[0].text).not.toContain("<p>");
    expect(JSON.stringify(res.body)).not.toContain("@jpc.test");
  });

  it("gives a leader their own group's thread and refuses another group's", async () => {
    // New capability: v1 has no staff forum screen at all (spec 14 R53).
    for (const token of [studentAToken, studentBToken]) {
      await request(app).put(`${base}/response`).set("authorization", `Bearer ${token}`).send({ text: OWN_TEXT });
    }

    const leaderA = await request(app).get(base).set("authorization", `Bearer ${leaderAToken}`);
    expect(leaderA.status).toBe(200);
    // Staff read every post they are scoped to, and are never locked.
    expect(leaderA.body.data.locked).toBe(false);
    expect(leaderA.body.data.own).toBeNull();
    expect(leaderA.body.data.posts.map((p: { studentUserId: number }) => p.studentUserId)).toEqual([studentAId]);

    const leaderB = await request(app).get(base).set("authorization", `Bearer ${leaderBToken}`);
    expect(leaderB.body.data.posts.some((p: { studentUserId: number }) => p.studentUserId === studentAId)).toBe(false);
  });

  it("gives an admin and a mentor every group", async () => {
    for (const token of [studentAToken, studentBToken]) {
      await request(app).put(`${base}/response`).set("authorization", `Bearer ${token}`).send({ text: OWN_TEXT });
    }
    for (const token of [adminToken, mentorToken]) {
      const res = await request(app).get(base).set("authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.posts).toHaveLength(2);
    }
  });

  it("refuses a student without a live place in the season", async () => {
    const res = await request(app).get(base).set("authorization", `Bearer ${withdrawnToken}`);
    expect(res.status).toBe(403);
  });

  it("paginates instead of returning the whole thread (spec 14 D7)", async () => {
    const extras = await Promise.all(Array.from({ length: 3 }, (_, i) => createTestUser(`fbulk${i}`, "STUDENT")));
    await db.seasonEnrollment.createMany({
      data: extras.map((u) => ({
        seasonId,
        studentUserId: u.id,
        groupId: groupAId,
        status: "ACTIVE" as const,
      })),
    });
    for (const u of extras) {
      const token = await login(app, u.email);
      await request(app).put(`${base}/response`).set("authorization", `Bearer ${token}`).send({ text: OWN_TEXT });
    }
    await request(app).put(`${base}/response`).set("authorization", `Bearer ${studentAToken}`).send({ text: OWN_TEXT });

    const page1 = await request(app).get(`${base}?limit=2`).set("authorization", `Bearer ${studentAToken}`);
    expect(page1.body.data.posts).toHaveLength(2);
    expect(page1.body.data.nextCursor).toEqual(expect.any(String));

    const page2 = await request(app)
      .get(`${base}?limit=2&cursor=${page1.body.data.nextCursor}`)
      .set("authorization", `Bearer ${studentAToken}`);
    expect(page2.body.data.posts).toHaveLength(1);
    expect(page2.body.data.nextCursor).toBeNull();
  });
});
