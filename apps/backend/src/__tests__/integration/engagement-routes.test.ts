import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { newPublicId } from "../../lib/public-id";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let earlyStudentId: number;
let lateJoinerId: number;
let otherGroupStudentId: number;
let otherSeasonId: number;
let superToken: string;
let leaderToken: string;
let adminAToken: string;
let earlyStudentToken: string;
let lateJoinerToken: string;

beforeAll(async () => {
  await cleanupTestData();

  const season = await createTestSeason();
  seasonId = season.id;

  const early = await createTestUser("eng-early", "STUDENT");
  const late = await createTestUser("eng-late", "STUDENT");
  const otherGroup = await createTestUser("eng-other", "STUDENT");
  const leader = await createTestUser("eng-leader", "LEADER");
  const superUser = await createTestUser("eng-super", "SUPER");
  earlyStudentId = early.id;
  lateJoinerId = late.id;
  otherGroupStudentId = otherGroup.id;

  const groupA = await db.group.create({
    data: { seasonId, name: "Group A", leaders: { create: { userId: leader.id } } },
    select: { id: true },
  });
  const groupB = await db.group.create({ data: { seasonId, name: "Group B" }, select: { id: true } });

  // Four past sessions. The late joiner enrols after the first two.
  const sessionRows = await Promise.all(
    ["2020-01-01", "2020-01-08", "2020-01-15", "2020-01-22"].map((d) =>
      db.session.create({
        data: {
          seasonId,
          title: `Session ${d}`,
          startsAt: new Date(`${d}T18:00:00.000Z`),
          durationMinutes: 60,
        },
        select: { id: true },
      }),
    ),
  );

  await db.seasonEnrollment.createMany({
    data: [
      {
        seasonId,
        studentUserId: early.id,
        groupId: groupA.id,
        status: "ACTIVE",
        enrolledAt: new Date("2019-12-01T00:00:00.000Z"),
      },
      {
        seasonId,
        studentUserId: late.id,
        groupId: groupA.id,
        status: "ACTIVE",
        enrolledAt: new Date("2020-01-10T00:00:00.000Z"),
      },
      {
        seasonId,
        studentUserId: otherGroup.id,
        groupId: groupB.id,
        status: "ACTIVE",
        enrolledAt: new Date("2019-12-01T00:00:00.000Z"),
      },
    ],
  });

  // early: present at 2 of 4 → 50%. late: present at 1 of the 2 sessions that
  // ran after they enrolled → 50% under the fixed denominator, 25% under v1's.
  await db.attendance.createMany({
    data: [
      { sessionId: sessionRows[0]!.id, studentUserId: early.id, status: "PRESENT" },
      { sessionId: sessionRows[1]!.id, studentUserId: early.id, status: "LATE" },
      { sessionId: sessionRows[2]!.id, studentUserId: early.id, status: "ABSENT" },
      { sessionId: sessionRows[2]!.id, studentUserId: late.id, status: "PRESENT" },
      { sessionId: sessionRows[3]!.id, studentUserId: late.id, status: "ABSENT" },
    ],
  });

  // Two assignments: one for everyone, one targeted at Group A only.
  const allGroups = await db.assignment.create({
    data: { seasonId, title: "For all", isAllGroups: true },
    select: { id: true },
  });
  const groupAOnly = await db.assignment.create({
    data: {
      seasonId,
      title: "For group A",
      isAllGroups: false,
      targets: { create: { groupId: groupA.id } },
    },
    select: { id: true },
  });

  // early completes both → 100%. late completes neither → 0%.
  await db.submission.createMany({
    data: [
      {
        assignmentId: allGroups.id,
        studentUserId: early.id,
        publicId: newPublicId(),
        status: "SUBMITTED",
      },
      {
        assignmentId: groupAOnly.id,
        studentUserId: early.id,
        publicId: newPublicId(),
        status: "REVIEWED",
      },
    ],
  });

  // A second season the early student is also enrolled in, plus an admin of
  // the FIRST season only. canViewStudent admits that admin (they share
  // season A with the student), which is exactly why the score itself must be
  // gated per season (ruling C8): passing the student gate must not unlock
  // the student's numbers in a season the caller has no scope over.
  const adminA = await createTestUser("eng-admin-a", "ADMIN");
  await db.seasonAdmin.create({ data: { seasonId, userId: adminA.id } });
  const seasonB = await createTestSeason();
  otherSeasonId = seasonB.id;
  await db.seasonEnrollment.create({
    data: {
      seasonId: seasonB.id,
      studentUserId: early.id,
      status: "ACTIVE",
      // Earlier than the season-A enrolment, so the default (latest ACTIVE)
      // season for every caller below stays season A.
      enrolledAt: new Date("2019-11-01T00:00:00.000Z"),
    },
  });

  superToken = await login(app, superUser.email);
  leaderToken = await login(app, leader.email);
  adminAToken = await login(app, adminA.email);
  earlyStudentToken = await login(app, early.email);
  lateJoinerToken = await login(app, late.email);
  expect(groupB.id).not.toBe(groupA.id);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("GET /api/v1/seasons/:id/engagement", () => {
  it("returns one row per active enrolment with the composite and the flag", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/engagement`)
      .set("authorization", `Bearer ${superToken}`);

    expect(res.status).toBe(200);
    const rows: Array<{ studentUserId: number }> = res.body.data.students;
    expect(rows).toHaveLength(3);

    const early = res.body.data.students.find(
      (r: { studentUserId: number }) => r.studentUserId === earlyStudentId,
    );
    // 2 of 4 present (PRESENT and LATE both count — R54) → 50%.
    // 2 of 2 assignments done → 100%. Composite = round(50*0.5 + 100*0.5) = 75.
    expect(early).toMatchObject({
      attendanceTotal: 4,
      attendancePresent: 2,
      attendancePct: 50,
      submissionsExpected: 2,
      submissionsCompleted: 2,
      submissionPct: 100,
      score: 75,
      // Component-wise: attendance is under 60 even though the composite is 75.
      // v1's reports screen called this student "Medium" (D7).
      atRisk: true,
      groupName: "Group A",
    });
  });

  it("scores a mid-season joiner only against sessions after they enrolled (R55)", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/engagement`)
      .set("authorization", `Bearer ${superToken}`);

    const late = res.body.data.students.find(
      (r: { studentUserId: number }) => r.studentUserId === lateJoinerId,
    );
    // Two sessions ran after 2020-01-10; one attended. v1 divided by all four
    // and reported 25%, the largest source of spurious at-risk flags.
    expect(late).toMatchObject({ attendanceTotal: 2, attendancePresent: 1, attendancePct: 50 });
  });

  it("counts a group-targeted assignment only for that group's students (C9)", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/engagement`)
      .set("authorization", `Bearer ${superToken}`);

    const other = res.body.data.students.find(
      (r: { studentUserId: number }) => r.studentUserId === otherGroupStudentId,
    );
    // Group B: only the isAllGroups assignment is expected of them.
    expect(other).toMatchObject({ submissionsExpected: 1, submissionsCompleted: 0 });
  });

  it("narrows a LEADER to the students in the groups they lead (ruling C8 #2)", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/engagement`)
      .set("authorization", `Bearer ${leaderToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.students.map((r: { studentUserId: number }) => r.studentUserId);
    expect(ids).toEqual(expect.arrayContaining([earlyStudentId, lateJoinerId]));
    expect(ids).not.toContain(otherGroupStudentId);
  });

  it("refuses a STUDENT the cohort view", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/engagement`)
      .set("authorization", `Bearer ${earlyStudentToken}`);
    expect(res.status).toBe(403);
  });
});

describe("GET /api/v1/students/:id/engagement", () => {
  it("gives staff the full score", async () => {
    const res = await request(app)
      .get(`/api/v1/students/${earlyStudentId}/engagement`)
      .set("authorization", `Bearer ${superToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ score: 75, attendancePct: 50, atRisk: true });
  });

  it("gives a student their own components and NOT the composite (D9)", async () => {
    const res = await request(app)
      .get(`/api/v1/students/${earlyStudentId}/engagement`)
      .set("authorization", `Bearer ${earlyStudentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ attendancePct: 50, submissionPct: 100 });
    // A single "engagement: 75%" figure shown to a young person is a product
    // decision nobody has made; the components are facts they can act on.
    expect(res.body.data.score).toBeUndefined();
    expect(res.body.data.atRisk).toBeUndefined();
  });

  it("refuses a student another student's engagement", async () => {
    const res = await request(app)
      .get(`/api/v1/students/${earlyStudentId}/engagement`)
      .set("authorization", `Bearer ${lateJoinerToken}`);
    expect(res.status).toBe(403);
  });

  it("refuses an admin of season A who names season B — scope is per season, not per student (C8)", async () => {
    const res = await request(app)
      .get(`/api/v1/students/${earlyStudentId}/engagement?seasonId=${otherSeasonId}`)
      .set("authorization", `Bearer ${adminAToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
  });

  it("gives the same admin the season they DO administer", async () => {
    const res = await request(app)
      .get(`/api/v1/students/${earlyStudentId}/engagement?seasonId=${seasonId}`)
      .set("authorization", `Bearer ${adminAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ seasonId, score: 75 });
  });

  it("refuses a leader a season in which they lead none of the student's groups", async () => {
    const res = await request(app)
      .get(`/api/v1/students/${earlyStudentId}/engagement?seasonId=${otherSeasonId}`)
      .set("authorization", `Bearer ${leaderToken}`);
    expect(res.status).toBe(403);
  });

  it("404s when the student has no enrolment to score", async () => {
    const orphan = await createTestUser("eng-orphan", "STUDENT");
    const res = await request(app)
      .get(`/api/v1/students/${orphan.id}/engagement`)
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("no_season");
  });
});
