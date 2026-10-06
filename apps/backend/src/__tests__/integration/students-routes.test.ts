import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

// Every fixture email starts with this. Unscoped (SUPER/MENTOR) list
// assertions pass ?q=space-v2-test- so real rows in the shared staging DB can
// never satisfy or break them.
const PFX = "space-v2-test-";

let seasonAId: number;
let seasonBId: number;
let groupId: number;
let superToken: string;
let adminToken: string; // season admin of A only
let mentorToken: string;
let leaderToken: string; // leads the one group in A
let student1Id: number; // enrolled in A (group-linked via the ENROLLMENT row) and in B
let student1Token: string;
let student2Id: number; // enrolled in B only
let alumnusId: number; // graduationYear set, COMPLETED enrollment in A
let droppedId: number; // WITHDRAWN enrollment in A, no group
let droppedEnrollmentId: number;
let deletedDroppedId: number; // soft-deleted user with a WITHDRAWN enrollment (D12)

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
  groupId = group.id;

  const student1 = await createTestUser("student-one", "STUDENT");
  student1Id = student1.id;
  await db.studentProfile.create({
    data: {
      userId: student1Id,
      activeSeasonId: seasonAId,
      university: "Test University",
      year: "3rd",
      phone: "+20 100 000 0000",
      spiritualBackground: "Test background",
      gifts: "Teaching",
      notes: "Internal staff note",
    },
  });
  // The group link lives on the ENROLLMENT row only — deliberately NO
  // GroupStudent row, so any scope that quietly falls back to GroupStudent
  // (v1's unreachable leader branch, students-query.ts:50-55) fails the
  // leader tests below (ruling C9).
  await db.seasonEnrollment.create({
    data: { studentUserId: student1Id, seasonId: seasonAId, groupId, status: "ACTIVE" },
  });
  // A second, group-less enrollment in B: the leader detail test (Task 3)
  // proves row scoping by seeing 1 of these 2.
  await db.seasonEnrollment.create({
    data: { studentUserId: student1Id, seasonId: seasonBId, status: "COMPLETED", completedAt: new Date() },
  });

  const student2 = await createTestUser("student-two", "STUDENT");
  student2Id = student2.id;
  await db.studentProfile.create({ data: { userId: student2Id } });
  await db.seasonEnrollment.create({
    data: { studentUserId: student2Id, seasonId: seasonBId, status: "ACTIVE" },
  });

  const alumnus = await createTestUser("alumnus", "STUDENT");
  alumnusId = alumnus.id;
  await db.user.update({ where: { id: alumnusId }, data: { graduationYear: 2024 } });
  await db.studentProfile.create({ data: { userId: alumnusId, university: "Alumni University" } });
  await db.seasonEnrollment.create({
    data: { studentUserId: alumnusId, seasonId: seasonAId, status: "COMPLETED", completedAt: new Date() },
  });

  const dropped = await createTestUser("dropped", "STUDENT");
  droppedId = dropped.id;
  await db.studentProfile.create({ data: { userId: droppedId } });
  const droppedEnrollment = await db.seasonEnrollment.create({
    data: {
      studentUserId: droppedId,
      seasonId: seasonAId,
      status: "WITHDRAWN",
      droppedAt: new Date("2099-06-01T00:00:00.000Z"),
      dropReason: "Moved away",
    },
    select: { id: true },
  });
  droppedEnrollmentId = droppedEnrollment.id;

  const deletedDropped = await createTestUser("deleted-dropped", "STUDENT");
  deletedDroppedId = deletedDropped.id;
  await db.seasonEnrollment.create({
    data: { studentUserId: deletedDroppedId, seasonId: seasonAId, status: "WITHDRAWN", droppedAt: new Date() },
  });
  await db.user.update({ where: { id: deletedDroppedId }, data: { deletedAt: new Date() } });

  superToken = await login(app, superUser.email);
  adminToken = await login(app, admin.email);
  mentorToken = await login(app, mentor.email);
  leaderToken = await login(app, leader.email);
  student1Token = await login(app, student1.email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("GET /api/v1/students (active)", () => {
  it("returns every non-graduated, non-deleted student for SUPER, with a real total", async () => {
    const res = await request(app)
      .get(`/api/v1/students?q=${PFX}`)
      .set("authorization", `Bearer ${superToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.students.map((s: { id: number }) => s.id);
    // droppedId IS here: WITHDRAWN is an enrollment fact, not a user state —
    // the active list excludes only alumni (R29) and the soft-deleted.
    expect(ids).toEqual(expect.arrayContaining([student1Id, student2Id, droppedId]));
    expect(ids).not.toContain(alumnusId);
    expect(ids).not.toContain(deletedDroppedId);
    expect(res.body.data.total).toBe(3);
    const row = res.body.data.students.find((s: { id: number }) => s.id === student1Id);
    expect(row).toMatchObject({
      name: "Test student-one",
      university: "Test University",
      activeSeasonTitle: "Test Season",
      droppedEnrollment: null,
    });
  });

  it("narrows ADMIN to students ever enrolled in their seasons (R31, kept)", async () => {
    const res = await request(app)
      .get(`/api/v1/students?q=${PFX}`)
      .set("authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.students.map((s: { id: number }) => s.id);
    expect(ids).toEqual(expect.arrayContaining([student1Id, droppedId]));
    expect(ids).not.toContain(student2Id); // season B is not theirs
  });

  it("narrows LEADER to their groups' members through the ENROLLMENT row (C9)", async () => {
    // student1 has NO GroupStudent row — only SeasonEnrollment.groupId links
    // them to the leader's group. A scope that reads GroupStudent returns [].
    const res = await request(app)
      .get(`/api/v1/students?q=${PFX}`)
      .set("authorization", `Bearer ${leaderToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.students.map((s: { id: number }) => s.id)).toEqual([student1Id]);
    expect(res.body.data.total).toBe(1);
  });

  it("refuses a STUDENT caller — no student roster for students (C8)", async () => {
    const res = await request(app)
      .get("/api/v1/students")
      .set("authorization", `Bearer ${student1Token}`);
    expect(res.status).toBe(403);
  });

  it("filters by seasonId through enrollments, any status", async () => {
    const res = await request(app)
      .get(`/api/v1/students?q=${PFX}&seasonId=${seasonBId}`)
      .set("authorization", `Bearer ${superToken}`);

    const ids = res.body.data.students.map((s: { id: number }) => s.id);
    expect([...ids].sort()).toEqual([student1Id, student2Id].sort());
  });

  it("searches university case-insensitively, ANDed with scope (R33)", async () => {
    const res = await request(app)
      .get(`/api/v1/students?q=${encodeURIComponent("test university")}`)
      .set("authorization", `Bearer ${adminToken}`);

    expect(res.body.data.students.map((s: { id: number }) => s.id)).toEqual([student1Id]);
  });

  it("pages with a stable cursor and a constant total (D14 — no silent 200-row cap)", async () => {
    const first = await request(app)
      .get(`/api/v1/students?q=${PFX}&limit=2`)
      .set("authorization", `Bearer ${superToken}`);
    expect(first.body.data.students).toHaveLength(2);
    expect(first.body.data.nextCursor).not.toBeNull();
    expect(first.body.data.total).toBe(3);

    const second = await request(app)
      .get(`/api/v1/students?q=${PFX}&limit=2&cursor=${first.body.data.nextCursor}`)
      .set("authorization", `Bearer ${superToken}`);
    expect(second.body.data.students).toHaveLength(1);
    expect(second.body.data.nextCursor).toBeNull();
    const firstIds = first.body.data.students.map((s: { id: number }) => s.id);
    expect(firstIds).not.toContain(second.body.data.students[0].id);
  });
});

describe("GET /api/v1/students?status=alumni", () => {
  it("lists alumni with the graduation year for ADMIN and MENTOR", async () => {
    for (const token of [adminToken, mentorToken]) {
      const res = await request(app)
        .get(`/api/v1/students?status=alumni&q=${PFX}`)
        .set("authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      const row = res.body.data.students.find((s: { id: number }) => s.id === alumnusId);
      expect(row).toMatchObject({ graduationYear: 2024, university: "Alumni University" });
    }
  });

  it("refuses LEADER — v1 gave them no alumni surface (spec 06 §4.1)", async () => {
    const res = await request(app)
      .get("/api/v1/students?status=alumni")
      .set("authorization", `Bearer ${leaderToken}`);
    expect(res.status).toBe(403);
  });
});

describe("GET /api/v1/students?status=dropped", () => {
  it("returns enrollment-keyed rows with the drop reason (R43)", async () => {
    const res = await request(app)
      .get(`/api/v1/students?status=dropped&q=${PFX}`)
      .set("authorization", `Bearer ${superToken}`);

    expect(res.status).toBe(200);
    const row = res.body.data.students.find((s: { id: number }) => s.id === droppedId);
    expect(row.droppedEnrollment).toMatchObject({
      enrollmentId: droppedEnrollmentId,
      seasonId: seasonAId,
      dropReason: "Moved away",
    });
  });

  it("excludes soft-deleted students (D12 — v1 listed their name and reason forever)", async () => {
    const res = await request(app)
      .get(`/api/v1/students?status=dropped&q=${PFX}`)
      .set("authorization", `Bearer ${superToken}`);
    expect(res.body.data.students.map((s: { id: number }) => s.id)).not.toContain(deletedDroppedId);
  });

  it("narrows ADMIN to their seasons' withdrawals (R45)", async () => {
    const res = await request(app)
      .get(`/api/v1/students?status=dropped&q=${PFX}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.students.length).toBeGreaterThan(0);
    for (const s of res.body.data.students) {
      expect(s.droppedEnrollment.seasonId).toBe(seasonAId);
    }
  });

  it("refuses MENTOR — as an endpoint this hands every drop reason to read-all (spec 06 §4.3/§7)", async () => {
    const res = await request(app)
      .get("/api/v1/students?status=dropped")
      .set("authorization", `Bearer ${mentorToken}`);
    expect(res.status).toBe(403);
  });
});
