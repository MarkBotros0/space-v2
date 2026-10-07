import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestUser, login } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

let aliceId: number;
let bobId: number;
let aliceToken: string;

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
    expect(res.body.data.nextCursor).toBeNull();
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

  it("pages by cursor, newest first", async () => {
    await seedFor(aliceId, 5);

    const first = await request(app)
      .get("/api/v1/notifications?limit=2")
      .set("authorization", `Bearer ${aliceToken}`);
    expect(first.body.data.items).toHaveLength(2);
    expect(first.body.data.nextCursor).toBe(first.body.data.items[1].id);

    const second = await request(app)
      .get(`/api/v1/notifications?limit=2&cursor=${first.body.data.nextCursor}`)
      .set("authorization", `Bearer ${aliceToken}`);
    expect(second.body.data.items).toHaveLength(2);
    // Descending by id, and the cursor row itself is skipped.
    expect(second.body.data.items[0].id).toBeLessThan(first.body.data.items[1].id);

    const ids = [...first.body.data.items, ...second.body.data.items].map(
      (i: { id: number }) => i.id,
    );
    expect(new Set(ids).size).toBe(4);
  });

  it("filters to unread when asked", async () => {
    await seedFor(aliceId, 2);
    const rows = await db.notification.findMany({ where: { userId: aliceId }, select: { id: true } });
    await db.notification.update({
      where: { id: rows[0]!.id },
      data: { readAt: new Date() },
    });

    const res = await request(app)
      .get("/api/v1/notifications?unreadOnly=true")
      .set("authorization", `Bearer ${aliceToken}`);

    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.unreadCount).toBe(1);
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
  it("marks the given ids and reports the count", async () => {
    await seedFor(aliceId, 3);
    const rows = await db.notification.findMany({ where: { userId: aliceId }, select: { id: true } });

    const res = await request(app)
      .post("/api/v1/notifications/read")
      .set("authorization", `Bearer ${aliceToken}`)
      .send({ ids: [rows[0]!.id] });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ marked: 1 });
    expect(await db.notification.count({ where: { userId: aliceId, readAt: null } })).toBe(2);
  });

  it("is idempotent — a repeat marks zero and never re-stamps readAt (R44)", async () => {
    await seedFor(aliceId, 1);
    const row = (await db.notification.findFirst({ where: { userId: aliceId } }))!;

    await request(app)
      .post("/api/v1/notifications/read")
      .set("authorization", `Bearer ${aliceToken}`)
      .send({ ids: [row.id] });
    const firstStamp = (await db.notification.findUnique({ where: { id: row.id } }))!.readAt;

    const repeat = await request(app)
      .post("/api/v1/notifications/read")
      .set("authorization", `Bearer ${aliceToken}`)
      .send({ ids: [row.id] });

    expect(repeat.body.data).toEqual({ marked: 0 });
    expect((await db.notification.findUnique({ where: { id: row.id } }))!.readAt).toEqual(firstStamp);
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

  it("CANNOT mark another user's notification, even with its real id (ruling C8, R43)", async () => {
    await seedFor(bobId, 1);
    const bobRow = (await db.notification.findFirst({ where: { userId: bobId } }))!;

    const res = await request(app)
      .post("/api/v1/notifications/read")
      .set("authorization", `Bearer ${aliceToken}`)
      .send({ ids: [bobRow.id] });

    // The id is accepted as input and updates nothing — the userId clause in
    // the `where` is the only thing standing between this and a cross-user
    // write. Do not "simplify" it away.
    expect(res.body.data).toEqual({ marked: 0 });
    expect((await db.notification.findUnique({ where: { id: bobRow.id } }))!.readAt).toBeNull();
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
      .send({ ids: [1], userId: bobId });
    expect(spoofed.status).toBe(400);
  });
});
