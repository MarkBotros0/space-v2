// apps/backend/src/__tests__/integration/events-visibility-routes.test.ts
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
let seasonEventId: number;
let otherSeasonEventId: number;
let studentToken: string;
let alumnusToken: string;
let leaderToken: string;
let adminToken: string;
let mentorToken: string;
let superToken: string;

beforeAll(async () => {
  ({ seasonId, allEventId, alumniEventId, seasonEventId, otherSeasonEventId, studentToken, alumnusToken, leaderToken, adminToken, mentorToken, superToken } = await seedEventFixtures(app));
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
