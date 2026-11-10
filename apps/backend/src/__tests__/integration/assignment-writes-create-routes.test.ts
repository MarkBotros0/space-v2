import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { assignmentDetailSchema } from "../../../../../packages/shared/src/index";
import { cleanupTestData, createTestUser } from "./fixtures";
import { body, notificationsFor, seedAssignmentWriteFixtures } from "./assignment-writes-setup";

// 60s: the shared Neon staging database autosuspends, and beforeAll performs
// many sequential writes.
jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let groupAId: number;
let groupBId: number;
let otherGroupId: number;
let sessionId: number;
let otherSessionId: number;
let superId: number;
let adminId: number;
let studentAId: number;
let studentBId: number;
let optedOutId: number;
let withdrawnId: number;
let movedId: number;
let superToken: string;
let adminToken: string;
let otherAdminToken: string;
let leaderToken: string;
let studentToken: string;

beforeAll(async () => {
  ({
    seasonId,
    groupAId,
    groupBId,
    otherGroupId,
    sessionId,
    otherSessionId,
    superId,
    adminId,
    studentAId,
    studentBId,
    optedOutId,
    withdrawnId,
    movedId,
    superToken,
    adminToken,
    otherAdminToken,
    leaderToken,
    studentToken,
  } = await seedAssignmentWriteFixtures(app));
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

function create(over: Record<string, unknown> = {}, token = adminToken, season = seasonId) {
  return request(app)
    .post(`/api/v1/seasons/${season}/assignments`)
    .set("authorization", `Bearer ${token}`)
    .send(body(over));
}

describe("POST /api/v1/seasons/:id/assignments", () => {
  it("creates a targeted assignment and returns the full detail, parsed by the shared schema", async () => {
    const res = await create({ isAllGroups: false, groupIds: [groupAId], sessionId });

    expect(res.status).toBe(201);
    expect(assignmentDetailSchema.safeParse(res.body.data).success).toBe(true);
    expect(res.body.data).toMatchObject({
      seasonId,
      title: "Week 4 reflection",
      sessionId,
      sessionTitle: "Linked",
      isAllGroups: false,
      groupIds: [groupAId],
      // 23:59 on 10 March, Cairo (UTC+2) — composed on the server (C2).
      dueAt: "2099-03-10T21:59:00.000Z",
      dueOrgDay: "2099-03-10",
      dueOrgTime: "23:59",
      mySubmission: null,
      canManage: true,
    });

    const row = await db.assignment.findUnique({
      where: { id: res.body.data.id },
      select: { createdById: true, updatedById: true, targets: { select: { groupId: true } } },
    });
    expect(row).toEqual({ createdById: adminId, updatedById: adminId, targets: [{ groupId: groupAId }] });
  });

  it("composes the deadline on the org clock across DST: 23:59 in May is 20:59Z (UTC+3)", async () => {
    const res = await create({ dueDay: "2099-05-01" });
    expect(res.status).toBe(201);
    expect(res.body.data.dueAt).toBe("2099-05-01T20:59:00.000Z");
    expect(res.body.data.dueOrgTime).toBe("23:59");
  });

  it("notifies each targeted student once, with v1's exact link and org-time body (X1, C2)", async () => {
    const res = await create({ title: "Targeted", isAllGroups: false, groupIds: [groupAId] });
    const id = res.body.data.id as number;

    expect(await notificationsFor(studentAId, id)).toEqual([
      {
        title: "New assignment: Targeted",
        body: "Due Mar 10, 2099, 11:59 PM",
        link: `/student/assignments/${id}`,
      },
    ]);
    expect(await notificationsFor(studentBId, id)).toEqual([]); // Group B not targeted
    // BEHAVIOUR CHANGE, spec D4 (Plan 13): the opt-out suppresses outbound
    // channels only; the in-app row is history and is always written.
    expect(await notificationsFor(optedOutId, id)).toEqual([
      {
        title: "New assignment: Targeted",
        body: "Due Mar 10, 2099, 11:59 PM",
        link: `/student/assignments/${id}`,
      },
    ]);
  });

  it("notifies through the season enrolment, not GroupStudent (C9)", async () => {
    const res = await create({ title: "Moved", isAllGroups: false, groupIds: [groupAId] });
    expect(await notificationsFor(movedId, res.body.data.id)).toHaveLength(1);
  });

  it("notifies every ACTIVE enrollee for a whole-season assignment, and omits the body with no due date", async () => {
    const res = await create({ title: "Everyone", dueDay: null });
    const id = res.body.data.id as number;

    expect(await notificationsFor(studentAId, id)).toEqual([
      { title: "New assignment: Everyone", body: null, link: `/student/assignments/${id}` },
    ]);
    expect(await notificationsFor(studentBId, id)).toHaveLength(1);
    expect(await notificationsFor(withdrawnId, id)).toEqual([]); // R61: ACTIVE only
    expect(res.body.data.dueAt).toBeNull();
    expect(res.body.data.dueOrgDay).toBeNull();
  });

  it("notifies no deleted account, though its enrolment is still ACTIVE (Q9)", async () => {
    const gone = await createTestUser("q9-deleted-create", "STUDENT");
    await db.seasonEnrollment.create({
      data: { seasonId, studentUserId: gone.id, groupId: groupAId, status: "ACTIVE" },
    });
    await db.user.update({ where: { id: gone.id }, data: { deletedAt: new Date() } });

    const targeted = await create({ title: "Q9 targeted", isAllGroups: false, groupIds: [groupAId] });
    const everyone = await create({ title: "Q9 everyone" });

    expect(await notificationsFor(gone.id, targeted.body.data.id as number)).toEqual([]);
    expect(await notificationsFor(gone.id, everyone.body.data.id as number)).toEqual([]);
    expect(await notificationsFor(studentAId, targeted.body.data.id as number)).toHaveLength(1);
  });

  it("applies the FORUM/STANDARD coercion on write (R14–R16)", async () => {
    const forum = await create({
      type: "FORUM",
      forumMinWords: 120,
      forumAllowComments: true,
      maxFileSizeMb: 20,
    });
    const row = await db.assignment.findUnique({
      where: { id: forum.body.data.id },
      select: { forumMinWords: true, forumAllowComments: true, maxFileSizeMb: true, allowedMimeCategories: true },
    });
    expect(row).toEqual({
      forumMinWords: 120,
      forumAllowComments: true,
      maxFileSizeMb: null,
      allowedMimeCategories: [],
    });
  });

  it("collapses a repeated group id into one target row (R70)", async () => {
    const res = await create({ isAllGroups: false, groupIds: [groupBId, groupBId] });
    expect(res.status).toBe(201);
    expect(await db.assignmentTarget.count({ where: { assignmentId: res.body.data.id } })).toBe(1);
  });

  it("lets a SUPER create in any season", async () => {
    const res = await create({}, superToken);
    expect(res.status).toBe(201);
    const row = await db.assignment.findUnique({ where: { id: res.body.data.id }, select: { createdById: true } });
    expect(row?.createdById).toBe(superId);
  });

  it("refuses everyone who does not administer the season (v1 canCreateAssignment)", async () => {
    for (const token of [otherAdminToken, leaderToken, studentToken]) {
      const res = await create({}, token);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("forbidden");
    }
  });

  it("refuses another season's group with invalid_group and writes nothing (§10 item 6)", async () => {
    const before = await db.assignment.count({ where: { seasonId } });
    const res = await create({ isAllGroups: false, groupIds: [groupAId, otherGroupId] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_group");
    expect(await db.assignment.count({ where: { seasonId } })).toBe(before);
  });

  it("refuses another season's session with invalid_session (spec §4 item 4)", async () => {
    const res = await create({ sessionId: otherSessionId });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_session");
  });

  it("refuses 'specific groups' with none chosen, and a 161-character title", async () => {
    const empty = await create({ isAllGroups: false, groupIds: [] });
    expect(empty.status).toBe(400);
    expect(empty.body.error).toEqual({
      code: "bad_request",
      message: "groupIds: Choose at least one group, or target the whole season.",
    });
    const long = await create({ title: "x".repeat(161) });
    expect(long.status).toBe(400);
    expect(long.body.error.code).toBe("bad_request");
  });

  it("returns 400 for a bad season id and 404 for a missing season", async () => {
    const bad = await request(app)
      .post("/api/v1/seasons/abc/assignments")
      .set("authorization", `Bearer ${superToken}`)
      .send(body());
    expect(bad.status).toBe(400);
    const missing = await create({}, superToken, 2147483000);
    expect(missing.status).toBe(404);
  });
});
