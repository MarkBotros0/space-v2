import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

// 60s, not the Jest default: the shared Neon staging database autosuspends, so
// the first query after idle costs ~18s and this suite's beforeAll performs
// several sequential writes.
jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let groupAId: number;
let groupBId: number;
let allGroupsAssignmentId: number;
let targetedAssignmentId: number;
let superToken: string;
let studentToken: string;
let otherStudentToken: string;
let outsiderToken: string;
let leaderToken: string;
let movedToken: string;
let studentUserId: number;
let movedUserId: number;

beforeAll(async () => {
  await cleanupTestData();

  const season = await createTestSeason();
  seasonId = season.id;

  const superUser = await createTestUser("super", "SUPER");
  const student = await createTestUser("student", "STUDENT");
  const otherStudent = await createTestUser("other", "STUDENT");
  const outsider = await createTestUser("outsider", "STUDENT");
  studentUserId = student.id;

  const groupA = await db.group.create({
    data: { seasonId, name: "Group A", students: { create: { studentUserId: student.id } } },
    select: { id: true },
  });
  groupAId = groupA.id;
  const groupB = await db.group.create({
    data: { seasonId, name: "Group B", students: { create: { studentUserId: otherStudent.id } } },
    select: { id: true },
  });
  groupBId = groupB.id;

  await db.seasonEnrollment.createMany({
    data: [
      { seasonId, studentUserId: student.id, groupId: groupAId, status: "ACTIVE" },
      { seasonId, studentUserId: otherStudent.id, groupId: groupBId, status: "ACTIVE" },
    ],
  });

  const openToAll = await db.assignment.create({
    data: {
      seasonId,
      title: "Open To All",
      description: "Everyone does this one",
      isAllGroups: true,
      dueAt: new Date("2099-04-01T00:00:00.000Z"),
    },
    select: { id: true },
  });
  allGroupsAssignmentId = openToAll.id;

  const targeted = await db.assignment.create({
    data: {
      seasonId,
      title: "Group B Only",
      isAllGroups: false,
      targets: { create: { groupId: groupBId } },
    },
    select: { id: true },
  });
  targetedAssignmentId = targeted.id;

  // A leader of Group B only, for the tracker's scoping.
  const leader = await createTestUser("leader", "LEADER");
  await db.groupLeader.create({ data: { groupId: groupBId, userId: leader.id } });

  // A student who has since moved on. Their SeasonEnrollment for *this* season
  // still records Group B — the historic, per-season fact — while their single
  // GroupStudent row points at a group in a later season, because that table is
  // unique on studentUserId across the whole database.
  //
  // This is the divergence ruling C9 exists for, and the fixtures above cannot
  // expose it: they keep both tables in agreement, so a GroupStudent-based
  // lookup and a SeasonEnrollment-based one give the same answer.
  const laterSeason = await createTestSeason({ year: 2100 });
  const laterGroup = await db.group.create({
    data: { seasonId: laterSeason.id, name: "Later Group" },
    select: { id: true },
  });
  const moved = await createTestUser("moved", "STUDENT");
  movedUserId = moved.id;
  await db.groupStudent.create({ data: { groupId: laterGroup.id, studentUserId: moved.id } });
  await db.seasonEnrollment.create({
    data: { seasonId, studentUserId: moved.id, groupId: groupBId, status: "ACTIVE" },
  });

  superToken = await login(app, superUser.email);
  studentToken = await login(app, student.email);
  otherStudentToken = await login(app, otherStudent.email);
  outsiderToken = await login(app, outsider.email);
  leaderToken = await login(app, leader.email);
  movedToken = await login(app, moved.email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("GET /api/v1/seasons/:id/assignments", () => {
  it("returns the staff shape with submission and expected counts", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/assignments`)
      .set("authorization", `Bearer ${superToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.assignments).toHaveLength(2);
    const all = res.body.data.assignments.find(
      (a: { id: number }) => a.id === allGroupsAssignmentId,
    );
    expect(all).toEqual({
      id: allGroupsAssignmentId,
      title: "Open To All",
      dueAt: expect.any(String),
      // Due 2099 — derived server-side, never by the reader (ruling C4).
      isOverdue: false,
      isAllGroups: true,
      targetGroupIds: [],
      submissionCount: 0,
      // All three ACTIVE enrolments in the season.
      expectedCount: 3,
      seasonCode: expect.any(String),
    });

    const targeted = res.body.data.assignments.find(
      (a: { id: number }) => a.id === targetedAssignmentId,
    );
    // Group B's two enrolments: the other student, and the moved student whose
    // GroupStudent row points elsewhere. Counting GroupStudent would find one.
    expect(targeted.expectedCount).toBe(2);
    expect(targeted.targetGroupIds).toEqual([groupBId]);
  });

  it("returns the student shape, filtered to assignments that apply to them", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/assignments`)
      .set("authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    // The Group-B-only assignment must not appear for a Group A student.
    expect(res.body.data.assignments).toEqual([
      {
        id: allGroupsAssignmentId,
        title: "Open To All",
        dueAt: expect.any(String),
        isOverdue: false,
        status: "PENDING",
        reviewedAt: null,
      },
    ]);
  });

  it("includes the targeted assignment for the student it targets", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/assignments`)
      .set("authorization", `Bearer ${otherStudentToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.assignments.map((a: { id: number }) => a.id);
    expect(ids).toEqual(expect.arrayContaining([allGroupsAssignmentId, targetedAssignmentId]));
  });

  it("returns 403 for a user with no access to the season", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/assignments`)
      .set("authorization", `Bearer ${outsiderToken}`);
    expect(res.status).toBe(403);
  });
});

describe("GET /api/v1/assignments/:id", () => {
  it("returns detail for a SUPER with mySubmission null", async () => {
    const res = await request(app)
      .get(`/api/v1/assignments/${allGroupsAssignmentId}`)
      .set("authorization", `Bearer ${superToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: allGroupsAssignmentId,
      seasonId,
      title: "Open To All",
      description: "Everyone does this one",
      isAllGroups: true,
      type: "STANDARD",
      groupIds: [],
      mySubmission: null,
    });
  });

  it("returns a student's own submission summary", async () => {
    const submission = await db.submission.create({
      data: {
        assignmentId: allGroupsAssignmentId,
        studentUserId,
        publicId: `space-v2-test-sub-${allGroupsAssignmentId}`,
        status: "DRAFT",
      },
      select: { publicId: true },
    });

    const res = await request(app)
      .get(`/api/v1/assignments/${allGroupsAssignmentId}`)
      .set("authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.mySubmission).toMatchObject({
      publicId: submission.publicId,
      status: "DRAFT",
      submittedAt: null,
      reviewedAt: null,
    });
  });

  it("refuses a student an assignment targeted at another group", async () => {
    const res = await request(app)
      .get(`/api/v1/assignments/${targetedAssignmentId}`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
  });

  it("allows the targeted group's student through", async () => {
    const res = await request(app)
      .get(`/api/v1/assignments/${targetedAssignmentId}`)
      .set("authorization", `Bearer ${otherStudentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(targetedAssignmentId);
    // groupIds is null here by design — the targeting check that used to need
    // it on the client now runs server-side. See the payload-narrowing test
    // below, which pins both halves of that.
    expect(res.body.data.groupIds).toBeNull();
  });

  it("resolves targeting from the season's enrolment, not the student's current group", async () => {
    // This student's GroupStudent row points at a group in a later season; their
    // enrolment in *this* season records Group B, which the assignment targets.
    // Reading membership from GroupStudent denies them an assignment they were
    // genuinely given — the failure ruling C9 describes.
    const res = await request(app)
      .get(`/api/v1/assignments/${targetedAssignmentId}`)
      .set("authorization", `Bearer ${movedToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(targetedAssignmentId);
  });

  it("withholds the target group ids from a student and sends them to staff", async () => {
    const student = await request(app)
      .get(`/api/v1/assignments/${targetedAssignmentId}`)
      .set("authorization", `Bearer ${otherStudentToken}`);
    expect(student.status).toBe(200);
    expect(student.body.data.groupIds).toBeNull();
    expect(student.body.data.canManage).toBe(false);

    const staff = await request(app)
      .get(`/api/v1/assignments/${targetedAssignmentId}`)
      .set("authorization", `Bearer ${superToken}`);
    expect(staff.body.data.groupIds).toEqual([groupBId]);
    expect(staff.body.data.canManage).toBe(true);
  });

  it("returns 400 for a non-numeric id and 404 for a missing one", async () => {
    const bad = await request(app)
      .get("/api/v1/assignments/abc")
      .set("authorization", `Bearer ${superToken}`);
    expect(bad.status).toBe(400);

    const missing = await request(app)
      .get("/api/v1/assignments/2147483000")
      .set("authorization", `Bearer ${superToken}`);
    expect(missing.status).toBe(404);
  });
});

describe("GET /api/v1/assignments/:id/tracker", () => {
  it("lists every targeted student, including those who have done nothing", async () => {
    const res = await request(app)
      .get(`/api/v1/assignments/${targetedAssignmentId}/tracker`)
      .set("authorization", `Bearer ${superToken}`);

    expect(res.status).toBe(200);
    // Group B holds the other student and the moved student. Neither has a
    // Submission row, and both must still appear — a tracker built from
    // submissions rather than enrolments shows nobody at all.
    expect(res.body.data.rows).toHaveLength(2);
    const ids = res.body.data.rows.map((r: { studentUserId: number }) => r.studentUserId);
    expect(ids).toContain(movedUserId);
    expect(ids).not.toContain(studentUserId);
    expect(res.body.data.rows.every((r: { status: string }) => r.status === "PENDING")).toBe(true);
    expect(res.body.data.expectedCount).toBe(res.body.data.rows.length);
    expect(res.body.data.submittedCount).toBe(0);
  });

  it("narrows the roster to a leader's own groups", async () => {
    // The leader leads Group B. The all-groups assignment covers the whole
    // season, but they may only see their own students' names and addresses.
    const res = await request(app)
      .get(`/api/v1/assignments/${allGroupsAssignmentId}/tracker`)
      .set("authorization", `Bearer ${leaderToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.rows.every((r: { groupId: number }) => r.groupId === groupBId)).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain("space-v2-test-student");
  });

  it("refuses a student outright", async () => {
    const res = await request(app)
      .get(`/api/v1/assignments/${allGroupsAssignmentId}/tracker`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
  });
});
