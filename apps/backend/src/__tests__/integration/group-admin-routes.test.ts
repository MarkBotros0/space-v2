import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { liveAssignment } from "../../lib/db/live";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let groupId: number;
let assignmentId: number;
let studentIds: number[];
let adminToken: string;
let leaderToken: string;

beforeAll(async () => {
  await cleanupTestData();
  seasonId = (await createTestSeason()).id;

  const admin = await createTestUser("admin", "ADMIN");
  const leader = await createTestUser("leader", "LEADER");
  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });

  groupId = (
    await db.group.create({
      data: { seasonId, name: "Doomed", leaders: { create: { userId: leader.id } } },
      select: { id: true },
    })
  ).id;
  await db.group.create({ data: { seasonId, name: "Survivor" } });

  studentIds = [];
  for (const label of ["g-a", "g-b"]) {
    const s = await createTestUser(label, "STUDENT");
    studentIds.push(s.id);
    await db.seasonEnrollment.create({ data: { seasonId, studentUserId: s.id, groupId, status: "ACTIVE" } });
    await db.groupStudent.create({ data: { groupId, seasonId, studentUserId: s.id } });
  }

  // Assignments are for the whole season: nothing about one stops a group going.
  assignmentId = (
    await db.assignment.create({
      data: { seasonId, title: "Everyone", parts: { create: { position: 0, kind: "ESSAY", prompt: "Why?" } } },
      select: { id: true },
    })
  ).id;

  adminToken = await login(app, admin.email);
  leaderToken = await login(app, leader.email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("canManage on GET /api/v1/groups/:id (D-16.15)", () => {
  it("is true for the season admin and false for the group's own leader", async () => {
    const admin = await request(app).get(`/api/v1/groups/${groupId}`).set("authorization", `Bearer ${adminToken}`);
    expect(admin.body.data.canManage).toBe(true);
    const leader = await request(app).get(`/api/v1/groups/${groupId}`).set("authorization", `Bearer ${leaderToken}`);
    expect(leader.body.data.canManage).toBe(false);
  });
});

describe("group delete (D-16.13)", () => {
  it("previews the impact: students and leaders, nothing about assignments", async () => {
    const res = await request(app).get(`/api/v1/groups/${groupId}/impact`).set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ studentCount: 2, leaderCount: 1 });
  });

  it("refuses a leader — even of this group", async () => {
    expect(
      (await request(app).get(`/api/v1/groups/${groupId}/impact`).set("authorization", `Bearer ${leaderToken}`)).status,
    ).toBe(403);
    expect(
      (await request(app).delete(`/api/v1/groups/${groupId}`).set("authorization", `Bearer ${leaderToken}`)).status,
    ).toBe(403);
  });

  it("deletes while the season has assignments: unassigns every enrolment, drops memberships", async () => {
    const res = await request(app).delete(`/api/v1/groups/${groupId}`).set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(true);
    expect([...res.body.data.orphanedStudentIds].sort()).toEqual([...studentIds].sort());

    expect(await db.group.count({ where: { id: groupId } })).toBe(0);
    expect(await db.groupStudent.count({ where: { studentUserId: { in: studentIds } } })).toBe(0);
    const enrolments = await db.seasonEnrollment.findMany({
      where: { seasonId, studentUserId: { in: studentIds } },
      select: { groupId: true, status: true },
    });
    expect(enrolments).toEqual([
      { groupId: null, status: "ACTIVE" },
      { groupId: null, status: "ACTIVE" },
    ]);
    // The season's assignment is untouched.
    expect(await db.assignment.count({ where: { id: assignmentId, ...liveAssignment } })).toBe(1);
  });

  it("is 404 the second time", async () => {
    expect(
      (await request(app).delete(`/api/v1/groups/${groupId}`).set("authorization", `Bearer ${adminToken}`)).status,
    ).toBe(404);
  });
});
