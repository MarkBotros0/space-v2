// apps/backend/src/__tests__/integration/forum-routes.test.ts
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { newPublicId } from "../../lib/public-id";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

// Every string below is invented. Nothing a real student wrote is reproduced
// anywhere in this repository.
const OWN_TEXT = "space-v2-test response one two three four five six";

let seasonId: number;
let assignmentId: number;
let untargetedAssignmentId: number;
let groupAId: number;
let studentAId: number;
let studentA2Id: number;
let studentAToken: string;
let studentA2Token: string;
let studentBToken: string;
let leaderAToken: string;
let leaderBToken: string;
let adminToken: string;
let mentorToken: string;

async function resetSubmissions(): Promise<void> {
  await db.forumComment.deleteMany({ where: { submission: { assignment: { seasonId } } } });
  await db.submission.deleteMany({ where: { assignment: { seasonId } } });
}

beforeAll(async () => {
  await cleanupTestData();

  const season = await createTestSeason();
  seasonId = season.id;

  const studentA = await createTestUser("fstudenta", "STUDENT");
  const studentA2 = await createTestUser("fstudenta2", "STUDENT");
  const studentB = await createTestUser("fstudentb", "STUDENT");
  const leaderA = await createTestUser("fleadera", "LEADER");
  const leaderB = await createTestUser("fleaderb", "LEADER");
  const admin = await createTestUser("fadmin", "ADMIN");
  const mentor = await createTestUser("fmentor", "MENTOR");
  studentAId = studentA.id;
  studentA2Id = studentA2.id;

  const groupA = await db.group.create({
    data: { seasonId, name: "Group A", leaders: { create: { userId: leaderA.id } } },
    select: { id: true },
  });
  const groupB = await db.group.create({
    data: { seasonId, name: "Group B", leaders: { create: { userId: leaderB.id } } },
    select: { id: true },
  });
  groupAId = groupA.id;

  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  await db.seasonEnrollment.createMany({
    data: [
      { seasonId, studentUserId: studentA.id, groupId: groupA.id, status: "ACTIVE" },
      { seasonId, studentUserId: studentA2.id, groupId: groupA.id, status: "ACTIVE" },
      { seasonId, studentUserId: studentB.id, groupId: groupB.id, status: "ACTIVE" },
    ],
  });

  const assignment = await db.assignment.create({
    data: {
      seasonId,
      title: "space-v2-test-forum",
      type: "FORUM",
      forumMinWords: 5,
      forumAllowComments: true,
      isAllGroups: true,
      dueAt: new Date("2099-01-01T00:00:00.000Z"),
    },
    select: { id: true },
  });
  assignmentId = assignment.id;

  // Targeted at group B only — student A must never reach it.
  const untargeted = await db.assignment.create({
    data: {
      seasonId,
      title: "space-v2-test-forum-b-only",
      type: "FORUM",
      forumMinWords: 0,
      forumAllowComments: true,
      isAllGroups: false,
      targets: { create: { groupId: groupB.id } },
    },
    select: { id: true },
  });
  untargetedAssignmentId = untargeted.id;

  studentAToken = await login(app, studentA.email);
  studentA2Token = await login(app, studentA2.email);
  studentBToken = await login(app, studentB.email);
  leaderAToken = await login(app, leaderA.email);
  leaderBToken = await login(app, leaderB.email);
  adminToken = await login(app, admin.email);
  mentorToken = await login(app, mentor.email);
});

beforeEach(resetSubmissions);

afterAll(async () => {
  await cleanupTestData();
});

describe("PUT /api/v1/assignments/:id/forum/response", () => {
  it("posts on an assignment the student has never opened — no row exists first", async () => {
    // The whole point. v1's forum writes are addressed by a submission id that
    // `ensureDraftSubmission` created while *rendering* the page; ruling C6
    // removed that read-time write, so this PUT is the creator.
    expect(await db.submission.count({ where: { assignmentId, studentUserId: studentAId } })).toBe(
      0,
    );

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
    expect(await db.submission.count({ where: { assignmentId, studentUserId: studentAId } })).toBe(
      1,
    );
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

describe("GET /api/v1/assignments/:id/forum", () => {
  it("404s a STANDARD assignment for student and staff alike", async () => {
    const standard = await db.assignment.create({
      data: { seasonId, title: "space-v2-test-standard-get", type: "STANDARD", isAllGroups: true },
      select: { id: true },
    });
    for (const token of [studentAToken, adminToken]) {
      const res = await request(app)
        .get(`/api/v1/assignments/${standard.id}/forum`)
        .set("authorization", `Bearer ${token}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("not_found");
    }
  });

  it("renders for a student with no submission row at all", async () => {
    const res = await request(app)
      .get(`/api/v1/assignments/${assignmentId}/forum`)
      .set("authorization", `Bearer ${studentAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.own).toMatchObject({
      submissionPublicId: null,
      text: "",
      status: "DRAFT",
      wordCount: 0,
      posted: false,
    });
    expect(res.body.data.locked).toBe(true);
    expect(res.body.data.posts).toEqual([]);
    expect(res.body.data.minWords).toBe(5);
    // v1's FORUM branch renders no due date at all (spec 14 R33/D10).
    expect(res.body.data.dueAt).toBe("2099-01-01T00:00:00.000Z");
  });

  it("keeps the feed locked until the student posts, then unlocks it", async () => {
    await request(app)
      .put(`/api/v1/assignments/${assignmentId}/forum/response`)
      .set("authorization", `Bearer ${studentA2Token}`)
      .send({ text: `${OWN_TEXT} peer` });

    const locked = await request(app)
      .get(`/api/v1/assignments/${assignmentId}/forum`)
      .set("authorization", `Bearer ${studentAToken}`);
    expect(locked.body.data.locked).toBe(true);
    expect(locked.body.data.posts).toEqual([]);

    await request(app)
      .put(`/api/v1/assignments/${assignmentId}/forum/response`)
      .set("authorization", `Bearer ${studentAToken}`)
      .send({ text: OWN_TEXT });

    const unlocked = await request(app)
      .get(`/api/v1/assignments/${assignmentId}/forum`)
      .set("authorization", `Bearer ${studentAToken}`);
    expect(unlocked.body.data.locked).toBe(false);
    expect(unlocked.body.data.posts).toHaveLength(1);
    expect(unlocked.body.data.posts[0].studentUserId).toBe(studentA2Id);
  });

  it("never exposes an unposted peer's draft text (spec 14 R23)", async () => {
    // The single most important privacy rule in the domain, and in v1 it lives
    // entirely in a where clause.
    await db.submission.create({
      data: {
        assignmentId,
        studentUserId: studentA2Id,
        publicId: newPublicId(),
        status: "DRAFT",
        text: "<p>space-v2-test-secret-draft</p>",
      },
    });
    await request(app)
      .put(`/api/v1/assignments/${assignmentId}/forum/response`)
      .set("authorization", `Bearer ${studentAToken}`)
      .send({ text: OWN_TEXT });

    const res = await request(app)
      .get(`/api/v1/assignments/${assignmentId}/forum`)
      .set("authorization", `Bearer ${studentAToken}`);

    expect(res.body.data.posts).toEqual([]);
    expect(JSON.stringify(res.body)).not.toContain("secret-draft");
  });

  it("never serves a posted-looking peer row that has no text (spec 14 R23)", async () => {
    // The other half of the rule: a non-DRAFT row whose text is null (a
    // file-only submission, say) is not a forum post and must not appear as an
    // empty one.
    await db.submission.create({
      data: {
        assignmentId,
        studentUserId: studentA2Id,
        publicId: newPublicId(),
        status: "SUBMITTED",
        text: null,
        submittedAt: new Date(),
      },
    });
    await request(app)
      .put(`/api/v1/assignments/${assignmentId}/forum/response`)
      .set("authorization", `Bearer ${studentAToken}`)
      .send({ text: OWN_TEXT });

    const res = await request(app)
      .get(`/api/v1/assignments/${assignmentId}/forum`)
      .set("authorization", `Bearer ${studentAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.posts).toEqual([]);
  });

  it("shows only the reader's own group", async () => {
    for (const token of [studentAToken, studentA2Token, studentBToken]) {
      await request(app)
        .put(`/api/v1/assignments/${assignmentId}/forum/response`)
        .set("authorization", `Bearer ${token}`)
        .send({ text: OWN_TEXT });
    }

    const res = await request(app)
      .get(`/api/v1/assignments/${assignmentId}/forum`)
      .set("authorization", `Bearer ${studentAToken}`);

    expect(res.body.data.groupId).toBe(groupAId);
    expect(res.body.data.posts).toHaveLength(1);
    expect(res.body.data.posts[0].studentUserId).toBe(studentA2Id);
  });

  it("sends plain text and never an email address (spec 14 D6)", async () => {
    await request(app)
      .put(`/api/v1/assignments/${assignmentId}/forum/response`)
      .set("authorization", `Bearer ${studentA2Token}`)
      .send({ text: OWN_TEXT });
    await request(app)
      .put(`/api/v1/assignments/${assignmentId}/forum/response`)
      .set("authorization", `Bearer ${studentAToken}`)
      .send({ text: OWN_TEXT });

    const res = await request(app)
      .get(`/api/v1/assignments/${assignmentId}/forum`)
      .set("authorization", `Bearer ${studentAToken}`);

    expect(res.body.data.posts[0].text).toBe(OWN_TEXT);
    expect(res.body.data.posts[0].text).not.toContain("<p>");
    expect(JSON.stringify(res.body)).not.toContain("@jpc.test");
  });

  it("gives a leader their own group's thread and refuses another group's", async () => {
    // New capability: v1 has no staff forum screen at all (spec 14 R53).
    for (const token of [studentAToken, studentBToken]) {
      await request(app)
        .put(`/api/v1/assignments/${assignmentId}/forum/response`)
        .set("authorization", `Bearer ${token}`)
        .send({ text: OWN_TEXT });
    }

    const leaderA = await request(app)
      .get(`/api/v1/assignments/${assignmentId}/forum`)
      .set("authorization", `Bearer ${leaderAToken}`);
    expect(leaderA.status).toBe(200);
    // Staff read every post they are scoped to, and are never locked.
    expect(leaderA.body.data.locked).toBe(false);
    expect(leaderA.body.data.own).toBeNull();
    expect(leaderA.body.data.posts.map((p: { studentUserId: number }) => p.studentUserId)).toEqual([
      studentAId,
    ]);

    const leaderB = await request(app)
      .get(`/api/v1/assignments/${assignmentId}/forum`)
      .set("authorization", `Bearer ${leaderBToken}`);
    expect(
      leaderB.body.data.posts.some(
        (p: { studentUserId: number }) => p.studentUserId === studentAId,
      ),
    ).toBe(false);
  });

  it("gives an admin and a mentor every group", async () => {
    for (const token of [studentAToken, studentBToken]) {
      await request(app)
        .put(`/api/v1/assignments/${assignmentId}/forum/response`)
        .set("authorization", `Bearer ${token}`)
        .send({ text: OWN_TEXT });
    }
    for (const token of [adminToken, mentorToken]) {
      const res = await request(app)
        .get(`/api/v1/assignments/${assignmentId}/forum`)
        .set("authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.posts).toHaveLength(2);
    }
  });

  it("refuses a student the assignment does not target", async () => {
    const res = await request(app)
      .get(`/api/v1/assignments/${untargetedAssignmentId}/forum`)
      .set("authorization", `Bearer ${studentAToken}`);
    expect(res.status).toBe(403);
  });

  it("paginates instead of returning the whole thread (spec 14 D7)", async () => {
    const extras = await Promise.all(
      Array.from({ length: 3 }, (_, i) => createTestUser(`fbulk${i}`, "STUDENT")),
    );
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
      await request(app)
        .put(`/api/v1/assignments/${assignmentId}/forum/response`)
        .set("authorization", `Bearer ${token}`)
        .send({ text: OWN_TEXT });
    }
    await request(app)
      .put(`/api/v1/assignments/${assignmentId}/forum/response`)
      .set("authorization", `Bearer ${studentAToken}`)
      .send({ text: OWN_TEXT });

    const page1 = await request(app)
      .get(`/api/v1/assignments/${assignmentId}/forum?limit=2`)
      .set("authorization", `Bearer ${studentAToken}`);
    expect(page1.body.data.posts).toHaveLength(2);
    expect(page1.body.data.nextCursor).toEqual(expect.any(String));

    const page2 = await request(app)
      .get(`/api/v1/assignments/${assignmentId}/forum?limit=2&cursor=${page1.body.data.nextCursor}`)
      .set("authorization", `Bearer ${studentAToken}`);
    expect(page2.body.data.posts).toHaveLength(1);
    expect(page2.body.data.nextCursor).toBeNull();
  });
});

describe("the generic submission routes refuse a FORUM assignment", () => {
  it("PUT /submissions/by-assignment/:id → 409 use_forum_endpoint, and no row", async () => {
    const res = await request(app)
      .put(`/api/v1/submissions/by-assignment/${assignmentId}`)
      .set("authorization", `Bearer ${studentAToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("use_forum_endpoint");
    expect(await db.submission.count({ where: { assignmentId, studentUserId: studentAId } })).toBe(
      0,
    );
  });

  it("PATCH /submissions/:publicId → 409 for save and for submit, text untouched", async () => {
    // A row can exist (posted through the forum PUT, or written by v1).
    const posted = await request(app)
      .put(`/api/v1/assignments/${assignmentId}/forum/response`)
      .set("authorization", `Bearer ${studentAToken}`)
      .send({ text: OWN_TEXT });
    const publicId = posted.body.data.submissionPublicId as string;

    for (const body of [{ text: "<b>x</b>" }, { text: "", submit: true }]) {
      const res = await request(app)
        .patch(`/api/v1/submissions/${publicId}`)
        .set("authorization", `Bearer ${studentAToken}`)
        .send(body);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("use_forum_endpoint");
    }
    const row = await db.submission.findUnique({
      where: { publicId },
      select: { text: true },
    });
    expect(row?.text).toBe(`<p>${OWN_TEXT}</p>`);
  });

  it("still serves a STANDARD assignment as before", async () => {
    const standard = await db.assignment.create({
      data: { seasonId, title: "space-v2-test-standard-ok", type: "STANDARD", isAllGroups: true },
      select: { id: true },
    });
    const res = await request(app)
      .put(`/api/v1/submissions/by-assignment/${standard.id}`)
      .set("authorization", `Bearer ${studentAToken}`);
    expect(res.status).toBe(200);
  });
});

describe("forum comments", () => {
  const COMMENT = "space-v2-test comment body";

  async function postFor(token: string): Promise<string> {
    const res = await request(app)
      .put(`/api/v1/assignments/${assignmentId}/forum/response`)
      .set("authorization", `Bearer ${token}`)
      .send({ text: OWN_TEXT });
    return res.body.data.submissionPublicId as string;
  }

  it("lets a group-mate who has posted comment on a peer's response", async () => {
    const peerPost = await postFor(studentA2Token);
    await postFor(studentAToken);

    const res = await request(app)
      .post(`/api/v1/assignments/${assignmentId}/forum/posts/${peerPost}/comments`)
      .set("authorization", `Bearer ${studentAToken}`)
      .send({ body: COMMENT });

    expect(res.status).toBe(201);
    expect(res.body.data.comment).toMatchObject({ body: COMMENT, canDelete: true });
    expect(res.body.data.comment.authorDisplayName).not.toContain("@");
  });

  it("refuses a commenter who has not posted their own response first (v1 R41)", async () => {
    const peerPost = await postFor(studentA2Token);

    const res = await request(app)
      .post(`/api/v1/assignments/${assignmentId}/forum/posts/${peerPost}/comments`)
      .set("authorization", `Bearer ${studentAToken}`)
      .send({ body: COMMENT });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("post_first");
  });

  it("refuses a student from another group", async () => {
    const peerPost = await postFor(studentA2Token);
    await postFor(studentBToken);

    const res = await request(app)
      .post(`/api/v1/assignments/${assignmentId}/forum/posts/${peerPost}/comments`)
      .set("authorization", `Bearer ${studentBToken}`)
      .send({ body: COMMENT });
    expect(res.status).toBe(403);
  });

  it("lets the group's leader comment without posting anything (spec 14 D3)", async () => {
    // In v1 LEADER falls through to `return false` — a leader cannot join the
    // discussion of a group they lead. That is a missing `if`, not a policy.
    const peerPost = await postFor(studentAToken);

    const res = await request(app)
      .post(`/api/v1/assignments/${assignmentId}/forum/posts/${peerPost}/comments`)
      .set("authorization", `Bearer ${leaderAToken}`)
      .send({ body: COMMENT });
    expect(res.status).toBe(201);
  });

  it("refuses a mentor, who stays read-only", async () => {
    const peerPost = await postFor(studentAToken);
    const res = await request(app)
      .post(`/api/v1/assignments/${assignmentId}/forum/posts/${peerPost}/comments`)
      .set("authorization", `Bearer ${mentorToken}`)
      .send({ body: COMMENT });
    expect(res.status).toBe(403);
  });

  it("refuses a post that belongs to a different assignment (spec 14 D14)", async () => {
    const other = await db.assignment.create({
      data: {
        seasonId,
        title: "space-v2-test-forum-other",
        type: "FORUM",
        forumMinWords: 0,
        forumAllowComments: true,
        isAllGroups: true,
      },
      select: { id: true },
    });
    const peerPost = await postFor(studentA2Token);
    await postFor(studentAToken);

    const res = await request(app)
      .post(`/api/v1/assignments/${other.id}/forum/posts/${peerPost}/comments`)
      .set("authorization", `Bearer ${studentAToken}`)
      .send({ body: COMMENT });
    expect(res.status).toBe(404);
  });

  it("refuses an empty or over-long body", async () => {
    const peerPost = await postFor(studentA2Token);
    await postFor(studentAToken);

    for (const body of ["   ", "x".repeat(5001)]) {
      const res = await request(app)
        .post(`/api/v1/assignments/${assignmentId}/forum/posts/${peerPost}/comments`)
        .set("authorization", `Bearer ${studentAToken}`)
        .send({ body });
      expect(res.status).toBe(400);
    }
  });

  it("paginates a long comment list and reports the count on the post", async () => {
    const peerPost = await postFor(studentA2Token);
    await postFor(studentAToken);

    for (let i = 0; i < 5; i += 1) {
      await request(app)
        .post(`/api/v1/assignments/${assignmentId}/forum/posts/${peerPost}/comments`)
        .set("authorization", `Bearer ${studentAToken}`)
        .send({ body: `${COMMENT} ${i}` });
    }

    const feed = await request(app)
      .get(`/api/v1/assignments/${assignmentId}/forum`)
      .set("authorization", `Bearer ${studentAToken}`);
    // Three inline plus a count — v1 returns every comment on every post.
    expect(feed.body.data.posts[0].commentCount).toBe(5);
    expect(feed.body.data.posts[0].comments).toHaveLength(3);

    const page = await request(app)
      .get(`/api/v1/assignments/${assignmentId}/forum/posts/${peerPost}/comments?limit=2`)
      .set("authorization", `Bearer ${studentAToken}`);
    expect(page.body.data.comments).toHaveLength(2);
    expect(page.body.data.nextCursor).toEqual(expect.any(Number));
  });

  it("lets staff delete a comment they did not write — and tells the client so", async () => {
    // v1's server allows SUPER and the season ADMIN to delete (R49), but the
    // control renders only for the viewer's own comments and no staff screen
    // shows a thread at all, so that power has never been exercisable (R52/R53).
    const peerPost = await postFor(studentA2Token);
    await postFor(studentAToken);
    const created = await request(app)
      .post(`/api/v1/assignments/${assignmentId}/forum/posts/${peerPost}/comments`)
      .set("authorization", `Bearer ${studentAToken}`)
      .send({ body: COMMENT });
    const commentId = created.body.data.comment.id as number;

    const asLeader = await request(app)
      .get(`/api/v1/assignments/${assignmentId}/forum`)
      .set("authorization", `Bearer ${leaderAToken}`);
    const seen = asLeader.body.data.posts
      .flatMap((p: { comments: { id: number; canDelete: boolean }[] }) => p.comments)
      .find((c: { id: number }) => c.id === commentId);
    expect(seen.canDelete).toBe(true);

    const res = await request(app)
      .delete(`/api/v1/forum/comments/${commentId}`)
      .set("authorization", `Bearer ${leaderAToken}`);
    expect(res.status).toBe(200);
    expect(await db.forumComment.count({ where: { id: commentId } })).toBe(0);
  });

  it("refuses deletion by the post's author and by an unrelated leader", async () => {
    const peerPost = await postFor(studentA2Token);
    await postFor(studentAToken);
    const created = await request(app)
      .post(`/api/v1/assignments/${assignmentId}/forum/posts/${peerPost}/comments`)
      .set("authorization", `Bearer ${studentAToken}`)
      .send({ body: COMMENT });
    const commentId = created.body.data.comment.id as number;

    for (const token of [studentA2Token, leaderBToken]) {
      const res = await request(app)
        .delete(`/api/v1/forum/comments/${commentId}`)
        .set("authorization", `Bearer ${token}`);
      expect(res.status).toBe(403);
    }
    expect(await db.forumComment.count({ where: { id: commentId } })).toBe(1);
  });

  it("does not serve another group's comments, nor a draft's, nor before posting", async () => {
    const peerPost = await postFor(studentA2Token);
    await postFor(studentBToken);
    const url = `/api/v1/assignments/${assignmentId}/forum/posts/${peerPost}/comments`;

    const otherGroup = await request(app).get(url).set("authorization", `Bearer ${studentBToken}`);
    expect(otherGroup.status).toBe(403);

    const notPosted = await request(app).get(url).set("authorization", `Bearer ${studentAToken}`);
    expect(notPosted.status).toBe(403);
    expect(notPosted.body.error.code).toBe("post_first");

    const wrongLeader = await request(app).get(url).set("authorization", `Bearer ${leaderBToken}`);
    expect(wrongLeader.status).toBe(403);
  });

  it("404s an unknown comment", async () => {
    const res = await request(app)
      .delete("/api/v1/forum/comments/987654321")
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});
