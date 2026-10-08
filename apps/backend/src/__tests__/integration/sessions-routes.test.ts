import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { config } from "../../lib/config";
import { formatInOrgTime } from "../../lib/org-time";
import { newPublicId } from "../../lib/public-id";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

// 60s, not the Jest default: the shared Neon staging database autosuspends, so
// the first query after idle costs ~18s and this suite's beforeAll performs
// several sequential writes.
jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let sessionId: number;
let superToken: string;
let adminToken: string;
let studentToken: string;
let outsiderToken: string;
let studentUserId: number;
// checkInToken is @unique on Session; generating it rather than hard-coding
// a literal avoids a collision with a leftover row from an interrupted
// previous run.
let checkInToken: string;

beforeAll(async () => {
  await cleanupTestData();

  const season = await createTestSeason();
  seasonId = season.id;

  const superUser = await createTestUser("super", "SUPER");
  const adminUser = await createTestUser("admin", "ADMIN");
  const student = await createTestUser("student", "STUDENT");
  const outsider = await createTestUser("outsider", "STUDENT");
  studentUserId = student.id;

  await db.seasonAdmin.create({ data: { seasonId, userId: adminUser.id } });
  await db.seasonEnrollment.create({
    data: { seasonId, studentUserId: student.id, status: "ACTIVE" },
  });

  checkInToken = newPublicId();
  const session = await db.session.create({
    data: {
      seasonId,
      title: "Session One",
      description: "A test session",
      startsAt: new Date("2099-03-01T18:00:00.000Z"),
      durationMinutes: 90,
      location: "Hall",
      checkInToken,
    },
    select: { id: true },
  });
  sessionId = session.id;

  superToken = await login(app, superUser.email);
  adminToken = await login(app, adminUser.email);
  studentToken = await login(app, student.email);
  outsiderToken = await login(app, outsider.email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("GET /api/v1/seasons/:id/sessions", () => {
  it("includes the check-in token for a season admin", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/sessions`)
      .set("authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.sessions).toHaveLength(1);
    expect(res.body.data.sessions[0]).toMatchObject({
      id: sessionId,
      title: "Session One",
      durationMinutes: 90,
      location: "Hall",
      attendanceMarked: false,
      seasonId,
      checkInToken,
    });
  });

  it("withholds the check-in token from a student", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/sessions`)
      .set("authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.sessions).toHaveLength(1);
    expect(res.body.data.sessions[0].checkInToken).toBeNull();
    // Belt and braces: the value must not appear anywhere in the payload.
    expect(JSON.stringify(res.body)).not.toContain(checkInToken);
  });

  it("returns 403 for a user with no access to the season", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/sessions`)
      .set("authorization", `Bearer ${outsiderToken}`);
    expect(res.status).toBe(403);
  });

  it("keys each session to its org-calendar day (ruling X13)", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/sessions`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    // The fixture session starts 2099-03-01T18:00Z — 20:00 in Cairo.
    expect(res.body.data.sessions[0].dayKey).toBe("2099-03-01");
  });
});

describe("GET /api/v1/sessions/:id", () => {
  it("returns detail with canMarkAttendance true for a season admin", async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}`)
      .set("authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: sessionId,
      title: "Session One",
      description: "A test session",
      durationMinutes: 90,
      location: "Hall",
      seasonId,
      checkInOpen: false,
      myAttendance: null,
      canMarkAttendance: true,
    });
    expect(res.body.data).not.toHaveProperty("checkInToken");
    expect(JSON.stringify(res.body)).not.toContain(checkInToken);
  });

  it("returns canMarkAttendance false and myAttendance for a student", async () => {
    await db.attendance.create({
      data: { sessionId, studentUserId, status: "PRESENT", markedById: studentUserId },
    });

    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}`)
      .set("authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.canMarkAttendance).toBe(false);
    expect(res.body.data.myAttendance).toMatchObject({
      status: "PRESENT",
      notes: null,
      lateMinutes: null,
    });
  });

  it("returns 404 for a student with no enrolment (REG-77, v1 behaviour)", async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}`)
      .set("authorization", `Bearer ${outsiderToken}`);
    expect(res.status).toBe(404);
  });

  it("returns 404 for a student whose enrolment is not ACTIVE (REG-77)", async () => {
    const dropped = await createTestUser("dropped", "STUDENT");
    await db.seasonEnrollment.create({
      data: { seasonId, studentUserId: dropped.id, status: "WITHDRAWN" },
    });
    const droppedToken = await login(app, dropped.email);
    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}`)
      .set("authorization", `Bearer ${droppedToken}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });

  it("returns 403 for a non-student with no access to the season", async () => {
    const stranger = await createTestUser("stranger-admin", "ADMIN");
    const strangerToken = await login(app, stranger.email);
    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}`)
      .set("authorization", `Bearer ${strangerToken}`);
    expect(res.status).toBe(403);
  });

  it("returns 400 for a non-numeric id and 404 for a missing one", async () => {
    const bad = await request(app)
      .get("/api/v1/sessions/abc")
      .set("authorization", `Bearer ${superToken}`);
    expect(bad.status).toBe(400);

    const missing = await request(app)
      .get("/api/v1/sessions/2147483000")
      .set("authorization", `Bearer ${superToken}`);
    expect(missing.status).toBe(404);
  });
});

describe("POST /api/v1/sessions", () => {
  it("creates a weekly series sharing one recurrence id, one calendar week apart", async () => {
    const res = await request(app)
      .post("/api/v1/sessions")
      .set("authorization", `Bearer ${adminToken}`)
      .send({
        seasonId, title: "Weekly session", startsAt: "2099-03-01T18:00:00.000Z",
        durationMinutes: 90, repeatWeeks: 3,
      });

    expect(res.status).toBe(201);
    expect(typeof res.body.data.recurrenceGroupId).toBe("string");
    const rows = await db.session.findMany({
      where: { recurrenceGroupId: res.body.data.recurrenceGroupId },
      orderBy: { startsAt: "asc" },
      select: { id: true, startsAt: true, seasonId: true },
    });
    expect(rows.map((r) => r.startsAt.toISOString())).toEqual([
      "2099-03-01T18:00:00.000Z", "2099-03-08T18:00:00.000Z", "2099-03-15T18:00:00.000Z",
    ]);
    expect(rows.every((r) => r.seasonId === seasonId)).toBe(true);
    expect(res.body.data.id).toBe(rows[0]?.id);
  });

  it("keeps the org wall-clock time across a DST change (C2, X13)", async () => {
    // Precondition, stated so a non-default .env fails readably.
    expect(config.orgTimezone).toBe("Africa/Cairo");
    // Cairo moves UTC+2 → UTC+3 on 2099-04-24. v1's host-zone addDays would
    // keep the UTC instant on a UTC server and drift the class to 21:00.
    const res = await request(app)
      .post("/api/v1/sessions")
      .set("authorization", `Bearer ${adminToken}`)
      .send({
        seasonId, title: "Spring series", startsAt: "2099-04-17T18:00:00.000Z",
        durationMinutes: 60, repeatWeeks: 3,
      });

    expect(res.status).toBe(201);
    const rows = await db.session.findMany({
      where: { recurrenceGroupId: res.body.data.recurrenceGroupId },
      orderBy: { startsAt: "asc" },
      select: { startsAt: true },
    });
    expect(rows.map((r) => r.startsAt.toISOString())).toEqual([
      "2099-04-17T18:00:00.000Z", "2099-04-24T17:00:00.000Z", "2099-05-01T17:00:00.000Z",
    ]);
  });

  it("creates a single session with a null recurrence id", async () => {
    const res = await request(app)
      .post("/api/v1/sessions")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ seasonId, title: "One-off", startsAt: "2099-04-01T18:00:00.000Z", durationMinutes: 60 });
    expect(res.status).toBe(201);
    expect(res.body.data.recurrenceGroupId).toBeNull();
  });

  it("refuses a non-admin of the season", async () => {
    const res = await request(app)
      .post("/api/v1/sessions")
      .set("authorization", `Bearer ${studentToken}`)
      .send({ seasonId, title: "Nope", startsAt: "2099-04-01T18:00:00.000Z", durationMinutes: 60 });
    expect(res.status).toBe(403);
  });

  it("404s a soft-deleted season (v1 never checked)", async () => {
    const dead = await createTestSeason();
    await db.season.update({ where: { id: dead.id }, data: { deletedAt: new Date() } });
    const res = await request(app)
      .post("/api/v1/sessions")
      .set("authorization", `Bearer ${superToken}`)
      .send({ seasonId: dead.id, title: "Ghost", startsAt: "2099-04-01T18:00:00.000Z", durationMinutes: 60 });
    expect(res.status).toBe(404);
  });
});

type SeriesRow = { id: number; startsAt: Date };

/** A 3-session weekly series via the real endpoint (Task 4), in creation order. */
async function createSeries(startsAt: string, title: string): Promise<[SeriesRow, SeriesRow, SeriesRow]> {
  const res = await request(app)
    .post("/api/v1/sessions")
    .set("authorization", `Bearer ${adminToken}`)
    .send({ seasonId, title, startsAt, durationMinutes: 60, repeatWeeks: 3 });
  expect(res.status).toBe(201);
  const [a, b, c] = await db.session.findMany({
    where: { recurrenceGroupId: res.body.data.recurrenceGroupId },
    orderBy: { id: "asc" },
    select: { id: true, startsAt: true },
  });
  if (!a || !b || !c) throw new Error("series fixture did not create three sessions");
  return [a, b, c];
}

const HOUR = 3_600_000;

describe("PATCH /api/v1/sessions/:id", () => {
  it("edits one occurrence without touching its siblings", async () => {
    const [a, b, c] = await createSeries("2099-06-05T18:00:00.000Z", "Series one");
    const res = await request(app)
      .patch(`/api/v1/sessions/${b.id}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ title: "Moved", startsAt: new Date(b.startsAt.getTime() + HOUR).toISOString(),
        durationMinutes: 60, scope: "one" });
    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(1);

    const rows = await db.session.findMany({
      where: { id: { in: [a.id, b.id, c.id] } },
      orderBy: { id: "asc" },
      select: { title: true, startsAt: true },
    });
    expect(rows.map((r) => r.title)).toEqual(["Series one", "Moved", "Series one"]);
    expect(rows[0]?.startsAt.getTime()).toBe(a.startsAt.getTime());
    expect(rows[1]?.startsAt.getTime()).toBe(b.startsAt.getTime() + HOUR);
    expect(rows[2]?.startsAt.getTime()).toBe(c.startsAt.getTime());
  });

  it("shifts this-and-following by the same delta", async () => {
    const [a, b, c] = await createSeries("2099-07-03T18:00:00.000Z", "Series two");
    const res = await request(app)
      .patch(`/api/v1/sessions/${b.id}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ title: "Series two", startsAt: new Date(b.startsAt.getTime() + HOUR).toISOString(),
        durationMinutes: 60, scope: "future" });
    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(2);

    const rows = await db.session.findMany({
      where: { id: { in: [a.id, b.id, c.id] } },
      orderBy: { id: "asc" },
      select: { startsAt: true },
    });
    expect(rows.map((r) => r.startsAt.getTime())).toEqual([
      a.startsAt.getTime(), b.startsAt.getTime() + HOUR, c.startsAt.getTime() + HOUR,
    ]);
  });

  it("NEVER touches another season's sessions sharing the recurrence id (ruling C10)", async () => {
    // The live v1 bug: duplication cloned recurrenceGroupId verbatim and the
    // sibling lookup had no season filter, so editing a series in one season
    // rewrote another's. Recreate the corrupted state directly:
    const otherSeason = await createTestSeason();
    const shared = "space-v2-test-xrg";
    const mine = await db.session.create({
      data: { seasonId, title: "Mine", startsAt: new Date("2099-05-01T18:00:00.000Z"),
        durationMinutes: 60, recurrenceGroupId: shared },
      select: { id: true },
    });
    const theirs = await db.session.create({
      data: { seasonId: otherSeason.id, title: "Theirs",
        startsAt: new Date("2099-05-08T18:00:00.000Z"), durationMinutes: 60,
        recurrenceGroupId: shared },
      select: { id: true },
    });

    const res = await request(app)
      .patch(`/api/v1/sessions/${mine.id}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ title: "Renamed", startsAt: "2099-05-01T19:00:00.000Z",
        durationMinutes: 60, scope: "all" });
    expect(res.status).toBe(200);

    const untouched = await db.session.findUnique({
      where: { id: theirs.id }, select: { title: true, startsAt: true },
    });
    expect(untouched?.title).toBe("Theirs");
    expect(untouched?.startsAt.toISOString()).toBe("2099-05-08T18:00:00.000Z");
  });

  it("notifies enrolled students when the start time changes, and not otherwise", async () => {
    const count = () =>
      db.notification.count({ where: { userId: studentUserId, type: "SESSION_RESCHEDULED" } });
    const before = await count();

    // Title only, same start: no notification.
    const same = await request(app)
      .patch(`/api/v1/sessions/${sessionId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ title: "Session One (renamed)", startsAt: "2099-03-01T18:00:00.000Z",
        durationMinutes: 90, scope: "one" });
    expect(same.status).toBe(200);
    expect(await count()).toBe(before);

    // Moved start: exactly one, v1's link, org wall-clock body (C2).
    const moved = await request(app)
      .patch(`/api/v1/sessions/${sessionId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ title: "Session One (renamed)", startsAt: "2099-03-01T19:00:00.000Z",
        durationMinutes: 90, scope: "one" });
    expect(moved.status).toBe(200);
    expect(await count()).toBe(before + 1);
    const latest = await db.notification.findFirst({
      where: { userId: studentUserId, type: "SESSION_RESCHEDULED" },
      orderBy: { id: "desc" },
      select: { title: true, body: true, link: true },
    });
    expect(latest).toEqual({
      title: 'Session "Session One (renamed)" rescheduled',
      body: `New time: ${formatInOrgTime(new Date("2099-03-01T19:00:00.000Z"))}`,
      link: "/student/calendar",
    });
  });

  it("refuses a non-admin of the season", async () => {
    const res = await request(app)
      .patch(`/api/v1/sessions/${sessionId}`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ title: "Nope", startsAt: "2099-03-01T18:00:00.000Z", durationMinutes: 90, scope: "one" });
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/v1/sessions/:id", () => {
  async function oneOff(title: string) {
    return db.session.create({
      data: { seasonId, title, startsAt: new Date("2099-08-01T18:00:00.000Z"), durationMinutes: 60 },
      select: { id: true },
    });
  }

  it("deletes a single session with no student records", async () => {
    const s = await oneOff("Disposable");
    const res = await request(app)
      .delete(`/api/v1/sessions/${s.id}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(1);
    expect(await db.session.findUnique({ where: { id: s.id } })).toBeNull();
  });

  it("scope 'all' deletes only this season's members of a shared series (C10)", async () => {
    const otherSeason = await createTestSeason();
    const shared = "space-v2-test-xrg-del";
    const mine = await db.session.create({
      data: { seasonId, title: "Mine 1", startsAt: new Date("2099-09-01T18:00:00.000Z"),
        durationMinutes: 60, recurrenceGroupId: shared },
      select: { id: true },
    });
    await db.session.create({
      data: { seasonId, title: "Mine 2", startsAt: new Date("2099-09-08T18:00:00.000Z"),
        durationMinutes: 60, recurrenceGroupId: shared },
    });
    const theirs = await db.session.create({
      data: { seasonId: otherSeason.id, title: "Theirs", startsAt: new Date("2099-09-15T18:00:00.000Z"),
        durationMinutes: 60, recurrenceGroupId: shared },
      select: { id: true },
    });

    const res = await request(app)
      .delete(`/api/v1/sessions/${mine.id}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ scope: "all" });
    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(2);
    expect(await db.session.findUnique({ where: { id: theirs.id } })).not.toBeNull();
  });

  it("refuses to destroy recorded attendance without force (409)", async () => {
    const s = await oneOff("Has attendance");
    await db.attendance.create({
      data: { sessionId: s.id, studentUserId, status: "PRESENT", markedById: studentUserId },
    });
    const res = await request(app)
      .delete(`/api/v1/sessions/${s.id}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("has_student_records");
    expect(await db.session.findUnique({ where: { id: s.id } })).not.toBeNull();
  });

  it("refuses to destroy video progress without force (409)", async () => {
    const s = await oneOff("Has progress");
    await db.sessionVideoProgress.create({
      data: { sessionId: s.id, studentUserId, furthestSeconds: 30 },
    });
    const res = await request(app)
      .delete(`/api/v1/sessions/${s.id}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("has_student_records");
  });

  it("with force, deletes the session and its attendance", async () => {
    const s = await oneOff("Forced");
    await db.attendance.create({
      data: { sessionId: s.id, studentUserId, status: "ABSENT", markedById: studentUserId },
    });
    const res = await request(app)
      .delete(`/api/v1/sessions/${s.id}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ force: true });
    expect(res.status).toBe(200);
    expect(await db.attendance.count({ where: { sessionId: s.id } })).toBe(0);
    expect(await db.session.findUnique({ where: { id: s.id } })).toBeNull();
  });

  it("refuses a non-admin of the season", async () => {
    const s = await oneOff("Protected");
    const res = await request(app)
      .delete(`/api/v1/sessions/${s.id}`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({});
    expect(res.status).toBe(403);
  });
});

describe("canManageCheckIn on GET /api/v1/sessions/:id (Plan 4)", () => {
  let leaderToken: string;

  beforeAll(async () => {
    // groupLeaderIds is a token claim loaded at login, so the group must
    // exist before this login.
    const leader = await createTestUser("checkin-leader", "LEADER");
    await db.group.create({
      data: { seasonId, name: "Leader's group", leaders: { create: { userId: leader.id } } },
    });
    leaderToken = await login(app, leader.email);
  });

  it("is true for a season admin — the same gate check-in-open enforces", async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ canMarkAttendance: true, canManageCheckIn: true });
  });

  it("is false for a group leader, who can still mark attendance", async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}`)
      .set("authorization", `Bearer ${leaderToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ canMarkAttendance: true, canManageCheckIn: false });
  });

  it("agrees with the write gate: the leader's open is refused", async () => {
    const res = await request(app)
      .post(`/api/v1/sessions/${sessionId}/check-in-open`)
      .set("authorization", `Bearer ${leaderToken}`);
    expect(res.status).toBe(403);
  });

  it("is false for a student", async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.canManageCheckIn).toBe(false);
  });
});
