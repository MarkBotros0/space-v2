import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let groupId: number;
let otherGroupId: number;
let soleAssignmentId: number;
let leaderId: number;
let studentIds: number[];
let superToken: string;
let adminToken: string;
let idleAdminToken: string;
let leaderToken: string;

beforeAll(async () => {
  await cleanupTestData();
  seasonId = (await createTestSeason()).id;

  const superUser = await createTestUser("super", "SUPER");
  const admin = await createTestUser("admin", "ADMIN");
  const idleAdmin = await createTestUser("idle-admin", "ADMIN");
  const leader = await createTestUser("leader", "LEADER");
  leaderId = leader.id;
  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });

  groupId = (
    await db.group.create({
      data: { seasonId, name: "Doomed", leaders: { create: { userId: leader.id } } },
      select: { id: true },
    })
  ).id;
  otherGroupId = (await db.group.create({ data: { seasonId, name: "Survivor" }, select: { id: true } })).id;

  studentIds = [];
  for (const label of ["g-a", "g-b"]) {
    const s = await createTestUser(label, "STUDENT");
    studentIds.push(s.id);
    await db.seasonEnrollment.create({ data: { seasonId, studentUserId: s.id, groupId, status: "ACTIVE" } });
    await db.groupStudent.create({ data: { groupId, studentUserId: s.id, seasonId } });
  }

  soleAssignmentId = (
    await db.assignment.create({
      data: { seasonId, title: "Only for Doomed", isAllGroups: false, targets: { create: { groupId } } },
      select: { id: true },
    })
  ).id;
  await db.assignment.create({
    data: { seasonId, title: "Shared", isAllGroups: false, targets: { create: [{ groupId }, { groupId: otherGroupId }] } },
  });
  await db.assignment.create({ data: { seasonId, title: "Everyone", isAllGroups: true } });
  await db.assignment.create({
    data: { seasonId, title: "Deleted sole", isAllGroups: false, deletedAt: new Date(), targets: { create: { groupId } } },
  });

  superToken = await login(app, superUser.email);
  adminToken = await login(app, admin.email);
  idleAdminToken = await login(app, idleAdmin.email);
  leaderToken = await login(app, leader.email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("GET /api/v1/groups/leader-options (D-16.14)", () => {
  it("lists live LEADER users for a season admin and a SUPER", async () => {
    for (const t of [adminToken, superToken]) {
      const res = await request(app).get("/api/v1/groups/leader-options").set("authorization", `Bearer ${t}`);
      expect(res.status).toBe(200);
      const ids = res.body.data.leaders.map((l: { id: number }) => l.id);
      expect(ids).toContain(leaderId);
      expect(ids).not.toEqual(expect.arrayContaining(studentIds));
    }
  });

  it("refuses an ADMIN with no season and a LEADER", async () => {
    for (const t of [idleAdminToken, leaderToken]) {
      expect((await request(app).get("/api/v1/groups/leader-options").set("authorization", `Bearer ${t}`)).status).toBe(403);
    }
  });
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
  it("previews the impact — live, sole-target assignments only", async () => {
    const res = await request(app).get(`/api/v1/groups/${groupId}/impact`).set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      studentCount: 2,
      leaderCount: 1,
      soleTargetAssignments: [{ id: soleAssignmentId, title: "Only for Doomed" }],
    });
  });

  it("refuses to delete while an assignment would be left targeting nobody (spec 05 R44)", async () => {
    const res = await request(app).delete(`/api/v1/groups/${groupId}`).set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("group_has_sole_targets");
    expect(await db.group.count({ where: { id: groupId } })).toBe(1);
  });

  it("refuses a leader — even of this group", async () => {
    expect((await request(app).get(`/api/v1/groups/${groupId}/impact`).set("authorization", `Bearer ${leaderToken}`)).status).toBe(403);
    expect((await request(app).delete(`/api/v1/groups/${groupId}`).set("authorization", `Bearer ${leaderToken}`)).status).toBe(403);
  });

  it("deletes once retargeted: unassigns every enrolment, drops memberships and targets, keeps the others", async () => {
    await db.assignment.update({ where: { id: soleAssignmentId }, data: { isAllGroups: true } });

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
    // The shared assignment keeps its other target.
    const shared = await db.assignment.findFirstOrThrow({ where: { seasonId, title: "Shared" }, select: { targets: { select: { groupId: true } } } });
    expect(shared.targets).toEqual([{ groupId: otherGroupId }]);
  });

  it("is 404 the second time", async () => {
    expect((await request(app).delete(`/api/v1/groups/${groupId}`).set("authorization", `Bearer ${adminToken}`)).status).toBe(404);
  });
});
