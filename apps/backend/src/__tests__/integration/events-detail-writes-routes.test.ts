// apps/backend/src/__tests__/integration/events-detail-writes-routes.test.ts
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { seedEventFixtures } from "./events-setup";
import { cleanupTestData, testEventTitle } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let allEventId: number;
let alumniEventId: number;
let studentToken: string;
let adminToken: string;
let superToken: string;

beforeAll(async () => {
  ({ seasonId, allEventId, alumniEventId, studentToken, adminToken, superToken } = await seedEventFixtures(app));
});

afterAll(async () => {
  await cleanupTestData();
});

describe("GET /api/v1/events/:id", () => {
  it("serves the detail v1 has no page for", async () => {
    const res = await request(app).get(`/api/v1/events/${allEventId}`).set("authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: allEventId, canManage: false });
    expect(res.body.data).toHaveProperty("description");
  });

  it("applies the same visibility predicate to the row", async () => {
    const res = await request(app)
      .get(`/api/v1/events/${alumniEventId}`)
      .set("authorization", `Bearer ${studentToken}`);
    // Not 403: a current student must not be able to tell an event they may not
    // see from one that does not exist.
    expect(res.status).toBe(404);
  });
});

describe("event writes are SUPER-only (spec 15 R1/R3)", () => {
  const body = {
    title: "space-v2-test-created",
    day: "2099-01-20",
    time: null,
    endDay: null,
    description: "space-v2-test description",
    url: null,
    visibility: "ALL" as const,
    seasonId: null,
  };

  it("creates an all-day event at org midnight", async () => {
    const res = await request(app)
      .post("/api/v1/events")
      .set("authorization", `Bearer ${superToken}`)
      .send({ ...body, title: `space-v2-test-${Date.now()}` });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ allDay: true, dayKey: "2099-01-20", time: null, isPast: false });
    // Africa/Cairo midnight on 2099-01-20 is 22:00Z on the 19th (UTC+2).
    expect(res.body.data.date).toBe("2099-01-19T22:00:00.000Z");
    // v1 returns only { success: true } and the client refetches (R39).
    expect(res.body.data.id).toEqual(expect.any(Number));
  });

  it("flags a past event isPast on create and on the detail read", async () => {
    const res = await request(app)
      .post("/api/v1/events")
      .set("authorization", `Bearer ${superToken}`)
      .send({ ...body, title: `space-v2-test-past-${Date.now()}`, day: "2001-01-20" });
    expect(res.status).toBe(201);
    expect(res.body.data.isPast).toBe(true);
    const read = await request(app)
      .get(`/api/v1/events/${res.body.data.id}`)
      .set("authorization", `Bearer ${superToken}`);
    expect(read.body.data.isPast).toBe(true);
  });

  it("composes a timed event in the org zone, not the caller's", async () => {
    // The request carries no zone at all — the server's org zone is the only
    // one that can apply, so a SUPER travelling abroad cannot shift the event.
    const res = await request(app)
      .post("/api/v1/events")
      .set("authorization", `Bearer ${superToken}`)
      .send({ ...body, title: `space-v2-test-timed-${Date.now()}`, time: "18:30" });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ allDay: false, dayKey: "2099-01-20", time: "18:30", isPast: false });
    expect(res.body.data.date).toBe("2099-01-20T16:30:00.000Z");
  });

  it("refuses create, update and delete to an ADMIN", async () => {
    const create = await request(app).post("/api/v1/events").set("authorization", `Bearer ${adminToken}`).send(body);
    expect(create.status).toBe(403);

    const patch = await request(app)
      .patch(`/api/v1/events/${allEventId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ title: "space-v2-test-renamed" });
    expect(patch.status).toBe(403);

    const del = await request(app).delete(`/api/v1/events/${allEventId}`).set("authorization", `Bearer ${adminToken}`);
    expect(del.status).toBe(403);
  });

  it("accepts a partial update and re-refines against the merged row", async () => {
    const target = await db.jpcEvent.create({
      data: {
        title: testEventTitle("patchable"),
        // 18:30 on 2099-01-21, org time.
        date: new Date("2099-01-21T16:30:00.000Z"),
        visibility: "ALL",
      },
      select: { id: true },
    });

    // v1 reuses the create schema for update, so a partial is impossible.
    const ok = await request(app)
      .patch(`/api/v1/events/${target.id}`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ description: "space-v2-test-updated" });
    expect(ok.status).toBe(200);
    expect(ok.body.data.title).toContain("space-v2-test-");
    // An untouched day/time survives the merge exactly.
    expect(ok.body.data.date).toBe("2099-01-21T16:30:00.000Z");

    // Changing only the time keeps the stored org day.
    const retimed = await request(app)
      .patch(`/api/v1/events/${target.id}`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ time: "09:00" });
    expect(retimed.body.data).toMatchObject({ dayKey: "2099-01-21", time: "09:00" });

    // An end day before the stored start day is refused against the merge.
    const backwards = await request(app)
      .patch(`/api/v1/events/${target.id}`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ endDay: "2099-01-01" });
    expect(backwards.status).toBe(400);

    // SEASON without a season, where the season would have to come from the
    // stored row — and does not.
    const bad = await request(app)
      .patch(`/api/v1/events/${target.id}`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ visibility: "SEASON" });
    expect(bad.status).toBe(400);
  });

  it("detaches the season when visibility leaves SEASON (v1 R13)", async () => {
    const target = await db.jpcEvent.create({
      data: {
        title: testEventTitle("detach"),
        date: new Date("2099-09-02T00:00:00.000Z"),
        visibility: "SEASON",
        seasonId,
      },
      select: { id: true },
    });
    await request(app)
      .patch(`/api/v1/events/${target.id}`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ visibility: "ALL" });

    const row = await db.jpcEvent.findUnique({
      where: { id: target.id },
      select: { seasonId: true },
    });
    expect(row?.seasonId).toBeNull();
  });

  it("404s a stale id instead of throwing a raw Prisma error (spec 15 item 11)", async () => {
    // v1's delete does not read the row first, so P2025 reaches the client as
    // an unhandled server-action error (R36).
    const del = await request(app).delete("/api/v1/events/987654321").set("authorization", `Bearer ${superToken}`);
    expect(del.status).toBe(404);
    expect(del.body.error.code).toBe("not_found");
  });

  it("deletes for real — there is no soft delete on this model", async () => {
    const doomed = await db.jpcEvent.create({
      data: {
        title: testEventTitle("doomed"),
        date: new Date("2099-09-03T00:00:00.000Z"),
        visibility: "ALL",
      },
      select: { id: true },
    });
    const res = await request(app).delete(`/api/v1/events/${doomed.id}`).set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ deleted: true });
    expect(await db.jpcEvent.count({ where: { id: doomed.id } })).toBe(0);
  });
});
