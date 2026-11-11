import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";
import { createAssignmentWithParts, seedEssays, seedVideoWork } from "./assignment-reads-setup";

jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let otherSeasonId: number;
let draftId: number;
let completedId: number;
let superToken: string;
let adminToken: string;
let leaderToken: string;
let studentToken: string;
let mentorToken: string;
let otherAdminToken: string;
let s1: number; // grouped, ACTIVE
let s2: number; // ungrouped, ACTIVE
let sDeleted: number;
let sWithdrawn: number;

const HOUR = 3600_000;
const get = (id: number, token: string) =>
  request(app).get(`/api/v1/seasons/${id}/end-check`).set("authorization", `Bearer ${token}`);

beforeAll(async () => {
  await cleanupTestData();
  seasonId = (await createTestSeason()).id;
  otherSeasonId = (await createTestSeason()).id;
  draftId = (await createTestSeason({ status: "DRAFT" })).id;
  completedId = (await createTestSeason({ status: "COMPLETED" })).id;

  const sup = await createTestUser("super", "SUPER");
  const admin = await createTestUser("admin", "ADMIN");
  const otherAdmin = await createTestUser("otheradmin", "ADMIN");
  const leader = await createTestUser("leader", "LEADER");
  const student = await createTestUser("student", "STUDENT");
  const mentor = await createTestUser("mentor", "MENTOR");
  const u1 = await createTestUser("s1", "STUDENT");
  const u2 = await createTestUser("s2", "STUDENT");
  const ud = await createTestUser("sdel", "STUDENT");
  const uw = await createTestUser("swd", "STUDENT");
  s1 = u1.id;
  s2 = u2.id;
  sDeleted = ud.id;
  sWithdrawn = uw.id;
  await db.user.update({ where: { id: ud.id }, data: { deletedAt: new Date() } });

  for (const id of [seasonId, draftId, completedId]) {
    await db.seasonAdmin.create({ data: { seasonId: id, userId: admin.id } });
  }
  await db.seasonAdmin.create({ data: { seasonId: otherSeasonId, userId: otherAdmin.id } });

  const group = await db.group.create({
    data: { seasonId, name: "Group A", leaders: { create: { userId: leader.id } } },
  });
  const enroll = (studentUserId: number, status: "ACTIVE" | "WITHDRAWN", groupId?: number) =>
    db.seasonEnrollment.create({
      // Enrolled before any session here, so each one counts against them (M2).
      data: { seasonId, studentUserId, status, groupId, enrolledAt: new Date(Date.now() - 100 * HOUR) },
    });
  await enroll(s1, "ACTIVE", group.id);
  await enroll(s2, "ACTIVE");
  await enroll(sDeleted, "ACTIVE");
  await enroll(sWithdrawn, "WITHDRAWN");
  await enroll(student.id, "ACTIVE");

  const now = Date.now();
  const past = await db.session.create({
    data: { seasonId, title: "Past", startsAt: new Date(now - 5 * HOUR), durationMinutes: 60 },
  });
  await db.session.create({
    data: { seasonId, title: "Running", startsAt: new Date(now - 30 * 60_000), durationMinutes: 90 },
  });
  // s1 and `student` attended; s2 has no row (+ the soft-deleted one has none, ignored);
  // withdrawn's row must not count. `student` has none either -> s2 + student missing = 2.
  await db.attendance.create({ data: { sessionId: past.id, studentUserId: s1, status: "PRESENT" } });
  await db.attendance.create({ data: { sessionId: past.id, studentUserId: sWithdrawn, status: "PRESENT" } });

  // An essay and a video: only an essay waiting review holds the season open.
  const assignment = await createAssignmentWithParts({ seasonId, title: "Essay" }, [
    { kind: "ESSAY" },
    { kind: "VIDEO" },
  ]);
  const deletedAssignment = await createAssignmentWithParts({ seasonId, title: "Gone", deletedAt: new Date() });
  const sub = (
    assignmentId: number,
    studentUserId: number,
    status: "DRAFT" | "SUBMITTED" | "RETURNED",
    publicId: string,
  ) => seedEssays([{ assignmentId, studentUserId, status, publicId }]);
  await sub(assignment.id, s1, "SUBMITTED", "endchk-submitted");
  await sub(assignment.id, s2, "DRAFT", "endchk-draft");
  await sub(assignment.id, student.id, "RETURNED", "endchk-returned");
  await sub(deletedAssignment.id, s1, "SUBMITTED", "endchk-delassign");
  await sub(assignment.id, sDeleted, "SUBMITTED", "endchk-delstudent");
  // s2 watched part of the video and never finished it: not a blocker.
  await seedVideoWork(assignment.id, assignment.partIds[1]!, s2, 30);

  const quiz = await db.quiz.create({ data: { seasonId, title: "Quiz 1", kind: "ONLINE" } });
  await db.quizAttempt.create({ data: { quizId: quiz.id, studentUserId: s1, status: "SUBMITTED" } });
  await db.quizAttempt.create({ data: { quizId: quiz.id, studentUserId: s2, status: "IN_PROGRESS" } });
  await db.quizAttempt.create({ data: { quizId: quiz.id, studentUserId: sDeleted, status: "SUBMITTED" } });
  // Pending work from a WITHDRAWN and a COMPLETED enrolment must not block.
  const done = await createTestUser("done", "STUDENT");
  await enroll(done.id, "ACTIVE");
  await db.seasonEnrollment.update({
    where: { studentUserId_seasonId: { studentUserId: done.id, seasonId } },
    data: { status: "COMPLETED" },
  });
  for (const [who, uid] of [
    ["wd", sWithdrawn],
    ["done", done.id],
  ] as const) {
    await sub(assignment.id, uid, "SUBMITTED", `endchk-${who}`);
    await db.quizAttempt.create({ data: { quizId: quiz.id, studentUserId: uid, status: "SUBMITTED" } });
  }

  superToken = await login(app, sup.email);
  adminToken = await login(app, admin.email);
  otherAdminToken = await login(app, otherAdmin.email);
  leaderToken = await login(app, leader.email);
  studentToken = await login(app, student.email);
  mentorToken = await login(app, mentor.email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("GET /seasons/:id/end-check", () => {
  it.each([
    ["leader", () => leaderToken],
    ["student", () => studentToken],
    ["mentor", () => mentorToken],
    ["admin of another season", () => otherAdminToken],
  ])("refuses a %s with 403", async (_n, token) => {
    expect((await get(seasonId, token())).status).toBe(403);
  });

  it("answers the season's admin and super with 200", async () => {
    expect((await get(seasonId, adminToken)).status).toBe(200);
    expect((await get(seasonId, superToken)).status).toBe(200);
  });

  it("is 409 season_not_active on a DRAFT or COMPLETED season", async () => {
    for (const id of [draftId, completedId]) {
      const res = await get(id, superToken);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("season_not_active");
    }
  });

  it("lists exactly the blockers: an unreviewed essay blocks End; an unwatched video does not", async () => {
    const { blockers } = (await get(seasonId, superToken)).body.data;
    // The essay work's publicId: the review screen opens that essay.
    expect(blockers.submissions).toEqual([
      { publicId: "endchk-submitted", assignmentTitle: "Essay", studentName: "Test s1" },
    ]);
    expect(blockers.quizAttempts).toHaveLength(1); // not the withdrawn / completed students' attempts
    expect(blockers.quizAttempts[0]).toMatchObject({ quizTitle: "Quiz 1", studentName: "Test s1" });
    // s2 and `student` have no row; the withdrawn row and the deleted student are ignored;
    // the session still running is not a blocker.
    expect(blockers.attendance).toHaveLength(1);
    expect(blockers.attendance[0]).toMatchObject({ title: "Past", missing: 2 });
  });

  it("lists ACTIVE non-deleted students with group name and attendance percent", async () => {
    const { students } = (await get(seasonId, superToken)).body.data;
    expect(students.map((s: { userId: number }) => s.userId).sort()).not.toContain(sDeleted);
    expect(students.map((s: { userId: number }) => s.userId)).not.toContain(sWithdrawn);
    const one = students.find((s: { userId: number }) => s.userId === s1);
    const two = students.find((s: { userId: number }) => s.userId === s2);
    // 2 sessions in the season; s1 attended 1 -> 50.
    expect(one).toMatchObject({ groupName: "Group A", attendancePct: 50 });
    expect(two).toMatchObject({ groupName: null, attendancePct: 0 });
  });

  it("reports attendancePct 0 for a season with no sessions", async () => {
    const empty = (await createTestSeason()).id;
    const u = await createTestUser("nosessions", "STUDENT");
    await db.seasonEnrollment.create({ data: { seasonId: empty, studentUserId: u.id, status: "ACTIVE" } });
    const res = await get(empty, superToken);
    expect(res.body.data.students).toEqual([
      { userId: u.id, name: "Test nosessions", groupName: null, attendancePct: 0, graduationYear: null },
    ]);
    expect(res.body.data.blockers).toEqual({ submissions: [], quizAttempts: [], attendance: [] });
  });
});

describe("season status rules", () => {
  const body = (code: string, status: string) => ({
    code,
    program: "TEST",
    year: 2099,
    status,
    startDate: "2099-01-01T00:00:00.000Z",
    endDate: "2099-12-31T00:00:00.000Z",
  });
  const patch = async (from: "DRAFT" | "ACTIVE" | "COMPLETED" | "ARCHIVED", to: string) => {
    const s = await createTestSeason({ status: from });
    const res = await request(app)
      .patch(`/api/v1/seasons/${s.id}`)
      .set("authorization", `Bearer ${superToken}`)
      .send(body(s.code, to));
    return { s, res };
  };

  it.each([
    ["ACTIVE", "COMPLETED", "use_end_season"],
    ["ACTIVE", "ARCHIVED", "use_end_season"],
    ["COMPLETED", "ACTIVE", "season_finished"],
    ["COMPLETED", "DRAFT", "season_finished"],
  ] as const)("%s -> %s is 409 %s", async (from, to, code) => {
    const { s, res } = await patch(from, to);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe(code);
    expect((await db.season.findUnique({ where: { id: s.id } }))?.status).toBe(from);
  });

  it.each([
    ["COMPLETED", "ARCHIVED"],
    ["ARCHIVED", "COMPLETED"],
  ] as const)("%s -> %s succeeds", async (from, to) => {
    const { s, res } = await patch(from, to);
    expect(res.status).toBe(200);
    expect((await db.season.findUnique({ where: { id: s.id } }))?.status).toBe(to);
  });

  it("DRAFT -> ACTIVE is refused: a season starts from its Start button", async () => {
    const { s, res } = await patch("DRAFT", "ACTIVE");
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({ code: "use_start_season", message: "Start the season from its Start button." });
    expect((await db.season.findUnique({ where: { id: s.id } }))?.status).toBe("DRAFT");
  });
});

describe("POST /students/:id/enrollments into a finished season", () => {
  it("is 409 season_finished for a COMPLETED season, even for super", async () => {
    const u = await createTestUser("late", "STUDENT");
    const res = await request(app)
      .post(`/api/v1/students/${u.id}/enrollments`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ seasonId: completedId });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("season_finished");
  });
});
