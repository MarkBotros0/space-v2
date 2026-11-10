// apps/backend/src/__tests__/integration/forum-comments-routes.test.ts
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { addForumComment } from "../../lib/assignments/forum";
import { createForum, forumPath, OWN_TEXT, resetSubmissions, seedForumFixtures } from "./forum-setup";
import { cleanupTestData } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let assignmentId: number;
let partId: number;
let essayPartId: number;
let base: string;
let studentAId: number;
let studentAToken: string;
let studentA2Token: string;
let studentBToken: string;
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
    studentAId,
    studentAToken,
    studentA2Token,
    studentBToken,
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

describe("the essay routes never reach a forum post", () => {
  it("an essay save on the forum part is 404, and makes no row", async () => {
    const res = await request(app)
      .put(`/api/v1/assignments/${assignmentId}/parts/${partId}/essay`)
      .set("authorization", `Bearer ${studentAToken}`)
      .send({ text: "<b>x</b>" });
    expect(res.status).toBe(404);
    expect(await db.assignmentPartWork.count({ where: { partId, studentUserId: studentAId } })).toBe(0);
  });

  it("the essay read, hand-in and review answer 404 for a forum post, text untouched", async () => {
    const posted = await request(app)
      .put(`${base}/response`)
      .set("authorization", `Bearer ${studentAToken}`)
      .send({ text: OWN_TEXT });
    const publicId = posted.body.data.publicId as string;

    const read = await request(app).get(`/api/v1/submissions/${publicId}`).set("authorization", `Bearer ${adminToken}`);
    expect(read.status).toBe(404);
    const handIn = await request(app)
      .post(`/api/v1/submissions/${publicId}/hand-in`)
      .set("authorization", `Bearer ${studentAToken}`);
    expect(handIn.status).toBe(404);
    const review = await request(app)
      .post(`/api/v1/submissions/${publicId}/review`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ action: "return", feedback: "space-v2-test redo" });
    expect(review.status).toBe(404);

    const row = await db.assignmentPartWork.findUnique({ where: { publicId }, select: { text: true, status: true } });
    expect(row).toEqual({ text: `<p>${OWN_TEXT}</p>`, status: "SUBMITTED" });
  });

  it("the essay part beside the forum still takes its draft", async () => {
    const res = await request(app)
      .put(`/api/v1/assignments/${assignmentId}/parts/${essayPartId}/essay`)
      .set("authorization", `Bearer ${studentAToken}`)
      .send({ text: "space-v2-test essay draft" });
    expect(res.status).toBe(200);
  });
});

describe("forum comments", () => {
  const COMMENT = "space-v2-test comment body";

  async function postFor(token: string): Promise<string> {
    const res = await request(app)
      .put(`${base}/response`)
      .set("authorization", `Bearer ${token}`)
      .send({ text: OWN_TEXT });
    return res.body.data.publicId as string;
  }

  it("lets a group-mate who has posted comment on a peer's response", async () => {
    const peerPost = await postFor(studentA2Token);
    await postFor(studentAToken);

    const res = await request(app)
      .post(`${base}/posts/${peerPost}/comments`)
      .set("authorization", `Bearer ${studentAToken}`)
      .send({ body: COMMENT });

    expect(res.status).toBe(201);
    expect(res.body.data.comment).toMatchObject({ body: COMMENT, canDelete: true });
    expect(res.body.data.comment.authorDisplayName).not.toContain("@");
  });

  it("refuses a commenter who has not posted their own response first (v1 R41)", async () => {
    const peerPost = await postFor(studentA2Token);

    const res = await request(app)
      .post(`${base}/posts/${peerPost}/comments`)
      .set("authorization", `Bearer ${studentAToken}`)
      .send({ body: COMMENT });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("post_first");
  });

  it("refuses a student from another group", async () => {
    const peerPost = await postFor(studentA2Token);
    await postFor(studentBToken);

    const res = await request(app)
      .post(`${base}/posts/${peerPost}/comments`)
      .set("authorization", `Bearer ${studentBToken}`)
      .send({ body: COMMENT });
    expect(res.status).toBe(403);
  });

  it("lets the group's leader comment without posting anything (spec 14 D3)", async () => {
    // In v1 LEADER falls through to `return false` — a leader cannot join the
    // discussion of a group they lead. That is a missing `if`, not a policy.
    const peerPost = await postFor(studentAToken);

    const res = await request(app)
      .post(`${base}/posts/${peerPost}/comments`)
      .set("authorization", `Bearer ${leaderAToken}`)
      .send({ body: COMMENT });
    expect(res.status).toBe(201);
  });

  it("refuses a mentor, who stays read-only", async () => {
    const peerPost = await postFor(studentAToken);
    const res = await request(app)
      .post(`${base}/posts/${peerPost}/comments`)
      .set("authorization", `Bearer ${mentorToken}`)
      .send({ body: COMMENT });
    expect(res.status).toBe(403);
  });

  it("refuses a post that belongs to a different assignment (spec 14 D14)", async () => {
    const other = await createForum(seasonId, "space-v2-test-forum-other");
    const peerPost = await postFor(studentA2Token);
    await postFor(studentAToken);

    const res = await request(app)
      .post(`${forumPath(other)}/posts/${peerPost}/comments`)
      .set("authorization", `Bearer ${studentAToken}`)
      .send({ body: COMMENT });
    expect(res.status).toBe(404);
  });

  it("refuses an empty or over-long body", async () => {
    const peerPost = await postFor(studentA2Token);
    await postFor(studentAToken);

    for (const body of ["   ", "x".repeat(5001)]) {
      const res = await request(app)
        .post(`${base}/posts/${peerPost}/comments`)
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
        .post(`${base}/posts/${peerPost}/comments`)
        .set("authorization", `Bearer ${studentAToken}`)
        .send({ body: `${COMMENT} ${i}` });
    }

    const feed = await request(app).get(base).set("authorization", `Bearer ${studentAToken}`);
    // Three inline plus a count — v1 returns every comment on every post.
    expect(feed.body.data.posts[0].commentCount).toBe(5);
    expect(feed.body.data.posts[0].comments).toHaveLength(3);

    const page = await request(app)
      .get(`${base}/posts/${peerPost}/comments?limit=2`)
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
      .post(`${base}/posts/${peerPost}/comments`)
      .set("authorization", `Bearer ${studentAToken}`)
      .send({ body: COMMENT });
    const commentId = created.body.data.comment.id as number;

    const asLeader = await request(app).get(base).set("authorization", `Bearer ${leaderAToken}`);
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
      .post(`${base}/posts/${peerPost}/comments`)
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

  it("shows canDelete exactly when DELETE would succeed, for every role (BE-071 parity)", async () => {
    const peerPost = await postFor(studentA2Token);
    await postFor(studentAToken);
    const roles: [string, string][] = [
      ["comment author", studentAToken],
      ["post author", studentA2Token],
      ["own group's leader", leaderAToken],
      ["other group's leader", leaderBToken],
      ["season admin", adminToken],
      ["mentor", mentorToken],
    ];
    for (const [label, token] of roles) {
      const created = await request(app)
        .post(`${base}/posts/${peerPost}/comments`)
        .set("authorization", `Bearer ${studentAToken}`)
        .send({ body: COMMENT });
      const commentId = created.body.data.comment.id as number;

      const feed = await request(app).get(base).set("authorization", `Bearer ${token}`);
      const inFeed = (feed.body.data?.posts ?? [])
        .flatMap((p: { comments: { id: number; canDelete: boolean }[] }) => p.comments)
        .find((c: { id: number }) => c.id === commentId);
      const list = await request(app).get(`${base}/posts/${peerPost}/comments`).set("authorization", `Bearer ${token}`);
      const inList = (list.body.data?.comments ?? []).find((c: { id: number }) => c.id === commentId);
      // A reader who can't see the comment is shown no control at all.
      const shown = inList?.canDelete ?? false;
      if (inFeed) expect([label, inFeed.canDelete]).toEqual([label, shown]);

      const res = await request(app)
        .delete(`/api/v1/forum/comments/${commentId}`)
        .set("authorization", `Bearer ${token}`);
      expect([label, res.status]).toEqual([label, shown ? 200 : 403]);
      await db.forumComment.deleteMany({ where: { id: commentId } });
    }
  });

  it("does not serve another group's comments, nor a draft's, nor before posting", async () => {
    const peerPost = await postFor(studentA2Token);
    await postFor(studentBToken);
    const url = `${base}/posts/${peerPost}/comments`;

    const otherGroup = await request(app).get(url).set("authorization", `Bearer ${studentBToken}`);
    expect(otherGroup.status).toBe(403);

    const notPosted = await request(app).get(url).set("authorization", `Bearer ${studentAToken}`);
    expect(notPosted.status).toBe(403);
    expect(notPosted.body.error.code).toBe("post_first");

    const wrongLeader = await request(app).get(url).set("authorization", `Bearer ${leaderBToken}`);
    expect(wrongLeader.status).toBe(403);
  });

  it("a part removed before the comment lands answers 404, not 500", async () => {
    const gone = await createForum(seasonId, "space-v2-test-forum-gone");
    const posted = await request(app)
      .put(`${forumPath(gone)}/response`)
      .set("authorization", `Bearer ${studentA2Token}`)
      .send({ text: OWN_TEXT });
    const work = await db.assignmentPartWork.findUniqueOrThrow({
      where: { publicId: posted.body.data.publicId as string },
      select: { id: true },
    });
    await db.assignmentPart.delete({ where: { id: gone.partId } });
    await expect(addForumComment(gone.partId, work.id, studentAId, COMMENT)).rejects.toMatchObject({ status: 404 });
  });

  it("404s an unknown comment", async () => {
    const res = await request(app)
      .delete("/api/v1/forum/comments/987654321")
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});
