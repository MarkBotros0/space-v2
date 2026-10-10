import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { config } from "../../lib/config";
import { newPublicId } from "../../lib/public-id";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let draftSeasonId: number;
let otherSeasonId: number;
let sessionId: number; // in seasonId, 2099-03-01T18:00Z (20:00 Cairo)
let draftSessionId: number;
let otherSessionId: number;
let token: string;
let superToken: string;
let adminToken: string;
let leaderToken: string;
let studentToken: string;

const WINDOW = { from: "2099-02-25T00:00:00.000Z", to: "2099-03-10T00:00:00.000Z" };
const ids = (res: request.Response) => res.body.data.sessions.map((s: { id: number }) => s.id);

beforeAll(async () => {
  await cleanupTestData();

  seasonId = (await createTestSeason()).id;
  draftSeasonId = (await createTestSeason({ status: "DRAFT" })).id;
  otherSeasonId = (await createTestSeason()).id;

  const superUser = await createTestUser("super", "SUPER");
  const admin = await createTestUser("admin", "ADMIN");
  const leader = await createTestUser("leader", "LEADER");
  const student = await createTestUser("student", "STUDENT");
  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  await db.group.create({ data: { seasonId, name: "Led", leaders: { create: { userId: leader.id } } } });
  await db.seasonEnrollment.create({ data: { seasonId, studentUserId: student.id, status: "ACTIVE" } });

  token = newPublicId();
  sessionId = (
    await db.session.create({
      data: { seasonId, title: "Main", startsAt: new Date("2099-03-01T18:00:00.000Z"), durationMinutes: 90, checkInToken: token },
      select: { id: true },
    })
  ).id;
  draftSessionId = (
    await db.session.create({
      data: { seasonId: draftSeasonId, title: "Draft", startsAt: new Date("2099-03-02T18:00:00.000Z"), durationMinutes: 60 },
      select: { id: true },
    })
  ).id;
  otherSessionId = (
    await db.session.create({
      data: { seasonId: otherSeasonId, title: "Other", startsAt: new Date("2099-03-03T18:00:00.000Z"), durationMinutes: 60 },
      select: { id: true },
    })
  ).id;

  superToken = await login(app, superUser.email);
  adminToken = await login(app, admin.email);
  leaderToken = await login(app, leader.email);
  studentToken = await login(app, student.email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

it("runs against the Cairo org timezone these expectations assume", () => {
  expect(config.orgTimezone).toBe("Africa/Cairo");
});

describe("org wall clock on session writes and reads (D-16.6)", () => {
  it("composes startDay + startTime in ORG_TIMEZONE, across DST, for every weekly sibling", async () => {
    const res = await request(app)
      .post("/api/v1/sessions")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ seasonId, title: "Summer series", startDay: "2099-07-03", startTime: "19:30", durationMinutes: 60, repeatWeeks: 2 });
    expect(res.status).toBe(201);
    const rows = await db.session.findMany({
      where: { recurrenceGroupId: res.body.data.recurrenceGroupId },
      orderBy: { startsAt: "asc" },
      select: { startsAt: true },
    });
    // 19:30 at UTC+3 (Egyptian summer time) is 16:30Z.
    expect(rows.map((r) => r.startsAt.toISOString())).toEqual([
      "2099-07-03T16:30:00.000Z",
      "2099-07-10T16:30:00.000Z",
    ]);
  });

  it("refuses a body carrying both startsAt and startDay/startTime", async () => {
    const res = await request(app)
      .post("/api/v1/sessions")
      .set("authorization", `Bearer ${adminToken}`)
      .send({
        seasonId, title: "Both", durationMinutes: 60,
        startsAt: "2099-07-03T16:30:00.000Z", startDay: "2099-07-03", startTime: "19:30",
      });
    expect(res.status).toBe(400);
  });

  it("serves dayKey and startTime on the detail and on list rows (X13, C4)", async () => {
    const detail = await request(app)
      .get(`/api/v1/sessions/${sessionId}`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(detail.body.data).toMatchObject({ dayKey: "2099-03-01", startTime: "20:00" });

    const list = await request(app)
      .get(`/api/v1/seasons/${seasonId}/sessions`)
      .set("authorization", `Bearer ${adminToken}`);
    const row = list.body.data.sessions.find((s: { id: number }) => s.id === sessionId);
    expect(row).toMatchObject({ dayKey: "2099-03-01", startTime: "20:00" });
  });
});

describe("GET /api/v1/sessions — windowed, role-scoped (D-16.7, G17)", () => {
  it("gives SUPER every ACTIVE season's sessions in the window, never a DRAFT season's", async () => {
    const res = await request(app)
      .get("/api/v1/sessions")
      .query(WINDOW)
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual(expect.arrayContaining([sessionId, otherSessionId]));
    expect(ids(res)).not.toContain(draftSessionId);
    expect(res.body.data).toMatchObject({ fromDayKey: "2099-02-25", toDayKey: "2099-03-10" });
  });

  it("lets SUPER open one season of any status with seasonId", async () => {
    const res = await request(app)
      .get("/api/v1/sessions")
      .query({ ...WINDOW, seasonId: draftSeasonId })
      .set("authorization", `Bearer ${superToken}`);
    expect(ids(res)).toEqual([draftSessionId]);
  });

  it("scopes ADMIN to their seasons; seasonId never widens", async () => {
    const own = await request(app)
      .get("/api/v1/sessions")
      .query({ ...WINDOW, seasonId })
      .set("authorization", `Bearer ${adminToken}`);
    expect(ids(own)).toEqual([sessionId]);
    expect(own.body.data.sessions[0].checkInToken).toBe(token);

    const all = await request(app).get("/api/v1/sessions").query(WINDOW).set("authorization", `Bearer ${adminToken}`);
    expect(ids(all)).toEqual([sessionId]);

    const foreign = await request(app)
      .get("/api/v1/sessions")
      .query({ ...WINDOW, seasonId: otherSeasonId })
      .set("authorization", `Bearer ${adminToken}`);
    expect(foreign.status).toBe(403);
  });

  it("gives LEADER every led season, and no check-in token (spec 04 §7 narrowing)", async () => {
    const res = await request(app).get("/api/v1/sessions").query(WINDOW).set("authorization", `Bearer ${leaderToken}`);
    expect(ids(res)).toEqual([sessionId]);
    expect(res.body.data.sessions[0].checkInToken).toBeNull();
  });

  it("refuses STUDENT (they keep the pinned-season route)", async () => {
    const res = await request(app).get("/api/v1/sessions").query(WINDOW).set("authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
  });

  it("refuses an inverted or over-long window", async () => {
    const inverted = await request(app)
      .get("/api/v1/sessions")
      .query({ from: WINDOW.to, to: WINDOW.from })
      .set("authorization", `Bearer ${superToken}`);
    expect(inverted.status).toBe(400);
    const long = await request(app)
      .get("/api/v1/sessions")
      .query({ from: "2099-01-01T00:00:00.000Z", to: "2099-06-01T00:00:00.000Z" })
      .set("authorization", `Bearer ${superToken}`);
    expect(long.status).toBe(400);
  });

  it("defaults to org-midnight today plus eight calendar weeks", async () => {
    const res = await request(app).get("/api/v1/sessions").set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    const from = new Date(res.body.data.from).getTime();
    const to = new Date(res.body.data.to).getTime();
    expect(from).toBeLessThanOrEqual(Date.now());
    expect(Date.now() - from).toBeLessThan(25 * 3_600_000);
    // Eight org-calendar weeks: 56 days, ± one DST hour.
    expect(Math.abs(to - from - 56 * 86_400_000)).toBeLessThanOrEqual(3_600_000);
  });

  it("pages: a window given only `from` runs eight weeks forward", async () => {
    const res = await request(app)
      .get("/api/v1/sessions")
      .query({ from: WINDOW.from })
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.from).toBe(WINDOW.from);
    expect(ids(res)).toEqual(expect.arrayContaining([sessionId]));
  });
});

describe("GET /api/v1/sessions/:id/series (D-16.8)", () => {
  let anchorId: number;

  beforeAll(async () => {
    const created = await request(app)
      .post("/api/v1/sessions")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ seasonId, title: "Weekly", startDay: "2099-04-03", startTime: "19:00", durationMinutes: 60, repeatWeeks: 3 });
    const series = await db.session.findMany({
      where: { recurrenceGroupId: created.body.data.recurrenceGroupId },
      orderBy: { startsAt: "asc" },
      select: { id: true },
    });
    const second = series[1];
    if (!second) throw new Error("series fixture did not create three sessions");
    anchorId = second.id;
    const student = await db.seasonEnrollment.findFirstOrThrow({ where: { seasonId }, select: { studentUserId: true } });
    await db.attendance.create({ data: { sessionId: anchorId, studentUserId: student.studentUserId, status: "PRESENT" } });
  });

  it("previews 'future' as the anchor and every later sibling, with attendance counts", async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${anchorId}/series`)
      .query({ scope: "future" })
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.sessions).toHaveLength(2);
    expect(res.body.data.sessions[0]).toMatchObject({ id: anchorId, isAnchor: true, attendanceCount: 1, startTime: "19:00" });
    expect(res.body.data).toMatchObject({ scope: "future", attendanceCount: 1, videoProgressCount: 0 });
  });

  it("previews 'all' as the whole season-fenced series", async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${anchorId}/series`)
      .query({ scope: "all" })
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.body.data.sessions).toHaveLength(3);
  });

  it("requires a scope and a season admin", async () => {
    expect(
      (await request(app).get(`/api/v1/sessions/${anchorId}/series`).set("authorization", `Bearer ${adminToken}`)).status,
    ).toBe(400);
    expect(
      (await request(app).get(`/api/v1/sessions/${anchorId}/series`).query({ scope: "all" }).set("authorization", `Bearer ${leaderToken}`)).status,
    ).toBe(403);
  });
});

describe("check-in state and regeneration (D-16.9, G19)", () => {
  it("reads the state back — admin only", async () => {
    const before = await request(app)
      .get(`/api/v1/sessions/${sessionId}/check-in`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(before.status).toBe(200);
    expect(before.body.data).toMatchObject({ state: "not_open", isOpen: false, checkInToken: token, expiresAt: null });

    await request(app).post(`/api/v1/sessions/${sessionId}/check-in-open`).set("authorization", `Bearer ${adminToken}`);
    const open = await request(app)
      .get(`/api/v1/sessions/${sessionId}/check-in`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(open.body.data).toMatchObject({ state: "open", isOpen: true, checkInToken: token });
    const opened = new Date(open.body.data.checkInOpenAt).getTime();
    expect(new Date(open.body.data.expiresAt).getTime() - opened).toBe(3 * 3_600_000);
    expect(open.body.data.expiresAtTime).toMatch(/^\d{2}:\d{2}$/);

    for (const t of [leaderToken, studentToken]) {
      expect(
        (await request(app).get(`/api/v1/sessions/${sessionId}/check-in`).set("authorization", `Bearer ${t}`)).status,
      ).toBe(403);
    }
  });

  it("regenerates the token, keeps the window open, and kills the old code (v1 R40)", async () => {
    const res = await request(app)
      .post(`/api/v1/sessions/${sessionId}/check-in-regenerate`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.checkInToken).not.toBe(token);

    const row = await db.session.findUniqueOrThrow({
      where: { id: sessionId },
      select: { checkInToken: true, checkInOpenAt: true, checkInClosedAt: true },
    });
    expect(row.checkInToken).toBe(res.body.data.checkInToken);
    expect(row.checkInOpenAt).not.toBeNull();
    expect(row.checkInClosedAt).toBeNull();

    const stale = await request(app)
      .post("/api/v1/sessions/check-in")
      .set("authorization", `Bearer ${studentToken}`)
      .send({ token });
    expect(stale.status).toBe(404);
    expect(stale.body.error.code).toBe("invalid_token");

    expect(
      (await request(app).post(`/api/v1/sessions/${sessionId}/check-in-regenerate`).set("authorization", `Bearer ${leaderToken}`)).status,
    ).toBe(403);
  });
});

describe("GET /api/v1/sessions/:id/quizzes (D-16.10, G18)", () => {
  beforeAll(async () => {
    await db.quiz.create({ data: { seasonId, sessionId, title: "Paper quiz", kind: "PAPER", maxScore: 20 } });
    await db.quiz.create({ data: { seasonId, sessionId, title: "Online draft", kind: "ONLINE", maxScore: 10 } });
  });

  it("lists the session's quizzes for a leader in the season, oldest first", async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}/quizzes`)
      .set("authorization", `Bearer ${leaderToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.quizzes).toEqual([
      { id: expect.any(Number), title: "Paper quiz", kind: "PAPER", maxScore: 20, questionCount: 0, publishedAt: null },
      { id: expect.any(Number), title: "Online draft", kind: "ONLINE", maxScore: 10, questionCount: 0, publishedAt: null },
    ]);
  });

  it("refuses a student and 404s an unknown session", async () => {
    expect(
      (await request(app).get(`/api/v1/sessions/${sessionId}/quizzes`).set("authorization", `Bearer ${studentToken}`)).status,
    ).toBe(403);
    expect(
      (await request(app).get("/api/v1/sessions/2147480000/quizzes").set("authorization", `Bearer ${adminToken}`)).status,
    ).toBe(404);
  });
});
