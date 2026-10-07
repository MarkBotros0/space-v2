import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();
const DAY = 24 * 60 * 60 * 1000;

let pastSeasonId: number;
let currentSeasonId: number;
let studentId: number;
let peerId: number;
let leaderId: number;
let studentToken: string;
let alumnusToken: string;
let leaderToken: string;
let adminToken: string;

beforeAll(async () => {
  await cleanupTestData();

  const past = await createTestSeason({ year: 2098 });
  const current = await createTestSeason();
  const deleted = await createTestSeason({ year: 2097 });
  pastSeasonId = past.id;
  currentSeasonId = current.id;
  await db.season.update({ where: { id: past.id }, data: { title: "Past Season" } });
  await db.season.update({
    where: { id: current.id },
    data: { title: "Current Season", description: "The season we are in." },
  });
  // Spec 02 D2: a soft-deleted season disappears from the student surfaces.
  await db.season.update({ where: { id: deleted.id }, data: { title: "Deleted Season", deletedAt: new Date() } });

  const student = await createTestUser("self-student", "STUDENT");
  const peer = await createTestUser("peer", "STUDENT");
  const withdrawn = await createTestUser("withdrawn-peer", "STUDENT");
  const alumnus = await createTestUser("alumnus", "STUDENT");
  const leader = await createTestUser("leader", "LEADER");
  const admin = await createTestUser("admin", "ADMIN");
  studentId = student.id;
  peerId = peer.id;
  leaderId = leader.id;
  // graduationYear is a token claim read at login — set it before logging in.
  await db.user.update({ where: { id: alumnus.id }, data: { graduationYear: 2098 } });

  const pastGroup = await db.group.create({ data: { seasonId: past.id, name: "Group A1" }, select: { id: true } });
  const currentGroup = await db.group.create({
    data: {
      seasonId: current.id,
      name: "Group B1",
      description: "Tuesday group",
      leaders: { create: { userId: leader.id } },
    },
    select: { id: true },
  });

  // Ruling C9 trap: GroupStudent (one row per student, database-wide) still
  // points at LAST season's group. /me/season must not read it.
  await db.groupStudent.create({ data: { groupId: pastGroup.id, studentUserId: student.id } });

  await db.seasonEnrollment.createMany({
    data: [
      { studentUserId: student.id, seasonId: past.id, groupId: pastGroup.id, status: "COMPLETED", enrolledAt: new Date(Date.now() - 400 * DAY) },
      { studentUserId: student.id, seasonId: current.id, groupId: currentGroup.id, status: "ACTIVE", enrolledAt: new Date(Date.now() - 30 * DAY) },
      { studentUserId: student.id, seasonId: deleted.id, status: "COMPLETED", enrolledAt: new Date(Date.now() - 500 * DAY) },
      { studentUserId: peer.id, seasonId: current.id, groupId: currentGroup.id, status: "ACTIVE" },
      { studentUserId: withdrawn.id, seasonId: current.id, groupId: currentGroup.id, status: "WITHDRAWN" },
      // R33: history lists an enrollment whatever its status.
      { studentUserId: alumnus.id, seasonId: past.id, status: "WITHDRAWN" },
    ],
  });

  // activeSeasonId is a token claim read at login — set it before logging in.
  await db.studentProfile.create({
    data: {
      userId: student.id,
      activeSeasonId: current.id,
      university: "Cairo University",
      phone: "+20 100 000 0000",
      dateOfBirth: new Date("2001-04-05T00:00:00.000Z"),
      notes: "STAFF ONLY — never sent to the subject",
    },
  });
  await db.studentProfile.create({ data: { userId: alumnus.id, university: "Ain Shams" } });

  // Past season: two sessions; the student attended one → 50% (R36).
  const pastOne = await db.session.create({
    // 23:30Z is 01:30 on the 2nd in Cairo — the dayKey must say the 2nd (X13).
    data: { seasonId: past.id, title: "Past one", startsAt: new Date("2098-03-01T23:30:00.000Z") },
    select: { id: true },
  });
  await db.session.create({
    data: { seasonId: past.id, title: "Past two", startsAt: new Date("2098-03-08T18:00:00.000Z") },
  });
  await db.attendance.create({ data: { sessionId: pastOne.id, studentUserId: student.id, status: "PRESENT" } });

  // Current season: three past sessions, four future ones.
  const now = Date.now();
  const mk = (title: string, offsetDays: number) =>
    db.session.create({
      data: { seasonId: current.id, title, startsAt: new Date(now + offsetDays * DAY) },
      select: { id: true },
    });
  const week1 = await mk("Week 1", -21);
  const week2 = await mk("Week 2", -14);
  await mk("Week 3", -7); // unmarked: the streak skips it
  const week4 = await mk("Week 4", 7);
  await mk("Week 5", 14);
  await mk("Week 6", 21);
  await mk("Week 7", 28);
  await db.attendance.createMany({
    data: [
      { sessionId: week1.id, studentUserId: student.id, status: "ABSENT" },
      { sessionId: week2.id, studentUserId: student.id, status: "PRESENT" },
      // R91: a LATE on a future-dated session still counts toward the budget.
      { sessionId: week4.id, studentUserId: student.id, status: "LATE", lateMinutes: 15 },
    ],
  });

  studentToken = await login(app, student.email);
  alumnusToken = await login(app, alumnus.email);
  leaderToken = await login(app, leader.email);
  adminToken = await login(app, admin.email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

const get = (path: string, token: string) =>
  request(app).get(path).set("authorization", `Bearer ${token}`);

describe("GET /api/v1/me/season-history (spec 02 R33–R41)", () => {
  it("lists past enrollments only — not the current season, not a deleted one (R35, D2)", async () => {
    const res = await get("/api/v1/me/season-history", studentToken);
    expect(res.status).toBe(200);
    const titles = res.body.data.seasons.map((s: { title: string }) => s.title);
    expect(titles).toEqual(["Past Season"]);
    expect(res.body.data.seasons[0]).toMatchObject({
      seasonId: pastSeasonId,
      groupName: "Group A1",
      attendancePct: 50,
    });
    expect(res.body.data.seasons[0].curriculum.map((c: { title: string }) => c.title)).toEqual([
      "Past one",
      "Past two",
    ]);
  });

  it("keys each curriculum session to its org-calendar day (ruling X13)", async () => {
    const res = await get("/api/v1/me/season-history", studentToken);
    expect(res.body.data.seasons[0].curriculum[0].dayKey).toBe("2098-03-02");
  });

  it("carries attendance % and curriculum only — no submissions, feedback or notes (R34)", async () => {
    const res = await get("/api/v1/me/season-history", studentToken);
    expect(Object.keys(res.body.data.seasons[0]).sort()).toEqual(
      ["attendancePct", "curriculum", "endDate", "groupName", "seasonId", "startDate", "title"].sort(),
    );
  });

  it("shows an alumnus every enrollment, WITHDRAWN included (R33, R35)", async () => {
    const res = await get("/api/v1/me/season-history", alumnusToken);
    expect(res.status).toBe(200);
    expect(res.body.data.seasons).toHaveLength(1);
    expect(res.body.data.seasons[0]).toMatchObject({ title: "Past Season", attendancePct: 0, groupName: null });
  });

  it("refuses staff — self-service is for students (spec 02 D13)", async () => {
    const res = await get("/api/v1/me/season-history", leaderToken);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
  });

  it("requires authentication", async () => {
    const res = await request(app).get("/api/v1/me/season-history");
    expect(res.status).toBe(401);
  });
});

describe("GET /api/v1/me/season (v1 student/season, G21)", () => {
  it("returns the active season with server-derived progress (R29)", async () => {
    const res = await get("/api/v1/me/season", studentToken);
    expect(res.status).toBe(200);
    expect(res.body.data.season).toMatchObject({
      id: currentSeasonId,
      title: "Current Season",
      description: "The season we are in.",
      status: "ACTIVE",
      progress: { completedSessions: 3, totalSessions: 7, pct: 43 },
    });
  });

  it("resolves the group through this season's enrollment, not GroupStudent (ruling C9, R88)", async () => {
    const res = await get("/api/v1/me/season", studentToken);
    expect(res.body.data.season.group).toMatchObject({ name: "Group B1", description: "Tuesday group" });
  });

  it("shows leaders with email and peers by name only, ACTIVE members only (R89)", async () => {
    const res = await get("/api/v1/me/season", studentToken);
    const group = res.body.data.season.group;
    expect(group.leaders).toEqual([{ id: leaderId, name: "Test leader", email: expect.stringMatching(/@jpc\.test$/) }]);
    expect(group.members).toEqual([
      { id: peerId, name: "Test peer", isYou: false },
      { id: studentId, name: "Test self-student", isYou: true },
    ]);
  });

  it("lists the next three sessions, soonest first, each with its org day (R30, X13)", async () => {
    const res = await get("/api/v1/me/season", studentToken);
    const upcoming = res.body.data.season.upcoming;
    expect(upcoming.map((s: { title: string }) => s.title)).toEqual(["Week 4", "Week 5", "Week 6"]);
    expect(upcoming[0].dayKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("is null for a student with no active season (R28)", async () => {
    const res = await get("/api/v1/me/season", alumnusToken);
    expect(res.status).toBe(200);
    expect(res.body.data.season).toBeNull();
  });

  it("refuses staff", async () => {
    expect((await get("/api/v1/me/season", adminToken)).status).toBe(403);
  });
});

describe("GET /api/v1/me/attendance (spec 04 §7, spec 19 D14)", () => {
  it("returns the budget with remainingPct, the streak, and past sessions newest first", async () => {
    const res = await get("/api/v1/me/attendance", studentToken);
    expect(res.status).toBe(200);
    expect(res.body.data.season).toEqual({
      id: currentSeasonId,
      title: "Current Season",
      absenceBudgetMinutes: 180,
      absenceWeightMinutes: 90,
    });
    // 1 ABSENT × 90 + 15 LATE minutes (on a FUTURE session — R91) = 105 of 180.
    expect(res.body.data.budget).toEqual({
      minutesUsed: 105,
      budgetMinutes: 180,
      budgetPct: 58,
      remainingPct: 42,
      absentCount: 1,
      lateCount: 1,
    });
    // Week 3 unmarked (skipped), Week 2 PRESENT, Week 1 ABSENT (breaks) → 1.
    expect(res.body.data.streak).toBe(1);
    const rows = res.body.data.sessions;
    expect(rows.map((r: { title: string }) => r.title)).toEqual(["Week 3", "Week 2", "Week 1"]);
    expect(rows.map((r: { status: string | null }) => r.status)).toEqual([null, "PRESENT", "ABSENT"]);
    expect(rows.map((r: { costMinutes: number | null }) => r.costMinutes)).toEqual([null, null, 90]);
    expect(rows[0].dayKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("answers an alumnus (no active season) with the empty shape, not an error (R93)", async () => {
    const res = await get("/api/v1/me/attendance", alumnusToken);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ season: null, budget: null, streak: 0, sessions: [] });
  });

  it("refuses staff", async () => {
    expect((await get("/api/v1/me/attendance", leaderToken)).status).toBe(403);
  });
});
