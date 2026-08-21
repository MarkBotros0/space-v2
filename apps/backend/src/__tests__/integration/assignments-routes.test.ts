import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

jest.setTimeout(30000);

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
let studentUserId: number;

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

  superToken = await login(app, superUser.email);
  studentToken = await login(app, student.email);
  otherStudentToken = await login(app, otherStudent.email);
  outsiderToken = await login(app, outsider.email);
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
      isAllGroups: true,
      submissionCount: 0,
      // Both enrolled students.
      expectedCount: 2,
      seasonCode: expect.any(String),
    });

    const targeted = res.body.data.assignments.find(
      (a: { id: number }) => a.id === targetedAssignmentId,
    );
    // Only Group B's single member.
    expect(targeted.expectedCount).toBe(1);
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
    expect(res.body.data.groupIds).toEqual([groupBId]);
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
