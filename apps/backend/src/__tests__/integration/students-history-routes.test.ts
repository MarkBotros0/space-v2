import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { newPublicId } from "../../lib/public-id";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();
const PFX = "space-v2-test-";

let seasonAId: number;
let seasonBId: number;
let groupAId: number;
let s1: number; // Alpha: A (group) + B (completed); university "Zeta U"
let s2: number; // Bravo: A, no group; university "Alpha U"
let s3: number; // Charlie: A, no profile university
let superToken: string;
let adminToken: string; // admin of A only
let mentorToken: string;
let leaderToken: string; // leads group A
let s1Token: string;

const at = (iso: string) => new Date(iso);

beforeAll(async () => {
  await cleanupTestData();
  seasonAId = (await createTestSeason()).id;
  seasonBId = (await createTestSeason()).id;

  const superUser = await createTestUser("super", "SUPER");
  const admin = await createTestUser("admin", "ADMIN");
  await db.seasonAdmin.create({ data: { seasonId: seasonAId, userId: admin.id } });
  const mentor = await createTestUser("mentor", "MENTOR");
  const leader = await createTestUser("leader", "LEADER");
  const group = await db.group.create({
    data: { seasonId: seasonAId, name: "Group A", leaders: { create: { userId: leader.id } } },
    select: { id: true },
  });
  groupAId = group.id;

  const mk = async (label: string, name: string) => {
    const u = await createTestUser(label, "STUDENT");
    await db.user.update({ where: { id: u.id }, data: { name } });
    return u;
  };
  const u1 = await mk("alpha", "Alpha Student");
  const u2 = await mk("bravo", "Bravo Student");
  const u3 = await mk("charlie", "Charlie Student");
  s1 = u1.id;
  s2 = u2.id;
  s3 = u3.id;
  await db.studentProfile.create({ data: { userId: s1, university: "Zeta U", activeSeasonId: seasonAId } });
  await db.studentProfile.create({ data: { userId: s2, university: "Alpha U" } });
  await db.studentProfile.create({ data: { userId: s3 } });
  await db.groupStudent.create({ data: { groupId: groupAId, studentUserId: s1 } });

  const old = at("1999-01-01T00:00:00.000Z");
  await db.seasonEnrollment.createMany({
    data: [
      { studentUserId: s1, seasonId: seasonAId, groupId: groupAId, status: "ACTIVE", enrolledAt: old },
      { studentUserId: s1, seasonId: seasonBId, status: "COMPLETED", enrolledAt: old },
      { studentUserId: s2, seasonId: seasonAId, status: "ACTIVE", enrolledAt: old },
      { studentUserId: s3, seasonId: seasonAId, status: "ACTIVE", enrolledAt: old },
    ],
  });

  const sess = async (seasonId: number, title: string, startsAt: Date) =>
    (await db.session.create({
      data: { seasonId, title, startsAt, durationMinutes: 60, checkInToken: newPublicId() },
      select: { id: true },
    })).id;
  const a1 = await sess(seasonAId, "A past one", at("2000-01-01T10:00:00.000Z"));
  const a2 = await sess(seasonAId, "A past two", at("2000-02-01T10:00:00.000Z"));
  await sess(seasonAId, "A future", at("2099-01-01T10:00:00.000Z"));
  const b1 = await sess(seasonBId, "B past", at("2000-03-01T10:00:00.000Z"));
  await db.attendance.createMany({
    data: [
      { sessionId: a1, studentUserId: s1, status: "PRESENT", markedById: leader.id },
      { sessionId: a2, studentUserId: s1, status: "ABSENT", markedById: leader.id },
      { sessionId: b1, studentUserId: s1, status: "LATE", markedById: leader.id },
    ],
  });

  const asg = async (seasonId: number, title: string, dueAt: Date | null) =>
    (await db.assignment.create({
      data: { seasonId, title, isAllGroups: true, dueAt },
      select: { id: true },
    })).id;
  const sa = await asg(seasonAId, "A late essay", at("2000-01-01T00:00:00.000Z"));
  const sb = await asg(seasonBId, "B essay", null);
  const sd = await asg(seasonAId, "A draft", null);
  await db.submission.createMany({
    data: [
      { assignmentId: sa, studentUserId: s1, publicId: newPublicId(), status: "SUBMITTED", text: "x", submittedAt: at("2000-02-01T00:00:00.000Z"), createdAt: at("2000-02-01T00:00:00.000Z") },
      { assignmentId: sb, studentUserId: s1, publicId: newPublicId(), status: "REVIEWED", text: "y", submittedAt: at("2000-04-01T00:00:00.000Z"), createdAt: at("2000-04-01T00:00:00.000Z") },
      { assignmentId: sd, studentUserId: s1, publicId: newPublicId(), status: "DRAFT", text: "z" },
    ],
  });

  superToken = await login(app, superUser.email);
  adminToken = await login(app, admin.email);
  mentorToken = await login(app, mentor.email);
  leaderToken = await login(app, leader.email);
  s1Token = await login(app, u1.email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

const get = (path: string, token: string) =>
  request(app).get(path).set("authorization", `Bearer ${token}`);
type Row = { id: number };
const ids = (res: { body: { data: { students: Row[] } } }) => res.body.data.students.map((s) => s.id);

describe("GET /api/v1/students — group filter and sort keys (REG-82)", () => {
  it("filters by the displayed current group, and by 'none' for unassigned", async () => {
    const inGroup = await get(`/api/v1/students?q=${PFX}&groupId=${groupAId}`, superToken);
    expect(inGroup.status).toBe(200);
    expect(ids(inGroup)).toEqual([s1]);
    expect(inGroup.body.data.total).toBe(1);

    const none = await get(`/api/v1/students?q=${PFX}&groupId=none`, superToken);
    expect(ids(none).sort()).toEqual([s2, s3].sort());
  });

  it("keeps the group filter inside the caller's scope", async () => {
    const res = await get(`/api/v1/students?q=${PFX}&groupId=${groupAId}`, adminToken);
    expect(ids(res)).toEqual([s1]);
    const leaderNone = await get(`/api/v1/students?q=${PFX}&groupId=none`, leaderToken);
    expect(ids(leaderNone)).toEqual([]); // the leader's only student has a group
  });

  it("sorts by name, university, season or group, either direction", async () => {
    const byName = await get(`/api/v1/students?q=${PFX}&sort=name&dir=desc`, superToken);
    expect(ids(byName)).toEqual([s3, s2, s1]);

    const byUni = await get(`/api/v1/students?q=${PFX}&sort=university&dir=asc`, superToken);
    // v1 treated a missing value as "", which sorts first ascending.
    expect(ids(byUni)).toEqual([s3, s2, s1]);
    const byUniDesc = await get(`/api/v1/students?q=${PFX}&sort=university&dir=desc`, superToken);
    expect(ids(byUniDesc)).toEqual([s1, s2, s3]);

    const byGroup = await get(`/api/v1/students?q=${PFX}&sort=group&dir=desc`, superToken);
    expect(ids(byGroup)[0]).toBe(s1);

    const bySeason = await get(`/api/v1/students?q=${PFX}&sort=season&dir=desc`, superToken);
    expect(ids(bySeason)[0]).toBe(s1);
  });

  it("pages consistently under a non-default sort", async () => {
    const first = await get(`/api/v1/students?q=${PFX}&sort=university&dir=desc&limit=2`, superToken);
    const second = await get(
      `/api/v1/students?q=${PFX}&sort=university&dir=desc&limit=2&cursor=${first.body.data.nextCursor}`,
      superToken,
    );
    expect([...ids(first), ...ids(second)]).toEqual([s1, s2, s3]);
  });

  it("rejects an unknown sort key and a bad group id", async () => {
    expect((await get("/api/v1/students?sort=password", superToken)).status).toBe(400);
    expect((await get("/api/v1/students?groupId=abc", superToken)).status).toBe(400);
  });
});

describe("GET /api/v1/students/:id — per-enrolment attendance percentage (REG-83)", () => {
  const pctBySeason = (res: { body: { data: { enrollments: { seasonId: number; attendancePct: number | null }[] } } }) =>
    Object.fromEntries(res.body.data.enrollments.map((e) => [e.seasonId, e.attendancePct]));

  it("gives SUPER and MENTOR a percentage for every enrolment (past sessions, from enrolment)", async () => {
    for (const token of [superToken, mentorToken]) {
      const res = await get(`/api/v1/students/${s1}`, token);
      expect(res.status).toBe(200);
      // A: 2 past sessions, 1 present = 50. The future session is not counted.
      // B: 1 past session, LATE counts as attended = 100.
      expect(pctBySeason(res)).toEqual({ [seasonAId]: 50, [seasonBId]: 100 });
    }
  });

  it("scopes the percentage like the rows: admin only for their season, leader only their group's", async () => {
    const admin = await get(`/api/v1/students/${s1}`, adminToken);
    expect(pctBySeason(admin)).toEqual({ [seasonAId]: 50, [seasonBId]: null });
    const leader = await get(`/api/v1/students/${s1}`, leaderToken);
    expect(pctBySeason(leader)).toEqual({ [seasonAId]: 50 });
  });

  it("is staff-only: the student's own view carries null", async () => {
    const res = await get(`/api/v1/students/${s1}`, s1Token);
    expect(res.status).toBe(200);
    expect(pctBySeason(res)).toEqual({ [seasonAId]: null, [seasonBId]: null });
  });
});

describe("GET /api/v1/students/:id/attendance (REG-83)", () => {
  it("returns the newest-first history across seasons for SUPER", async () => {
    const res = await get(`/api/v1/students/${s1}/attendance`, superToken);
    expect(res.status).toBe(200);
    expect(res.body.data.history.map((h: { sessionTitle: string }) => h.sessionTitle)).toEqual([
      "B past",
      "A past two",
      "A past one",
    ]);
    expect(res.body.data.history[0]).toMatchObject({
      seasonId: seasonBId,
      status: "LATE",
      sessionId: expect.any(Number),
      startsAt: expect.any(String),
      seasonTitle: expect.any(String),
    });
  });

  it("narrows an ADMIN to their seasons and a LEADER to the seasons naming their group", async () => {
    for (const token of [adminToken, leaderToken]) {
      const res = await get(`/api/v1/students/${s1}/attendance`, token);
      expect(res.status).toBe(200);
      expect(res.body.data.history.map((h: { seasonId: number }) => h.seasonId)).toEqual([
        seasonAId,
        seasonAId,
      ]);
    }
  });

  it("refuses the student themselves, another student, and a leader outside the roster", async () => {
    expect((await get(`/api/v1/students/${s1}/attendance`, s1Token)).status).toBe(403);
    expect((await get(`/api/v1/students/${s2}/attendance`, leaderToken)).status).toBe(403);
    expect((await get(`/api/v1/students/${s2}/attendance`, s1Token)).status).toBe(403);
  });

  it("404s a missing student and 400s a bad id", async () => {
    expect((await get("/api/v1/students/2147483000/attendance", superToken)).status).toBe(404);
    expect((await get("/api/v1/students/abc/attendance", superToken)).status).toBe(400);
  });
});

describe("GET /api/v1/students/:id/submissions (REG-83)", () => {
  it("lists a student's submitted work newest first, never a draft, with the late flag", async () => {
    const res = await get(`/api/v1/students/${s1}/submissions`, superToken);
    expect(res.status).toBe(200);
    const subs = res.body.data.submissions;
    expect(subs.map((s: { assignmentTitle: string }) => s.assignmentTitle)).toEqual([
      "B essay",
      "A late essay",
    ]);
    expect(subs[1]).toMatchObject({ status: "SUBMITTED", isLate: true, seasonId: seasonAId });
    expect(subs[0]).toMatchObject({ status: "REVIEWED", isLate: false });
    expect(JSON.stringify(res.body)).not.toContain("A draft");
  });

  it("applies the same row scope as submission detail: admin their season, leader their group's", async () => {
    for (const token of [adminToken, leaderToken]) {
      const res = await get(`/api/v1/students/${s1}/submissions`, token);
      expect(res.status).toBe(200);
      expect(
        res.body.data.submissions.map((s: { assignmentTitle: string }) => s.assignmentTitle),
      ).toEqual(["A late essay"]);
    }
  });

  it("is staff-only", async () => {
    expect((await get(`/api/v1/students/${s1}/submissions`, s1Token)).status).toBe(403);
    expect((await get(`/api/v1/students/${s2}/submissions`, adminToken)).status).toBe(200);
    expect((await get(`/api/v1/students/${s2}/submissions`, leaderToken)).status).toBe(403);
  });
});

describe("history scope when the student is in a season through a different group (REG-83)", () => {
  it("shows a LEADER and an ADMIN of other seasons nothing from it, and SUPER everything", async () => {
    const seasonCId = (await createTestSeason()).id;
    const otherGroup = await db.group.create({
      data: { seasonId: seasonCId, name: "Group C" },
      select: { id: true },
    });
    await db.seasonEnrollment.create({
      data: {
        studentUserId: s1,
        seasonId: seasonCId,
        groupId: otherGroup.id,
        status: "ACTIVE",
        enrolledAt: at("1999-06-01T00:00:00.000Z"),
      },
    });
    const sessionC = await db.session.create({
      data: {
        seasonId: seasonCId,
        title: "C past",
        startsAt: at("2000-05-01T10:00:00.000Z"),
        durationMinutes: 60,
        checkInToken: newPublicId(),
      },
      select: { id: true },
    });
    await db.attendance.create({
      data: { sessionId: sessionC.id, studentUserId: s1, status: "PRESENT", markedById: s1 },
    });
    const asgC = await db.assignment.create({
      data: { seasonId: seasonCId, title: "C essay", isAllGroups: true },
      select: { id: true },
    });
    await db.submission.create({
      data: {
        assignmentId: asgC.id,
        studentUserId: s1,
        publicId: newPublicId(),
        status: "SUBMITTED",
        text: "c",
        submittedAt: at("2000-05-02T00:00:00.000Z"),
      },
    });

    const attendanceFor = async (token: string) =>
      (await get(`/api/v1/students/${s1}/attendance`, token)).body.data.history.map(
        (h: { sessionTitle: string }) => h.sessionTitle,
      );
    const submissionsFor = async (token: string) =>
      (await get(`/api/v1/students/${s1}/submissions`, token)).body.data.submissions.map(
        (s: { assignmentTitle: string }) => s.assignmentTitle,
      );

    expect(await attendanceFor(superToken)).toContain("C past");
    expect(await submissionsFor(superToken)).toContain("C essay");
    for (const token of [leaderToken, adminToken]) {
      expect(await attendanceFor(token)).not.toContain("C past");
      expect(await submissionsFor(token)).not.toContain("C essay");
    }
  });
});
