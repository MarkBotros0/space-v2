// apps/backend/src/__tests__/integration/forum-post-to-read-routes.test.ts
//
// A forum's "post before reading others" setting (owner, 2026-11-08). On by
// default — the other forum suites cover that locked behaviour — so this suite
// turns it off and checks a student who has not posted reads and replies anyway.
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { OWN_TEXT, resetSubmissions, seedForumFixtures } from "./forum-setup";
import { cleanupTestData } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let assignmentId: number;
let studentAToken: string;
let studentA2Token: string;
let studentBToken: string;
let adminToken: string;

beforeAll(async () => {
  ({ seasonId, assignmentId, studentAToken, studentA2Token, studentBToken, adminToken } =
    await seedForumFixtures(app));
});

beforeEach(() => resetSubmissions(seasonId));

afterAll(async () => {
  await cleanupTestData();
});

async function postFor(token: string): Promise<string> {
  const res = await request(app)
    .put(`/api/v1/assignments/${assignmentId}/forum/response`)
    .set("authorization", `Bearer ${token}`)
    .send({ text: OWN_TEXT });
  return res.body.data.submissionPublicId as string;
}

async function setPostToRead(on: boolean): Promise<void> {
  await db.assignment.update({ where: { id: assignmentId }, data: { forumPostToRead: on } });
}

describe("a forum with post-before-reading turned off", () => {
  beforeEach(() => setPostToRead(false));
  afterAll(() => setPostToRead(true));

  it("shows a student their group's posts before they post", async () => {
    await postFor(studentA2Token);
    await postFor(studentBToken);

    const res = await request(app)
      .get(`/api/v1/assignments/${assignmentId}/forum`)
      .set("authorization", `Bearer ${studentAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.own.posted).toBe(false);
    expect(res.body.data.locked).toBe(false);
    // Group A's post only — never another group's.
    expect(res.body.data.posts).toHaveLength(1);
    expect(res.body.data.posts[0].canComment).toBe(true);
  });

  it("lets a student read and add comments before they post", async () => {
    const peerPost = await postFor(studentA2Token);
    const url = `/api/v1/assignments/${assignmentId}/forum/posts/${peerPost}/comments`;

    const added = await request(app)
      .post(url)
      .set("authorization", `Bearer ${studentAToken}`)
      .send({ body: "space-v2-test comment before posting" });
    expect(added.status).toBe(201);

    const read = await request(app).get(url).set("authorization", `Bearer ${studentAToken}`);
    expect(read.status).toBe(200);
  });

  it("still keeps another group out", async () => {
    const peerPost = await postFor(studentA2Token);
    const res = await request(app)
      .get(`/api/v1/assignments/${assignmentId}/forum/posts/${peerPost}/comments`)
      .set("authorization", `Bearer ${studentBToken}`);
    expect(res.status).toBe(403);
  });
});

describe("the setting through the assignment writes", () => {
  it("defaults to on and round-trips off on a FORUM, and is forced on for STANDARD", async () => {
    const body = { title: "space-v2-test post-to-read", type: "FORUM", isAllGroups: true };
    const created = await request(app)
      .post(`/api/v1/seasons/${seasonId}/assignments`)
      .set("authorization", `Bearer ${adminToken}`)
      .send(body);
    expect(created.status).toBe(201);
    const id = created.body.data.id as number;
    expect((await db.assignment.findUniqueOrThrow({ where: { id } })).forumPostToRead).toBe(true);

    const off = await request(app)
      .patch(`/api/v1/assignments/${id}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ ...body, forumPostToRead: false });
    expect(off.status).toBe(200);
    const detail = await request(app)
      .get(`/api/v1/assignments/${id}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(detail.body.data.forumPostToRead).toBe(false);

    const standard = await request(app)
      .patch(`/api/v1/assignments/${id}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ ...body, type: "STANDARD", forumPostToRead: false });
    expect(standard.status).toBe(200);
    expect((await db.assignment.findUniqueOrThrow({ where: { id } })).forumPostToRead).toBe(true);
  });
});
