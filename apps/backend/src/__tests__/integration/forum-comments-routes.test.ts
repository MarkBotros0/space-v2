// apps/backend/src/__tests__/integration/forum-comments-routes.test.ts
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { OWN_TEXT, resetSubmissions, seedForumFixtures } from "./forum-setup";
import { cleanupTestData } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let assignmentId: number;
let studentAId: number;
let studentAToken: string;
let studentA2Token: string;
let studentBToken: string;
let leaderAToken: string;
let leaderBToken: string;
let adminToken: string;
let mentorToken: string;

beforeAll(async () => {
  ({ seasonId, assignmentId, studentAId, studentAToken, studentA2Token, studentBToken, leaderAToken, leaderBToken, adminToken, mentorToken } = await seedForumFixtures(app));
});

beforeEach(() => resetSubmissions(seasonId));

afterAll(async () => {
  await cleanupTestData();
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
