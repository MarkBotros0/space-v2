// apps/backend/src/__tests__/integration/events-routes.test.ts
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import {
  cleanupTestData,
  createTestSeason,
  createTestUser,
  login,
  testEventTitle,
} from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let allEventId: number;
let alumniEventId: number;
let seasonEventId: number;
let otherSeasonEventId: number;
let studentToken: string;
let alumnusToken: string;
let leaderToken: string;
let adminToken: string;
let mentorToken: string;
let superToken: string;

beforeAll(async () => {
  await cleanupTestData();

  const season = await createTestSeason();
  const otherSeason = await createTestSeason();
  seasonId = season.id;

  const student = await createTestUser("evstudent", "STUDENT");
  const alumnus = await createTestUser("evalumnus", "STUDENT");
  const leader = await createTestUser("evleader", "LEADER");
  const admin = await createTestUser("evadmin", "ADMIN");
  const mentor = await createTestUser("evmentor", "MENTOR");
  const superUser = await createTestUser("evsuper", "SUPER");

  // An alumnus is role STUDENT with a graduationYear — the whole of spec 15's
  // headline defect turns on that. `graduationYear` is a column on User
  // (schema.prisma:111), not on StudentProfile, and login reads it from there
  // into the token's `graduationYear` claim.
  await db.user.update({ where: { id: alumnus.id }, data: { graduationYear: 2098 } });
  await db.studentProfile.create({
    data: { userId: alumnus.id, activeSeasonId: seasonId },
  });
  await db.studentProfile.create({
    data: { userId: student.id, activeSeasonId: seasonId },
  });

  const group = await db.group.create({
    data: { seasonId, name: "Group A", leaders: { create: { userId: leader.id } } },
    select: { id: true },
  });
  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  await db.seasonEnrollment.createMany({
    data: [
      { seasonId, studentUserId: student.id, groupId: group.id, status: "ACTIVE" },
      { seasonId, studentUserId: alumnus.id, groupId: group.id, status: "COMPLETED" },
    ],
  });

  const events = await db.$transaction([
    db.jpcEvent.create({
      data: {
        title: testEventTitle("all"),
        date: new Date("2099-06-01T00:00:00.000Z"),
        visibility: "ALL",
      },
      select: { id: true },
    }),
    db.jpcEvent.create({
      data: {
        title: testEventTitle("alumni"),
        date: new Date("2099-06-02T00:00:00.000Z"),
        visibility: "ALUMNI_ONLY",
      },
      select: { id: true },
    }),
    db.jpcEvent.create({
      data: {
        title: testEventTitle("season"),
        date: new Date("2099-06-03T00:00:00.000Z"),
        visibility: "SEASON",
        seasonId,
      },
      select: { id: true },
    }),
    db.jpcEvent.create({
      data: {
        title: testEventTitle("otherseason"),
        date: new Date("2099-06-04T00:00:00.000Z"),
        visibility: "SEASON",
        seasonId: otherSeason.id,
      },
      select: { id: true },
    }),
  ]);
  allEventId = events[0].id;
  alumniEventId = events[1].id;
  seasonEventId = events[2].id;
  otherSeasonEventId = events[3].id;

  studentToken = await login(app, student.email);
  alumnusToken = await login(app, alumnus.email);
  leaderToken = await login(app, leader.email);
  adminToken = await login(app, admin.email);
  mentorToken = await login(app, mentor.email);
  superToken = await login(app, superUser.email);
});

afterAll(async () => {
  await cleanupTestData();
});

const WINDOW = "?from=2099-01-01T00:00:00.000Z&to=2099-12-31T00:00:00.000Z";

async function idsFor(token: string): Promise<number[]> {
  const res = await request(app)
    .get(`/api/v1/events${WINDOW}`)
    .set("authorization", `Bearer ${token}`);
  expect(res.status).toBe(200);
  return (res.body.data.events as { id: number }[]).map((e) => e.id);
}

describe("GET /api/v1/events — visibility derived from the token", () => {
  it("shows ALL events to everyone", async () => {
    for (const token of [studentToken, alumnusToken, leaderToken, adminToken, mentorToken]) {
      expect(await idsFor(token)).toContain(allEventId);
    }
  });

  it("shows ALUMNI_ONLY events TO ALUMNI (spec 15 item 2 — the headline defect)", async () => {
    // In shipped v1, UpcomingEventsCard computes eligibility as
    // `user.role !== "STUDENT"` and an alumnus IS role STUDENT, so ALUMNI_ONLY
    // means staff-only on the only two surfaces alumni have.
    expect(await idsFor(alumnusToken)).toContain(alumniEventId);
    expect(await idsFor(leaderToken)).toContain(alumniEventId);
    expect(await idsFor(adminToken)).toContain(alumniEventId);
    // Still hidden from a current student, which is what the level means.
    expect(await idsFor(studentToken)).not.toContain(alumniEventId);
  });

  it("scopes SEASON events to the seasons a viewer holds", async () => {
    expect(await idsFor(studentToken)).toContain(seasonEventId);
    expect(await idsFor(studentToken)).not.toContain(otherSeasonEventId);
    expect(await idsFor(leaderToken)).toContain(seasonEventId);
    expect(await idsFor(adminToken)).toContain(seasonEventId);
    // A mentor holds none of the three claims, so sees no SEASON event —
    // v1's behaviour, kept: jpc-space/src/lib/jpc-events-query.ts:24-37
    // (`viewerSeasonIds` adds only activeSeasonId, seasonAdminIds and the
    // seasons of groupLeaderIds; a MENTOR token carries none). Spec 15 R51,
    // spec 19 R7. Spec 19 D19 recommends widening this; the coordinator ruled
    // v1 parity for this plan — a widening is a product decision, not a port.
    expect(await idsFor(mentorToken)).not.toContain(seasonEventId);
    // SUPER sees everything.
    expect(await idsFor(superToken)).toEqual(
      expect.arrayContaining([allEventId, alumniEventId, seasonEventId, otherSeasonEventId]),
    );
  });

  it("hides events on a soft-deleted season (spec 15 item 4)", async () => {
    await db.season.update({ where: { id: seasonId }, data: { deletedAt: new Date() } });
    expect(await idsFor(studentToken)).not.toContain(seasonEventId);
    await db.season.update({ where: { id: seasonId }, data: { deletedAt: null } });
  });

  it("hides an orphaned SEASON event from everyone but SUPER (spec 15 R54)", async () => {
    const orphan = await db.jpcEvent.create({
      data: {
        title: testEventTitle("orphan"),
        date: new Date("2099-06-05T00:00:00.000Z"),
        visibility: "SEASON",
        seasonId: null,
      },
      select: { id: true },
    });
    expect(await idsFor(studentToken)).not.toContain(orphan.id);
    expect(await idsFor(adminToken)).not.toContain(orphan.id);
    expect(await idsFor(superToken)).toContain(orphan.id);
  });

  it("cannot be widened by a query parameter", async () => {
    const res = await request(app)
      .get(`/api/v1/events${WINDOW}&visibility=ALUMNI_ONLY&includeAlumniOnly=true`)
      .set("authorization", `Bearer ${studentToken}`);
    expect((res.body.data.events as { id: number }[]).map((e) => e.id)).not.toContain(
      alumniEventId,
    );
  });

  it("windows on (endDate ?? date), so a multi-day event in progress stays (item 5)", async () => {
    const retreat = await db.jpcEvent.create({
      data: {
        title: testEventTitle("retreat"),
        date: new Date("2099-07-01T00:00:00.000Z"),
        endDate: new Date("2099-07-05T00:00:00.000Z"),
        visibility: "ALL",
      },
      select: { id: true },
    });
    // A window starting after the retreat began but before it ended.
    const res = await request(app)
      .get("/api/v1/events?from=2099-07-03T00:00:00.000Z&to=2099-07-10T00:00:00.000Z")
      .set("authorization", `Bearer ${studentToken}`);
    expect((res.body.data.events as { id: number }[]).map((e) => e.id)).toContain(retreat.id);
  });

  it("upcoming=true starts at today's org midnight and limit caps events, not total", async () => {
    // Spec 19 §7 / D19: the dashboards' UpcomingEventsCard. Three ALL events
    // dated far in the future plus one that ended in 2000.
    const future = await Promise.all(
      [1, 2, 3].map((n) =>
        db.jpcEvent.create({
          data: {
            title: testEventTitle(`upcoming${n}`),
            // Inside the default upper bound (now + 365d) so the window keeps them.
            date: new Date(Date.now() + n * 24 * 3600 * 1000),
            visibility: "ALL",
          },
          select: { id: true },
        }),
      ),
    );
    const past = await db.jpcEvent.create({
      data: {
        title: testEventTitle("past"),
        date: new Date("2000-01-01T10:00:00.000Z"),
        visibility: "ALL",
      },
      select: { id: true },
    });

    const res = await request(app)
      .get("/api/v1/events?upcoming=true&limit=2")
      .set("authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    const ids = (res.body.data.events as { id: number }[]).map((e) => e.id);
    expect(ids).toHaveLength(2);
    expect(ids).not.toContain(past.id);
    // The uncapped read is the reference: the cap keeps its first two (date
    // ascending), and `total` is its length. Other visible staging rows may
    // exist, so the test compares against this read rather than fixed ids.
    const full = await request(app)
      .get("/api/v1/events?upcoming=true")
      .set("authorization", `Bearer ${studentToken}`);
    const fullIds = (full.body.data.events as { id: number }[]).map((e) => e.id);
    expect(fullIds).toEqual(expect.arrayContaining(future.map((e) => e.id)));
    expect(fullIds).not.toContain(past.id);
    expect(ids).toEqual(fullIds.slice(0, 2));
    expect(res.body.data.total).toBe(fullIds.length);
    expect(full.body.data.total).toBe(fullIds.length);
  });

  it("refuses upcoming together with from, and a limit outside 1–20", async () => {
    for (const qs of [
      "?upcoming=true&from=2099-01-01T00:00:00.000Z",
      "?limit=0",
      "?limit=21",
    ]) {
      const res = await request(app)
        .get(`/api/v1/events${qs}`)
        .set("authorization", `Bearer ${studentToken}`);
      expect(res.status).toBe(400);
    }
  });

  it("derives allDay, dayKey and time server-side, in the org zone", async () => {
    const midnight = await db.jpcEvent.create({
      data: {
        title: testEventTitle("orgmidnight"),
        // 00:00 on 2099-01-20 in Africa/Cairo (UTC+2 in January).
        date: new Date("2099-01-19T22:00:00.000Z"),
        visibility: "ALL",
      },
      select: { id: true },
    });
    const res = await request(app)
      .get(`/api/v1/events${WINDOW}`)
      .set("authorization", `Bearer ${superToken}`);
    type Row = { id: number; allDay: boolean; dayKey: string; time: string | null };
    const rows = res.body.data.events as Row[];

    // 00:00Z is not org midnight — NOT all-day, and its org time is shown.
    const utcMidnight = rows.find((e) => e.id === allEventId);
    expect(utcMidnight?.allDay).toBe(false);
    expect(utcMidnight?.dayKey).toBe("2099-06-01");
    expect(utcMidnight?.time).not.toBeNull();

    // Org midnight IS all-day, and its day is the org day — the 20th, although
    // the stored instant is on the 19th in UTC. A client bucketing by its own
    // zone would put this on the wrong day; this field is why it never has to.
    const orgMidnight = rows.find((e) => e.id === midnight.id);
    expect(orgMidnight).toMatchObject({ allDay: true, dayKey: "2099-01-20", time: null });
  });
});

describe("GET /api/v1/events/:id", () => {
  it("serves the detail v1 has no page for", async () => {
    const res = await request(app)
      .get(`/api/v1/events/${allEventId}`)
      .set("authorization", `Bearer ${studentToken}`);
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
    expect(res.body.data).toMatchObject({ allDay: true, dayKey: "2099-01-20", time: null });
    // Africa/Cairo midnight on 2099-01-20 is 22:00Z on the 19th (UTC+2).
    expect(res.body.data.date).toBe("2099-01-19T22:00:00.000Z");
    // v1 returns only { success: true } and the client refetches (R39).
    expect(res.body.data.id).toEqual(expect.any(Number));
  });

  it("composes a timed event in the org zone, not the caller's", async () => {
    // The request carries no zone at all — the server's org zone is the only
    // one that can apply, so a SUPER travelling abroad cannot shift the event.
    const res = await request(app)
      .post("/api/v1/events")
      .set("authorization", `Bearer ${superToken}`)
      .send({ ...body, title: `space-v2-test-timed-${Date.now()}`, time: "18:30" });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ allDay: false, dayKey: "2099-01-20", time: "18:30" });
    expect(res.body.data.date).toBe("2099-01-20T16:30:00.000Z");
  });

  it("refuses create, update and delete to an ADMIN", async () => {
    const create = await request(app)
      .post("/api/v1/events")
      .set("authorization", `Bearer ${adminToken}`)
      .send(body);
    expect(create.status).toBe(403);

    const patch = await request(app)
      .patch(`/api/v1/events/${allEventId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ title: "space-v2-test-renamed" });
    expect(patch.status).toBe(403);

    const del = await request(app)
      .delete(`/api/v1/events/${allEventId}`)
      .set("authorization", `Bearer ${adminToken}`);
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
    const del = await request(app)
      .delete("/api/v1/events/987654321")
      .set("authorization", `Bearer ${superToken}`);
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
    const res = await request(app)
      .delete(`/api/v1/events/${doomed.id}`)
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ deleted: true });
    expect(await db.jpcEvent.count({ where: { id: doomed.id } })).toBe(0);
  });
});
