// apps/backend/src/__tests__/integration/announcements-read.test.ts
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import {
  ANNOUNCEMENT_PAGE_SIZE,
  announcementDetailSchema,
  announcementPageResponseSchema,
  announcementUnreadResponseSchema,
} from "../../../../../packages/shared/src/index";
import { insertPost, seedNewsFixtures, type NewsFixtures } from "./announcements-setup";
import { TEST_PREFIX, cleanupTestData, testUserFilter } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();
let f: NewsFixtures;
const extraPosts: number[] = [];

beforeAll(async () => {
  f = await seedNewsFixtures(app);
});

afterEach(async () => {
  // Only marks on test posts or by test users: no other row can match.
  await db.announcementRead.deleteMany({
    where: {
      OR: [{ announcement: { title: { startsWith: TEST_PREFIX } } }, { user: testUserFilter }],
    },
  });
  if (extraPosts.length > 0) {
    await db.announcement.deleteMany({ where: { id: { in: extraPosts.splice(0) } } });
  }
});

afterAll(async () => {
  await cleanupTestData();
});

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

interface Item {
  id: number;
  isRead: boolean;
}

async function feed(token: string): Promise<Item[]> {
  const res = await request(app).get("/api/v1/announcements").set(auth(token));
  expect(res.status).toBe(200);
  return res.body.data.items as Item[];
}

async function feedIds(token: string): Promise<number[]> {
  return (await feed(token)).map((i) => i.id).sort((a, b) => a - b);
}

async function unreadCount(token: string): Promise<number> {
  const res = await request(app).get("/api/v1/announcements/unread").set(auth(token));
  expect(res.status).toBe(200);
  return res.body.data.count as number;
}

async function detailStatus(token: string, id: number): Promise<number> {
  const res = await request(app).get(`/api/v1/announcements/${id}`).set(auth(token));
  return res.status;
}

const sorted = (...ids: number[]) => ids.sort((a, b) => a - b);

it("student reads community and own season, not other season", async () => {
  expect(await feedIds(f.tokens.student)).toEqual(sorted(f.communityId, f.liveId));
  expect(await unreadCount(f.tokens.student)).toBe(2);
  expect(await detailStatus(f.tokens.student, f.liveId)).toBe(200);
  expect(await detailStatus(f.tokens.student, f.otherId)).toBe(404);
});

it("responses parse against the shared contracts", async () => {
  const page = await request(app).get("/api/v1/announcements").set(auth(f.tokens.student));
  expect(announcementPageResponseSchema.safeParse(page.body.data).success).toBe(true);
  const unread = await request(app).get("/api/v1/announcements/unread").set(auth(f.tokens.student));
  expect(announcementUnreadResponseSchema.safeParse(unread.body.data).success).toBe(true);
  const detail = await request(app).get(`/api/v1/announcements/${f.liveId}`).set(auth(f.tokens.superUser));
  const parsed = announcementDetailSchema.parse(detail.body.data);
  expect(parsed).toMatchObject({ canEdit: true, canDelete: true, seasonFinished: false });
  const old = await request(app).get(`/api/v1/announcements/${f.finishedId}`).set(auth(f.tokens.superUser));
  expect(old.body.data).toMatchObject({ canEdit: false, canDelete: true, seasonFinished: true });
});

it("dropped student no longer reads the season", async () => {
  expect(await feedIds(f.tokens.dropped)).toEqual([f.communityId]);
  expect(await unreadCount(f.tokens.dropped)).toBe(1);
  expect(await detailStatus(f.tokens.dropped, f.liveId)).toBe(404);
});

it("finished student keeps reading the finished season", async () => {
  expect(await feedIds(f.tokens.finishedStudent)).toEqual(sorted(f.communityId, f.finishedId));
  expect(await detailStatus(f.tokens.finishedStudent, f.finishedId)).toBe(200);
  // Not live in it, so it is readable but never "New".
  expect(await unreadCount(f.tokens.finishedStudent)).toBe(1);
  const item = (await feed(f.tokens.finishedStudent)).find((i) => i.id === f.finishedId);
  expect(item?.isRead).toBe(true);
});

it("former admin of a finished season is cut off", async () => {
  expect(await feedIds(f.tokens.formerAdmin)).toEqual([f.communityId]);
  expect(await detailStatus(f.tokens.formerAdmin, f.finishedId)).toBe(404);
});

it("studying alumnus reads the community-wide season's posts", async () => {
  expect(await feedIds(f.tokens.alumnus)).toEqual(sorted(f.communityId, f.liveId));
  expect(await unreadCount(f.tokens.alumnus)).toBe(2);
  expect(await detailStatus(f.tokens.alumnus, f.liveId)).toBe(200);
});

it("leader and admin read their season", async () => {
  for (const token of [f.tokens.leader, f.tokens.admin]) {
    expect(await feedIds(token)).toEqual(sorted(f.communityId, f.liveId));
    expect(await unreadCount(token)).toBe(2);
    expect(await detailStatus(token, f.otherId)).toBe(404);
  }
});

it("mentor reads community only", async () => {
  expect(await feedIds(f.tokens.mentor)).toEqual([f.communityId]);
  expect(await unreadCount(f.tokens.mentor)).toBe(1);
  expect(await detailStatus(f.tokens.mentor, f.liveId)).toBe(404);
});

it("super reads everything but only community posts are unread", async () => {
  // The Super authored all four, so take a second Super-less view: a post by
  // nobody (author deleted) keeps the case about audience, not authorship.
  const orphan = await insertPost({ audience: "COMMUNITY", authorId: null });
  const seasonOrphan = await insertPost({ audience: "SEASON", seasonId: f.seasonId, authorId: null });
  extraPosts.push(orphan, seasonOrphan);

  const items = await feed(f.tokens.superUser);
  expect(items.map((i) => i.id).sort((a, b) => a - b)).toEqual(
    sorted(f.communityId, f.liveId, f.finishedId, f.otherId, orphan, seasonOrphan),
  );
  const res = await request(app).get("/api/v1/announcements/unread").set(auth(f.tokens.superUser));
  expect(res.body.data.count).toBe(1); // the orphan community post only
  expect(res.body.data.latest.id).toBe(orphan);
  for (const id of [f.liveId, f.finishedId, f.otherId, seasonOrphan]) {
    expect(items.find((i) => i.id === id)?.isRead).toBe(true);
  }
  expect(items.find((i) => i.id === orphan)?.isRead).toBe(false);
});

it("author's own post is never unread", async () => {
  const mine = await insertPost({ audience: "SEASON", seasonId: f.seasonId, authorId: f.userIds.admin });
  extraPosts.push(mine);
  expect(await unreadCount(f.tokens.admin)).toBe(2);
  expect(await unreadCount(f.tokens.student)).toBe(3);
  const item = (await feed(f.tokens.admin)).find((i) => i.id === mine);
  expect(item?.isRead).toBe(true);
});

it("post older than 30 days or the account is not unread", async () => {
  const day = 24 * 60 * 60 * 1000;
  const old = await insertPost({ audience: "COMMUNITY", createdAt: new Date(Date.now() - 31 * day) });
  const beforeAccount = await insertPost({ audience: "COMMUNITY", createdAt: new Date(Date.now() - day) });
  extraPosts.push(old, beforeAccount);
  const items = await feed(f.tokens.student);
  expect(items.map((i) => i.id)).toEqual(expect.arrayContaining([old, beforeAccount]));
  expect(items.find((i) => i.id === old)?.isRead).toBe(true);
  expect(items.find((i) => i.id === beforeAccount)?.isRead).toBe(true);
  expect(await unreadCount(f.tokens.student)).toBe(2);
});

it("POST /:id/read is idempotent and clears unread", async () => {
  const before = await unreadCount(f.tokens.student);
  for (let i = 0; i < 2; i++) {
    const res = await request(app).post(`/api/v1/announcements/${f.communityId}/read`).set(auth(f.tokens.student));
    expect(res.status).toBe(204);
    expect(res.text).toBe("");
  }
  expect(await unreadCount(f.tokens.student)).toBe(before - 1);
  const res = await request(app).get(`/api/v1/announcements/${f.communityId}`).set(auth(f.tokens.student));
  expect(res.body.data.isRead).toBe(true);
  // A post the caller may not read can't be marked.
  const hidden = await request(app).post(`/api/v1/announcements/${f.otherId}/read`).set(auth(f.tokens.student));
  expect(hidden.status).toBe(404);
});

it("GET /:id of a missing id is 404 not_found", async () => {
  const res = await request(app).get("/api/v1/announcements/999999999").set(auth(f.tokens.student));
  expect(res.status).toBe(404);
  expect(res.body.error.code).toBe("not_found");
});

it("feed pages with nextCursor", async () => {
  const ids: number[] = [];
  for (let i = 0; i < ANNOUNCEMENT_PAGE_SIZE + 1; i++) {
    ids.push(await insertPost({ audience: "COMMUNITY", authorId: f.userIds.superUser }));
  }
  extraPosts.push(...ids);
  const first = await request(app).get("/api/v1/announcements").set(auth(f.tokens.student));
  expect(first.body.data.items).toHaveLength(ANNOUNCEMENT_PAGE_SIZE);
  expect(first.body.data.nextCursor).toEqual(expect.any(String));
  const second = await request(app)
    .get("/api/v1/announcements")
    .query({ cursor: first.body.data.nextCursor })
    .set(auth(f.tokens.student));
  expect(second.status).toBe(200);
  const all = [...first.body.data.items, ...second.body.data.items].map((i: Item) => i.id);
  expect(new Set(all).size).toBe(all.length);
  expect(all).toHaveLength(2 + ANNOUNCEMENT_PAGE_SIZE + 1);
  expect(second.body.data.nextCursor).toBeNull();
  const bad = await request(app).get("/api/v1/announcements").query({ cursor: "zzz" }).set(auth(f.tokens.student));
  expect(bad.status).toBe(400);
});

it("a non-numeric id is 400 in the error envelope", async () => {
  const get = await request(app).get("/api/v1/announcements/abc").set(auth(f.tokens.student));
  expect(get.status).toBe(400);
  expect(get.body.error.code).toBe("bad_request");
  const post = await request(app).post("/api/v1/announcements/abc/read").set(auth(f.tokens.student));
  expect(post.status).toBe(400);
  expect(post.body.error.code).toBe("bad_request");
});

it("cursor tie-break: posts sharing one createdAt page with no duplicate or gap", async () => {
  const sameInstant = new Date(Date.now() - 60 * 60 * 1000);
  const ids: number[] = [];
  for (let i = 0; i < ANNOUNCEMENT_PAGE_SIZE + 5; i++) {
    ids.push(await insertPost({ audience: "COMMUNITY", authorId: f.userIds.superUser, createdAt: sameInstant }));
  }
  extraPosts.push(...ids);

  const seen: number[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const res: request.Response = await request(app)
      .get("/api/v1/announcements")
      .query(cursor ? { cursor } : {})
      .set(auth(f.tokens.student));
    expect(res.status).toBe(200);
    seen.push(...res.body.data.items.map((i: Item) => i.id));
    cursor = res.body.data.nextCursor;
    pages += 1;
  } while (cursor && pages < 10);

  expect(pages).toBeGreaterThanOrEqual(2);
  expect(new Set(seen).size).toBe(seen.length);
  expect([...seen].sort((a, b) => a - b)).toEqual(
    [...ids, f.communityId, f.liveId].sort((a, b) => a - b),
  );
  // Ties break on id descending.
  const tied = seen.filter((id) => ids.includes(id));
  expect(tied).toEqual([...ids].sort((a, b) => b - a));
});
