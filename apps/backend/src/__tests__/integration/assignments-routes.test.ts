import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";
import {
  createAssignmentWithParts,
  seedEssays,
  seedTextWork,
  seedVideoWork,
  setSubmitted,
} from "./assignment-reads-setup";

// 60s, not the Jest default: the first query after idle can be slow and this
// suite's beforeAll performs several sequential writes.
jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let groupAId: number;
let groupBId: number;
let threePartId: number;
let videoPartId: number;
let essayPartId: number;
let forumPartId: number;
let undatedId: number;
let superToken: string;
let studentToken: string;
let otherStudentToken: string;
let outsiderToken: string;
let leaderToken: string;
let movedToken: string;
let studentUserId: number;
let otherStudentUserId: number;
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
  otherStudentUserId = otherStudent.id;

  groupAId = (await db.group.create({ data: { seasonId, name: "Group A" }, select: { id: true } })).id;
  groupBId = (await db.group.create({ data: { seasonId, name: "Group B" }, select: { id: true } })).id;

  await db.seasonEnrollment.createMany({
    data: [
      { seasonId, studentUserId: student.id, groupId: groupAId, status: "ACTIVE" },
      { seasonId, studentUserId: otherStudent.id, groupId: groupBId, status: "ACTIVE" },
    ],
  });

  // Video, essay, forum: the order the admin set.
  const three = await createAssignmentWithParts(
    {
      seasonId,
      title: "Luke 15",
      description: "Watch, write, share",
      dueAt: new Date("2099-04-01T00:00:00.000Z"),
    },
    [
      { kind: "VIDEO", title: "Luke 15 talk", durationSeconds: 1080, questions: 2 },
      { kind: "ESSAY", prompt: "What changed?", minWords: 3, maxWords: 300 },
      { kind: "FORUM", prompt: "Share one idea" },
    ],
  );
  threePartId = three.id;
  [videoPartId, essayPartId, forumPartId] = three.partIds as [number, number, number];
  undatedId = (await createAssignmentWithParts({ seasonId, title: "No date" })).id;

  // A leader of Group B only, for the progress view's scoping.
  const leader = await createTestUser("leader", "LEADER");
  await db.groupLeader.create({ data: { groupId: groupBId, userId: leader.id } });

  // A student who has since moved on: their enrolment for *this* season still
  // records Group B, while their GroupStudent row points at a later season's
  // group. Ruling C9: this season's enrolment is what counts.
  const laterSeason = await createTestSeason({ year: 2100 });
  const laterGroup = await db.group.create({
    data: { seasonId: laterSeason.id, name: "Later Group" },
    select: { id: true },
  });
  const moved = await createTestUser("moved", "STUDENT");
  movedUserId = moved.id;
  await db.groupStudent.create({ data: { groupId: laterGroup.id, seasonId: laterSeason.id, studentUserId: moved.id } });
  await db.seasonEnrollment.create({
    data: { seasonId, studentUserId: moved.id, groupId: groupBId, status: "ACTIVE" },
  });

  // The student: 6 of 18 minutes watched, one of two questions answered, a
  // draft essay inside the range, the forum post up.
  await seedVideoWork(threePartId, videoPartId, student.id, 360, { answered: 1 });
  await seedTextWork(threePartId, essayPartId, student.id, "DRAFT", { text: "I came home again" });
  await seedTextWork(threePartId, forumPartId, student.id, "SUBMITTED");
  // The other student: everything done and submitted, the essay waiting review.
  await seedVideoWork(threePartId, videoPartId, otherStudent.id, 1000, { answered: 2, correct: 1 });
  await seedTextWork(threePartId, essayPartId, otherStudent.id, "SUBMITTED", { text: "The son came home" });
  await seedTextWork(threePartId, forumPartId, otherStudent.id, "SUBMITTED");
  await setSubmitted(threePartId, otherStudent.id, new Date("2099-03-01T10:00:00.000Z"));

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

const get = (path: string, token: string) => request(app).get(`/api/v1${path}`).set("authorization", `Bearer ${token}`);

describe("GET /api/v1/seasons/:id/assignments", () => {
  it("returns the staff shape: every participant expected, submitted counted by Submit", async () => {
    const res = await get(`/seasons/${seasonId}/assignments`, superToken);

    expect(res.status).toBe(200);
    expect(res.body.data.assignments).toHaveLength(2);
    const three = res.body.data.assignments.find((a: { id: number }) => a.id === threePartId);
    expect(three).toEqual({
      id: threePartId,
      title: "Luke 15",
      dueAt: expect.any(String),
      // 2099-04-01T00:00Z is 02:00 on the 1st in Cairo (UTC+2): the org day.
      dueOrgDay: "2099-04-01",
      isOverdue: false,
      partsCount: 3,
      // Only the other student tapped Submit.
      submissionCount: 1,
      // All three ACTIVE enrolments: an assignment is for the whole season.
      expectedCount: 3,
      seasonCode: expect.any(String),
    });
    const undated = res.body.data.assignments.find((a: { id: number }) => a.id === undatedId);
    expect(undated).toMatchObject({ dueOrgDay: null, partsCount: 1, submissionCount: 0, expectedCount: 3 });
  });

  it("gives a student every assignment of the season with how many parts are done", async () => {
    const res = await get(`/seasons/${seasonId}/assignments`, studentToken);

    expect(res.status).toBe(200);
    expect(res.body.data.assignments.map((a: { id: number }) => a.id)).toEqual([threePartId, undatedId]);
    // Video not watched far enough, essay in range (a draft counts before Submit), forum posted.
    expect(res.body.data.assignments[0]).toEqual({
      id: threePartId,
      title: "Luke 15",
      dueAt: expect.any(String),
      dueOrgDay: "2099-04-01",
      isOverdue: false,
      status: "DRAFT",
      reviewedAt: null,
      submittedAt: null,
      partsTotal: 3,
      partsDone: 2,
      returned: false,
    });
    expect(res.body.data.assignments[1]).toMatchObject({ status: "PENDING", partsTotal: 1, partsDone: 0 });
  });

  it("returns 403 for a user with no access to the season", async () => {
    const res = await get(`/seasons/${seasonId}/assignments`, outsiderToken);
    expect(res.status).toBe(403);
  });
});

describe("GET /api/v1/assignments/:id", () => {
  it("returns the detail with parts in order and no `my` for staff", async () => {
    const res = await get(`/assignments/${threePartId}`, superToken);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: threePartId,
      seasonId,
      title: "Luke 15",
      description: "Watch, write, share",
      dueOrgDay: "2099-04-01",
      dueOrgTime: "02:00",
      reminder: { enabled: true, days: 2, anchor: "NEXT_SESSION", time: "09:00" },
      // The season has no session after the assignment was published.
      reminderLine: "No upcoming session yet — no reminder",
      my: null,
      canManage: true,
      readOnly: false,
    });
    expect(res.body.data.parts.map((p: { kind: string }) => p.kind)).toEqual(["VIDEO", "ESSAY", "FORUM"]);
    expect(res.body.data.parts[0]).toMatchObject({ title: "Luke 15 talk", videoId: "dQw4w9WgXcQ", position: 0 });
    expect(res.body.data).not.toHaveProperty("isAllGroups");
    expect(res.body.data).not.toHaveProperty("groupIds");
  });

  it("returns null org due fields when there is no due date", async () => {
    const res = await get(`/assignments/${undatedId}`, superToken);
    expect(res.status).toBe(200);
    expect(res.body.data.dueOrgDay).toBeNull();
    expect(res.body.data.dueOrgTime).toBeNull();
  });

  it("a student sees parts in order with their own progress", async () => {
    const res = await get(`/assignments/${threePartId}`, studentToken);

    expect(res.status).toBe(200);
    expect(res.body.data.canManage).toBe(false);
    expect(res.body.data.my.submittedAt).toBeNull();
    expect(res.body.data.my.parts).toEqual([
      {
        partId: videoPartId,
        kind: "VIDEO",
        status: "IN_PROGRESS",
        video: { watchedSeconds: 360, durationSeconds: 1080, answered: 1, questionCount: 2, correct: 1 },
      },
      {
        partId: essayPartId,
        kind: "ESSAY",
        status: "DONE",
        essay: { publicId: expect.any(String), wordCount: 4, reviewStatus: "DRAFT", feedback: null },
      },
      { partId: forumPartId, kind: "FORUM", status: "DONE", forum: { posted: true } },
    ]);
  });

  it("lets every season participant read it, whatever their group, through this season's enrolment", async () => {
    for (const token of [otherStudentToken, movedToken]) {
      const res = await get(`/assignments/${threePartId}`, token);
      expect(res.status).toBe(200);
      expect(res.body.data.readOnly).toBe(false);
    }
  });

  it("refuses a student with no place in the season", async () => {
    const res = await get(`/assignments/${threePartId}`, outsiderToken);
    expect(res.status).toBe(403);
  });

  it("returns 400 for a non-numeric id and 404 for a missing one", async () => {
    expect((await get("/assignments/abc", superToken)).status).toBe(400);
    expect((await get("/assignments/2147483000", superToken)).status).toBe(404);
  });
});

describe("GET /api/v1/assignments/:id/progress", () => {
  type Row = { studentUserId: number; name: string; submittedAt: string | null; parts: { status: string }[] };

  it("lists every participant, unfinished first, then by name", async () => {
    const res = await get(`/assignments/${threePartId}/progress`, superToken);

    expect(res.status).toBe(200);
    const rows = res.body.data.rows as Row[];
    // "Test moved" and "Test student" haven't submitted; "Test other" has.
    expect(rows.map((r) => r.studentUserId)).toEqual([movedUserId, studentUserId, otherStudentUserId]);
    expect(rows[0]!.parts.map((p) => p.status)).toEqual(["NOT_STARTED", "NOT_STARTED", "NOT_STARTED"]);
    expect(rows[2]!.submittedAt).not.toBeNull();
  });

  it("progress says how far into each video, and keeps a draft essay private", async () => {
    const res = await get(`/assignments/${threePartId}/progress`, superToken);
    const rows = res.body.data.rows as Array<{ studentUserId: number; parts: Record<string, unknown>[] }>;
    const mine = rows.find((r) => r.studentUserId === studentUserId)!;
    expect(mine.parts[0]).toMatchObject({
      status: "IN_PROGRESS",
      video: { watchedSeconds: 360, durationSeconds: 1080 },
    });
    // The draft is the student's alone: staff see the essay as not started.
    expect(mine.parts[1]).toEqual({ partId: essayPartId, kind: "ESSAY", status: "NOT_STARTED" });
    expect(mine.parts[2]).toMatchObject({ status: "DONE", forum: { posted: true } });

    const other = rows.find((r) => r.studentUserId === otherStudentUserId)!;
    expect(other.parts[0]).toMatchObject({
      status: "DONE",
      video: { watchedSeconds: 1000, answered: 2, questionCount: 2, correct: 1 },
    });
    expect(other.parts[1]).toMatchObject({ status: "DONE", essay: { reviewStatus: "SUBMITTED" } });
  });

  it("a leader's progress lists only their groups, unfinished first", async () => {
    const res = await get(`/assignments/${threePartId}/progress`, leaderToken);

    expect(res.status).toBe(200);
    // Group B: the moved student (nothing done) before the other student (submitted).
    expect((res.body.data.rows as Row[]).map((r) => r.studentUserId)).toEqual([movedUserId, otherStudentUserId]);
  });

  it("refuses a student outright, and the old tracker is gone", async () => {
    expect((await get(`/assignments/${threePartId}/progress`, studentToken)).status).toBe(403);
    expect((await get(`/assignments/${threePartId}/tracker`, superToken)).status).toBe(404);
  });
});

describe("a returned essay, and a deleted participant", () => {
  it("shows a returned essay as RETURNED with its feedback, and the list row says returned", async () => {
    const returned = await createAssignmentWithParts({ seasonId, title: "Returned one" });
    await seedEssays([
      {
        assignmentId: returned.id,
        studentUserId,
        status: "RETURNED",
        text: "Too short",
        feedback: "Say more about the father",
      },
    ]);

    const detail = await get(`/assignments/${returned.id}`, studentToken);
    expect(detail.body.data.my.parts).toEqual([
      {
        partId: returned.partIds[0],
        kind: "ESSAY",
        status: "RETURNED",
        essay: {
          publicId: expect.any(String),
          wordCount: 2,
          reviewStatus: "RETURNED",
          feedback: "Say more about the father",
        },
      },
    ]);
    const list = await get(`/seasons/${seasonId}/assignments`, studentToken);
    const row = list.body.data.assignments.find((a: { id: number }) => a.id === returned.id);
    expect(row).toMatchObject({ status: "RETURNED", returned: true, partsDone: 0, submittedAt: null });

    await db.assignment.update({ where: { id: returned.id }, data: { deletedAt: new Date() } });
  });

  it("drops a deleted participant from the list's counts and the progress rows alike", async () => {
    const gone = await createTestUser("gone", "STUDENT");
    await db.seasonEnrollment.create({
      data: { seasonId, studentUserId: gone.id, groupId: groupAId, status: "ACTIVE" },
    });
    await setSubmitted(threePartId, gone.id, new Date());
    await db.user.update({ where: { id: gone.id }, data: { deletedAt: new Date() } });

    const list = await get(`/seasons/${seasonId}/assignments`, superToken);
    const three = list.body.data.assignments.find((a: { id: number }) => a.id === threePartId);
    const progress = await get(`/assignments/${threePartId}/progress`, superToken);
    // One denominator: 3 live participants, 1 of them submitted.
    expect(three).toMatchObject({ expectedCount: 3, submissionCount: 1 });
    expect(progress.body.data.rows).toHaveLength(three.expectedCount);
    expect(progress.body.data.rows.map((r: { studentUserId: number }) => r.studentUserId)).not.toContain(gone.id);
  });
});
