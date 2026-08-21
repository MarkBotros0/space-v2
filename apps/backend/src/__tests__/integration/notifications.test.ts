import { db } from "../../db/client";
import { flagLowAttendance } from "../../lib/attendance-notifications";
import { cleanupTestData, createTestSeason, createTestUser } from "./fixtures";

// 60s, not the 30s the other integration suites use: this beforeAll performs
// ~9 sequential writes, and the shared Neon staging database autosuspends —
// a cold first query measured ~18s, which puts a cold run near 34s.
jest.setTimeout(60000);

let seasonId: number;
let groupId: number;
let studentId: number;
let leaderId: number;
let adminId: number;
let firstSessionId: number;
let secondSessionId: number;

beforeAll(async () => {
  await cleanupTestData();

  const season = await createTestSeason();
  seasonId = season.id;

  const student = await createTestUser("student", "STUDENT");
  const leader = await createTestUser("leader", "LEADER");
  const admin = await createTestUser("admin", "ADMIN");
  studentId = student.id;
  leaderId = leader.id;
  adminId = admin.id;

  const group = await db.group.create({
    data: {
      seasonId,
      name: "Group A",
      leaders: { create: { userId: leader.id } },
      students: { create: { studentUserId: student.id } },
    },
    select: { id: true },
  });
  groupId = group.id;

  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  await db.seasonEnrollment.create({
    data: { seasonId, studentUserId: student.id, groupId, status: "ACTIVE" },
  });

  const first = await db.session.create({
    data: {
      seasonId,
      title: "First",
      startsAt: new Date("2099-03-01T18:00:00.000Z"),
      durationMinutes: 60,
    },
    select: { id: true },
  });
  firstSessionId = first.id;

  const second = await db.session.create({
    data: {
      seasonId,
      title: "Second",
      startsAt: new Date("2099-03-08T18:00:00.000Z"),
      durationMinutes: 60,
    },
    select: { id: true },
  });
  secondSessionId = second.id;
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

it("does not flag after a single absence", async () => {
  await db.attendance.create({
    data: { sessionId: firstSessionId, studentUserId: studentId, status: "ABSENT" },
  });

  await flagLowAttendance(firstSessionId, [{ studentUserId: studentId, status: "ABSENT" }]);

  const count = await db.notification.count({
    where: { userId: { in: [leaderId, adminId] }, type: "LOW_ATTENDANCE_FLAG" },
  });
  expect(count).toBe(0);
});

it("notifies the group leader and season admin after two consecutive absences", async () => {
  await db.attendance.create({
    data: { sessionId: secondSessionId, studentUserId: studentId, status: "ABSENT" },
  });

  await flagLowAttendance(secondSessionId, [{ studentUserId: studentId, status: "ABSENT" }]);

  const notifications = await db.notification.findMany({
    where: { userId: { in: [leaderId, adminId] }, type: "LOW_ATTENDANCE_FLAG" },
    select: { userId: true, link: true, title: true },
  });

  expect(notifications).toHaveLength(2);

  const forAdmin = notifications.find((n) => n.userId === adminId);
  const forLeader = notifications.find((n) => n.userId === leaderId);
  // Each recipient gets a link their own role can open.
  expect(forAdmin?.link).toBe(`/admin/students/${studentId}`);
  expect(forLeader?.link).toBe(`/leader/students/${studentId}`);
  expect(forAdmin?.title).toContain("2 consecutive absences");
});

it("respects an opt-out on NotificationPreference", async () => {
  await db.notification.deleteMany({ where: { userId: { in: [leaderId, adminId] } } });
  await db.notificationPreference.create({
    data: { userId: leaderId, lowAttendanceFlag: false },
  });

  await flagLowAttendance(secondSessionId, [{ studentUserId: studentId, status: "ABSENT" }]);

  const recipients = await db.notification.findMany({
    where: { userId: { in: [leaderId, adminId] }, type: "LOW_ATTENDANCE_FLAG" },
    select: { userId: true },
  });
  expect(recipients.map((r) => r.userId)).toEqual([adminId]);
});
