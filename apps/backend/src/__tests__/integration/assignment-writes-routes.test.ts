import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { assignmentDetailSchema } from "../../../../../packages/shared/src/index";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

// 60s: the shared Neon staging database autosuspends, and beforeAll performs
// many sequential writes.
jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let otherSeasonId: number;
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
  await cleanupTestData();

  seasonId = (await createTestSeason()).id;
  otherSeasonId = (await createTestSeason({ year: 2100 })).id;

  const superUser = await createTestUser("super", "SUPER");
  const admin = await createTestUser("admin", "ADMIN");
  const otherAdmin = await createTestUser("other-admin", "ADMIN");
  const leader = await createTestUser("leader", "LEADER");
  const studentA = await createTestUser("student-a", "STUDENT");
  const studentB = await createTestUser("student-b", "STUDENT");
  const optedOut = await createTestUser("opted-out", "STUDENT");
  const withdrawn = await createTestUser("withdrawn", "STUDENT");
  const moved = await createTestUser("moved", "STUDENT");
  superId = superUser.id;
  adminId = admin.id;
  studentAId = studentA.id;
  studentBId = studentB.id;
  optedOutId = optedOut.id;
  withdrawnId = withdrawn.id;
  movedId = moved.id;

  // Grants must exist before login: the token carries seasonAdminIds.
  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  await db.seasonAdmin.create({ data: { seasonId: otherSeasonId, userId: otherAdmin.id } });

  groupAId = (
    await db.group.create({
      data: {
        seasonId,
        name: "Group A",
        students: { create: [{ studentUserId: studentA.id }, { studentUserId: optedOut.id }] },
      },
      select: { id: true },
    })
  ).id;
  groupBId = (
    await db.group.create({
      data: { seasonId, name: "Group B", students: { create: { studentUserId: studentB.id } } },
      select: { id: true },
    })
  ).id;
  // The moved student's ONE GroupStudent row (unique per student, database-
  // wide) points at another season's group. Their enrolment in THIS season
  // records Group A. Ruling C9: this season's targeting must follow the
  // enrolment — GroupStudent would leave them un-notified.
  otherGroupId = (
    await db.group.create({
      data: { seasonId: otherSeasonId, name: "Elsewhere", students: { create: { studentUserId: moved.id } } },
      select: { id: true },
    })
  ).id;
  await db.groupLeader.create({ data: { groupId: groupAId, userId: leader.id } });

  await db.seasonEnrollment.createMany({
    data: [
      { seasonId, studentUserId: studentA.id, groupId: groupAId, status: "ACTIVE" },
      { seasonId, studentUserId: optedOut.id, groupId: groupAId, status: "ACTIVE" },
      { seasonId, studentUserId: moved.id, groupId: groupAId, status: "ACTIVE" },
      { seasonId, studentUserId: studentB.id, groupId: groupBId, status: "ACTIVE" },
      { seasonId, studentUserId: withdrawn.id, groupId: groupBId, status: "WITHDRAWN" },
    ],
  });
  await db.notificationPreference.create({ data: { userId: optedOut.id, assignmentCreated: false } });

  sessionId = (
    await db.session.create({
      data: { seasonId, title: "Linked", startsAt: new Date("2099-03-01T18:00:00.000Z"), durationMinutes: 60 },
      select: { id: true },
    })
  ).id;
  otherSessionId = (
    await db.session.create({
      data: {
        seasonId: otherSeasonId,
        title: "Not this season",
        startsAt: new Date("2100-03-01T18:00:00.000Z"),
        durationMinutes: 60,
      },
      select: { id: true },
    })
  ).id;

  superToken = await login(app, superUser.email);
  adminToken = await login(app, admin.email);
  otherAdminToken = await login(app, otherAdmin.email);
  leaderToken = await login(app, leader.email);
  studentToken = await login(app, studentA.email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

const body = (over: Record<string, unknown> = {}) => ({
  title: "Week 4 reflection",
  description: "Write a page.",
  dueDay: "2099-03-10",
  dueTime: "23:59",
  sessionId: null,
  type: "STANDARD",
  forumMinWords: null,
  forumAllowComments: false,
  maxFileSizeMb: 10,
  allowedMimeCategories: ["pdf"],
  isAllGroups: true,
  groupIds: [],
  ...over,
});

function create(over: Record<string, unknown> = {}, token = adminToken, season = seasonId) {
  return request(app)
    .post(`/api/v1/seasons/${season}/assignments`)
    .set("authorization", `Bearer ${token}`)
    .send(body(over));
}

function notificationsFor(userId: number, assignmentId: number) {
  return db.notification.findMany({
    where: { userId, type: "ASSIGNMENT_CREATED", link: `/student/assignments/${assignmentId}` },
    select: { title: true, body: true, link: true },
  });
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

  it("applies the FORUM/STANDARD coercion on write (R14–R16)", async () => {
    const forum = await create({
      type: "FORUM", forumMinWords: 120, forumAllowComments: true, maxFileSizeMb: 20,
    });
    const row = await db.assignment.findUnique({
      where: { id: forum.body.data.id },
      select: { forumMinWords: true, forumAllowComments: true, maxFileSizeMb: true, allowedMimeCategories: true },
    });
    expect(row).toEqual({ forumMinWords: 120, forumAllowComments: true, maxFileSizeMb: null, allowedMimeCategories: [] });
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

describe("PATCH /api/v1/assignments/:id", () => {
  function patch(id: number, over: Record<string, unknown> = {}, token = adminToken) {
    return request(app)
      .patch(`/api/v1/assignments/${id}`)
      .set("authorization", `Bearer ${token}`)
      .send(body(over));
  }

  it("replaces every field wholesale, keeps the season, stamps updatedById (R67, R68, R71)", async () => {
    const made = await create({ isAllGroups: false, groupIds: [groupAId] }, superToken);
    const id = made.body.data.id as number;

    const res = await patch(id, {
      title: "Renamed",
      dueDay: null,
      type: "FORUM",
      forumMinWords: 120,
      forumAllowComments: true,
      maxFileSizeMb: 20,
      allowedMimeCategories: ["image"],
      sessionId,
      isAllGroups: true,
      // Not a field: an assignment never moves season. Stripped, not honoured.
      seasonId: otherSeasonId,
    });

    expect(res.status).toBe(200);
    expect(assignmentDetailSchema.safeParse(res.body.data).success).toBe(true);
    const row = await db.assignment.findUnique({
      where: { id },
      select: {
        seasonId: true, title: true, dueAt: true, type: true, forumMinWords: true,
        forumAllowComments: true, maxFileSizeMb: true, allowedMimeCategories: true,
        isAllGroups: true, sessionId: true, createdById: true, updatedById: true,
        targets: { select: { groupId: true } },
      },
    });
    expect(row).toEqual({
      seasonId, title: "Renamed", dueAt: null, type: "FORUM", forumMinWords: 120,
      forumAllowComments: true, maxFileSizeMb: null, allowedMimeCategories: [],
      isAllGroups: true, sessionId, createdById: superId, updatedById: adminId,
      targets: [], // R69: targeting replaced, not merged
    });
  });

  it("notifies only students NEWLY targeted by an edit — nobody twice (spec §10 item 5)", async () => {
    const made = await create({ title: "Retarget", isAllGroups: false, groupIds: [groupAId] });
    const id = made.body.data.id as number;
    expect(await notificationsFor(studentAId, id)).toHaveLength(1);
    expect(await notificationsFor(studentBId, id)).toHaveLength(0);

    const widened = await patch(id, { title: "Retarget", isAllGroups: false, groupIds: [groupAId, groupBId] });
    expect(widened.status).toBe(200);
    expect(await notificationsFor(studentBId, id)).toHaveLength(1); // newly targeted
    expect(await notificationsFor(studentAId, id)).toHaveLength(1); // not re-notified

    // Groups A+B already cover every ACTIVE enrollee: going whole-season adds nobody.
    await patch(id, { title: "Retarget", isAllGroups: true });
    expect(await notificationsFor(studentAId, id)).toHaveLength(1);
    expect(await notificationsFor(studentBId, id)).toHaveLength(1);
    expect(await notificationsFor(withdrawnId, id)).toHaveLength(0);
  });

  it("accepts a repeated group id instead of failing the transaction (R70)", async () => {
    const made = await create();
    const res = await patch(made.body.data.id, { isAllGroups: false, groupIds: [groupAId, groupAId] });
    expect(res.status).toBe(200);
    expect(res.body.data.groupIds).toEqual([groupAId]);
  });

  it("allows editing after submissions exist (R72)", async () => {
    const made = await create();
    const id = made.body.data.id as number;
    await db.submission.create({
      data: { assignmentId: id, studentUserId: studentAId, publicId: `space-v2-test-e${id}`, status: "SUBMITTED" },
    });
    const res = await patch(id, { title: "Typo fixed" });
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe("Typo fixed");
  });

  it("leaves targeting untouched when a ref is refused", async () => {
    const made = await create({ isAllGroups: false, groupIds: [groupAId] });
    const id = made.body.data.id as number;
    const res = await patch(id, { isAllGroups: false, groupIds: [otherGroupId] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_group");
    const targets = await db.assignmentTarget.findMany({ where: { assignmentId: id }, select: { groupId: true } });
    expect(targets).toEqual([{ groupId: groupAId }]);
  });

  it("refuses non-admins of the assignment's season", async () => {
    const made = await create();
    for (const token of [otherAdminToken, leaderToken, studentToken]) {
      const res = await patch(made.body.data.id, { title: "Nope" }, token);
      expect(res.status).toBe(403);
    }
  });

  it("returns 404 for a soft-deleted assignment (closes R79) and for a missing one; 400 for a bad id", async () => {
    const made = await create();
    const id = made.body.data.id as number;
    await db.assignment.update({ where: { id }, data: { deletedAt: new Date() } });
    const refused = await patch(id, { title: "Changed after delete" });
    expect(refused.status).toBe(404);
    // The refusal must come before the write: a 404 that still updated the
    // deleted row would pass a status-only check (the final reload filters it).
    const row = await db.assignment.findUnique({ where: { id }, select: { title: true } });
    expect(row?.title).toBe("Week 4 reflection");
    expect((await patch(2147483000)).status).toBe(404);
    const bad = await request(app)
      .patch("/api/v1/assignments/abc")
      .set("authorization", `Bearer ${adminToken}`)
      .send(body());
    expect(bad.status).toBe(400);
  });
});

describe("DELETE /api/v1/assignments/:id", () => {
  function del(id: number, token = adminToken) {
    return request(app).delete(`/api/v1/assignments/${id}`).set("authorization", `Bearer ${token}`);
  }

  it("soft-deletes an untouched assignment; it disappears from every read; targets stay (R75, R76)", async () => {
    const made = await create({ isAllGroups: false, groupIds: [groupAId] });
    const id = made.body.data.id as number;
    const notifiedBefore = await db.notification.count({ where: { link: `/student/assignments/${id}` } });

    const res = await del(id);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ deleted: true });

    const row = await db.assignment.findUnique({ where: { id }, select: { deletedAt: true, updatedById: true } });
    expect(row?.deletedAt).not.toBeNull();
    expect(row?.updatedById).toBe(adminId);
    expect(await db.assignmentTarget.count({ where: { assignmentId: id } })).toBe(1);

    const detail = await request(app).get(`/api/v1/assignments/${id}`).set("authorization", `Bearer ${adminToken}`);
    expect(detail.status).toBe(404);
    const list = await request(app)
      .get(`/api/v1/seasons/${seasonId}/assignments`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(list.body.data.assignments.map((a: { id: number }) => a.id)).not.toContain(id);
    // R66: deleting notifies nobody.
    expect(await db.notification.count({ where: { link: `/student/assignments/${id}` } })).toBe(notifiedBefore);
  });

  it("refuses while any submission exists — even a draft — and leaves the row live (§10 item 4)", async () => {
    const made = await create();
    const id = made.body.data.id as number;
    await db.submission.create({
      data: { assignmentId: id, studentUserId: studentAId, publicId: `space-v2-test-d${id}`, status: "DRAFT" },
    });
    const res = await del(id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("has_submissions");
    const row = await db.assignment.findUnique({ where: { id }, select: { deletedAt: true } });
    expect(row?.deletedAt).toBeNull();
  });

  it("cannot delete twice (closes R79), and 404s a missing id", async () => {
    const made = await create();
    const id = made.body.data.id as number;
    expect((await del(id)).status).toBe(200);
    expect((await del(id)).status).toBe(404);
    expect((await del(2147483000)).status).toBe(404);
  });

  it("refuses non-admins of the assignment's season", async () => {
    const made = await create();
    for (const token of [otherAdminToken, leaderToken, studentToken]) {
      expect((await del(made.body.data.id, token)).status).toBe(403);
    }
  });
});
