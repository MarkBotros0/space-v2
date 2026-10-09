import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestUser, login } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

let aliceId: number;
let bobId: number;
let aliceToken: string;
let bobToken: string;

async function seedFor(userId: number, count: number, link = "/student/assignments/41") {
  await db.notification.createMany({
    data: Array.from({ length: count }, (_, i) => ({
      userId,
      type: "SUBMISSION_REVIEWED" as const,
      title: `space-v2-test notification ${i}`,
      body: null,
      link,
    })),
  });
}

beforeAll(async () => {
  await cleanupTestData();

  const alice = await createTestUser("alice", "STUDENT");
  const bob = await createTestUser("bob", "STUDENT");
  aliceId = alice.id;
  bobId = bob.id;
  aliceToken = await login(app, alice.email);
  bobToken = await login(app, bob.email);
});

afterEach(async () => {
  await db.notification.deleteMany({ where: { userId: { in: [aliceId, bobId] } } });
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("GET /api/v1/notifications", () => {
  it("returns the caller's own rows with the parsed target and a real unread count", async () => {
    await seedFor(aliceId, 3);

    const res = await request(app)
      .get("/api/v1/notifications")
      .set("authorization", `Bearer ${aliceToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(3);
    expect(res.body.data.unreadCount).toBe(3);
    // v1's list has no paging (R33, R39).
    expect(res.body.data).not.toHaveProperty("nextCursor");
    // D1: the client never sees a bare v1 path it has to parse.
    expect(res.body.data.items[0].target).toEqual({ entityType: "assignment", entityId: 41 });
    expect(res.body.data.items[0].readAt).toBeNull();
  });

  it("NEVER returns another user's rows (ruling C8)", async () => {
    await seedFor(bobId, 2);

    const res = await request(app)
      .get("/api/v1/notifications")
      .set("authorization", `Bearer ${aliceToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([]);
    expect(res.body.data.unreadCount).toBe(0);
  });

  it("DOES NOT mark anything read (ruling C6)", async () => {
    await seedFor(aliceId, 2);

    // Twice, because React Query refetches on mount, on focus and on
    // reconnect — under v1's mark-on-render this is where the writes pile up.
    await request(app).get("/api/v1/notifications").set("authorization", `Bearer ${aliceToken}`);
    const second = await request(app)
      .get("/api/v1/notifications")
      .set("authorization", `Bearer ${aliceToken}`);

    expect(second.body.data.unreadCount).toBe(2);
    const unread = await db.notification.count({ where: { userId: aliceId, readAt: null } });
    expect(unread).toBe(2);
  });

  it("returns v1's newest 100 in one list, createdAt desc, no cursor (R33, R39)", async () => {
    const base = Date.now() - 1_000_000;
    await db.notification.createMany({
      data: Array.from({ length: 101 }, (_, i) => ({
        userId: aliceId,
        type: "SUBMISSION_REVIEWED" as const,
        title: `space-v2-test notification ${i}`,
        body: null,
        link: "/student/assignments/41",
        createdAt: new Date(base + i * 1000),
      })),
    });

    const res = await request(app)
      .get("/api/v1/notifications?limit=2&unreadOnly=true")
      .set("authorization", `Bearer ${aliceToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(100);
    expect(res.body.data).not.toHaveProperty("nextCursor");
    // Newest first; the oldest (index 0) falls off.
    expect(res.body.data.items[0].title).toBe("space-v2-test notification 100");
    expect(res.body.data.items[99].title).toBe("space-v2-test notification 1");
    // The count is real, not a filter over the 100 (R37).
    expect(res.body.data.unreadCount).toBe(101);
  });

  it("refuses an anonymous caller", async () => {
    const res = await request(app).get("/api/v1/notifications");
    expect(res.status).toBe(401);
  });
});

describe("GET /api/v1/notifications/unread-count", () => {
  it("counts only the caller's unread rows", async () => {
    await seedFor(aliceId, 2);
    await seedFor(bobId, 5);

    const res = await request(app)
      .get("/api/v1/notifications/unread-count")
      .set("authorization", `Bearer ${aliceToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ unreadCount: 2 });
  });
});

describe("POST /api/v1/notifications/read", () => {
  it("refuses the ids form — v1 has mark-all only (R47)", async () => {
    await seedFor(aliceId, 3);
    const rows = await db.notification.findMany({ where: { userId: aliceId }, select: { id: true } });

    const res = await request(app)
      .post("/api/v1/notifications/read")
      .set("authorization", `Bearer ${aliceToken}`)
      .send({ ids: [rows[0]!.id] });

    expect(res.status).toBe(400);
    expect(await db.notification.count({ where: { userId: aliceId, readAt: null } })).toBe(3);
  });

  it("marks everything with all: true", async () => {
    await seedFor(aliceId, 4);

    const res = await request(app)
      .post("/api/v1/notifications/read")
      .set("authorization", `Bearer ${aliceToken}`)
      .send({ all: true });

    expect(res.body.data).toEqual({ marked: 4 });
    expect(await db.notification.count({ where: { userId: aliceId, readAt: null } })).toBe(0);
  });

  it("is idempotent — a repeat marks zero and never re-stamps readAt (R44)", async () => {
    await seedFor(aliceId, 1);
    const row = (await db.notification.findFirst({ where: { userId: aliceId } }))!;

    await request(app)
      .post("/api/v1/notifications/read")
      .set("authorization", `Bearer ${aliceToken}`)
      .send({ all: true });
    const firstStamp = (await db.notification.findUnique({ where: { id: row.id } }))!.readAt;
    expect(firstStamp).not.toBeNull();

    const repeat = await request(app)
      .post("/api/v1/notifications/read")
      .set("authorization", `Bearer ${aliceToken}`)
      .send({ all: true });

    expect(repeat.body.data).toEqual({ marked: 0 });
    expect((await db.notification.findUnique({ where: { id: row.id } }))!.readAt).toEqual(firstStamp);
  });

  it("CANNOT mark another user's notifications (ruling C8, R43)", async () => {
    await seedFor(aliceId, 2);

    const res = await request(app)
      .post("/api/v1/notifications/read")
      .set("authorization", `Bearer ${bobToken}`)
      .send({ all: true });

    // The userId clause in the `where` is the only thing standing between
    // this and a cross-user write. Do not "simplify" it away.
    expect(res.body.data).toEqual({ marked: 0 });
    expect(await db.notification.count({ where: { userId: aliceId, readAt: null } })).toBe(2);
  });

  it("refuses a body carrying both arms, or a userId", async () => {
    const both = await request(app)
      .post("/api/v1/notifications/read")
      .set("authorization", `Bearer ${aliceToken}`)
      .send({ ids: [1], all: true });
    expect(both.status).toBe(400);

    const spoofed = await request(app)
      .post("/api/v1/notifications/read")
      .set("authorization", `Bearer ${aliceToken}`)
      .send({ all: true, userId: bobId });
    expect(spoofed.status).toBe(400);
  });
});
