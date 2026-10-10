import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let otherSeasonCode: string;
let groupOneId: number;
let groupTwoId: number;
let foreignGroupId: number;
let studentAId: number;
let studentBId: number;
let withdrawnId: number;
let removedId: number;
let adminToken: string;
let superToken: string;
let leaderToken: string;

beforeAll(async () => {
  await cleanupTestData();

  const season = await createTestSeason();
  seasonId = season.id;
  const other = await createTestSeason();
  otherSeasonCode = other.code;

  const admin = await createTestUser("admin", "ADMIN");
  const superUser = await createTestUser("super", "SUPER");
  const leader = await createTestUser("leader", "LEADER");
  const a = await createTestUser("roster-a", "STUDENT");
  const b = await createTestUser("roster-b", "STUDENT");
  const withdrawn = await createTestUser("roster-withdrawn", "STUDENT");
  const removed = await createTestUser("roster-removed", "STUDENT");
  studentAId = a.id;
  studentBId = b.id;
  withdrawnId = withdrawn.id;
  removedId = removed.id;

  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  groupOneId = (
    await db.group.create({
      data: { seasonId, name: "Group One", leaders: { create: { userId: leader.id } } },
      select: { id: true },
    })
  ).id;
  groupTwoId = (await db.group.create({ data: { seasonId, name: "Group Two" }, select: { id: true } })).id;
  foreignGroupId = (
    await db.group.create({ data: { seasonId: other.id, name: "Foreign Group" }, select: { id: true } })
  ).id;

  // A: in Group One this season.
  await db.seasonEnrollment.create({ data: { seasonId, studentUserId: a.id, groupId: groupOneId, status: "ACTIVE" } });
  await db.groupStudent.create({ data: { groupId: groupOneId, studentUserId: a.id } });
  // B: unassigned here, but currently in ANOTHER season's group (spec 05 R82).
  await db.seasonEnrollment.create({ data: { seasonId, studentUserId: b.id, status: "ACTIVE" } });
  await db.seasonEnrollment.create({ data: { seasonId: other.id, studentUserId: b.id, groupId: foreignGroupId, status: "ACTIVE" } });
  await db.groupStudent.create({ data: { groupId: foreignGroupId, studentUserId: b.id } });
  // Withdrawn and soft-deleted students are not on the roster (C9 + live users only).
  await db.seasonEnrollment.create({ data: { seasonId, studentUserId: withdrawn.id, status: "WITHDRAWN" } });
  await db.seasonEnrollment.create({ data: { seasonId, studentUserId: removed.id, status: "ACTIVE" } });
  await db.user.update({ where: { id: removed.id }, data: { deletedAt: new Date() } });

  adminToken = await login(app, admin.email);
  superToken = await login(app, superUser.email);
  leaderToken = await login(app, leader.email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("GET /api/v1/seasons/:id/roster (D-16.11)", () => {
  it("lists ACTIVE enrolments of live students with this season's group and any other-season group", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/roster`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const byId = new Map(res.body.data.roster.map((r: { userId: number }) => [r.userId, r]));
    expect([...byId.keys()].sort()).toEqual([studentAId, studentBId].sort());
    expect(byId.get(studentAId)).toMatchObject({ groupId: groupOneId, groupName: "Group One", otherSeasonGroup: null });
    expect(byId.get(studentBId)).toMatchObject({
      groupId: null,
      groupName: null,
      otherSeasonGroup: { groupName: "Foreign Group", seasonCode: otherSeasonCode },
    });
  });

  it("is season-admin only — a leader in the season is refused (spec 05 §4)", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/roster`)
      .set("authorization", `Bearer ${leaderToken}`);
    expect(res.status).toBe(403);
  });

  it("is 404 for a season that does not exist", async () => {
    const res = await request(app)
      .get("/api/v1/seasons/2147480000/roster")
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/v1/seasons/:id/group-assignments (D-16.12)", () => {
  it("assigns, unassigns, skips non-ACTIVE, and reports what it WROTE", async () => {
    const res = await request(app)
      .put(`/api/v1/seasons/${seasonId}/group-assignments`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({
        assignments: [
          { studentUserId: studentAId, groupId: groupTwoId },
          { studentUserId: studentBId, groupId: null },
          { studentUserId: withdrawnId, groupId: groupOneId },
          { studentUserId: removedId, groupId: groupOneId },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.data.assigned).toBe(1);
    expect(res.body.data.unassigned).toBe(1);
    expect([...res.body.data.skippedStudentIds].sort()).toEqual([withdrawnId, removedId].sort());

    const a = await db.seasonEnrollment.findUnique({
      where: { studentUserId_seasonId: { studentUserId: studentAId, seasonId } },
      select: { groupId: true, status: true },
    });
    expect(a).toEqual({ groupId: groupTwoId, status: "ACTIVE" });
    expect(await db.groupStudent.findUnique({ where: { studentUserId: studentAId }, select: { groupId: true } }))
      .toEqual({ groupId: groupTwoId });

    // Unassigning B here must NOT touch B's membership in the other season's
    // group: only this season's GroupStudent row is removed.
    expect(await db.groupStudent.findUnique({ where: { studentUserId: studentBId }, select: { groupId: true } }))
      .toEqual({ groupId: foreignGroupId });

    expect(await db.groupStudent.count({ where: { studentUserId: withdrawnId } })).toBe(0);
    const w = await db.seasonEnrollment.findUnique({
      where: { studentUserId_seasonId: { studentUserId: withdrawnId, seasonId } },
      select: { groupId: true, status: true },
    });
    // Skipped, and its history untouched (v1's form would have resurrected it — spec 05 R21).
    expect(w).toEqual({ groupId: null, status: "WITHDRAWN" });
  });

  it("assigning a student who sits in another season's group moves their GroupStudent row (R1, Plan 18 item)", async () => {
    const res = await request(app)
      .put(`/api/v1/seasons/${seasonId}/group-assignments`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ assignments: [{ studentUserId: studentBId, groupId: groupOneId }] });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ assigned: 1, unassigned: 0, skippedStudentIds: [] });
    expect(await db.groupStudent.findUnique({ where: { studentUserId: studentBId }, select: { groupId: true } }))
      .toEqual({ groupId: groupOneId });
  });

  it("refuses the WHOLE batch when any group is outside the season — nothing partial lands", async () => {
    const before = await db.seasonEnrollment.findUnique({
      where: { studentUserId_seasonId: { studentUserId: studentAId, seasonId } },
      select: { groupId: true },
    });
    const res = await request(app)
      .put(`/api/v1/seasons/${seasonId}/group-assignments`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({
        assignments: [
          { studentUserId: studentAId, groupId: groupOneId },
          { studentUserId: studentBId, groupId: foreignGroupId },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("group_outside_season");
    const after = await db.seasonEnrollment.findUnique({
      where: { studentUserId_seasonId: { studentUserId: studentAId, seasonId } },
      select: { groupId: true },
    });
    expect(after).toEqual(before);
  });

  it("is idempotent", async () => {
    const body = { assignments: [{ studentUserId: studentAId, groupId: groupOneId }] };
    const first = await request(app)
      .put(`/api/v1/seasons/${seasonId}/group-assignments`)
      .set("authorization", `Bearer ${adminToken}`)
      .send(body);
    const second = await request(app)
      .put(`/api/v1/seasons/${seasonId}/group-assignments`)
      .set("authorization", `Bearer ${adminToken}`)
      .send(body);
    expect(first.body.data.assigned).toBe(1);
    expect(second.body.data.assigned).toBe(1);
    expect(await db.groupStudent.count({ where: { studentUserId: studentAId } })).toBe(1);
  });

  it("refuses a leader, a duplicate student, and a malformed body", async () => {
    const leader = await request(app)
      .put(`/api/v1/seasons/${seasonId}/group-assignments`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ assignments: [] });
    expect(leader.status).toBe(403);

    const dup = await request(app)
      .put(`/api/v1/seasons/${seasonId}/group-assignments`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ assignments: [{ studentUserId: studentAId, groupId: null }, { studentUserId: studentAId, groupId: groupOneId }] });
    expect(dup.status).toBe(400);

    const junk = await request(app)
      .put(`/api/v1/seasons/${seasonId}/group-assignments`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ assignments: "everyone" });
    expect(junk.status).toBe(400);
  });
});
