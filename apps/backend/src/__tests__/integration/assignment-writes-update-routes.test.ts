import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { assignmentDetailSchema } from "../../../../../packages/shared/src/index";
import { cleanupTestData } from "./fixtures";
import { body, notificationsFor, seedAssignmentWriteFixtures } from "./assignment-writes-setup";

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
let superId: number;
let adminId: number;
let studentAId: number;
let studentBId: number;
let withdrawnId: number;
let superToken: string;
let adminToken: string;
let otherAdminToken: string;
let leaderToken: string;
let studentToken: string;

beforeAll(async () => {
  ({
    seasonId,
    otherSeasonId,
    groupAId,
    groupBId,
    otherGroupId,
    sessionId,
    superId,
    adminId,
    studentAId,
    studentBId,
    withdrawnId,
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

describe("PATCH /api/v1/assignments/:id", () => {
  function patch(id: number, over: Record<string, unknown> = {}, token = adminToken) {
    return request(app).patch(`/api/v1/assignments/${id}`).set("authorization", `Bearer ${token}`).send(body(over));
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
        seasonId: true,
        title: true,
        dueAt: true,
        type: true,
        forumMinWords: true,
        forumAllowComments: true,
        maxFileSizeMb: true,
        allowedMimeCategories: true,
        isAllGroups: true,
        sessionId: true,
        createdById: true,
        updatedById: true,
        targets: { select: { groupId: true } },
      },
    });
    expect(row).toEqual({
      seasonId,
      title: "Renamed",
      dueAt: null,
      type: "FORUM",
      forumMinWords: 120,
      forumAllowComments: true,
      maxFileSizeMb: null,
      allowedMimeCategories: [],
      isAllGroups: true,
      sessionId,
      createdById: superId,
      updatedById: adminId,
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
