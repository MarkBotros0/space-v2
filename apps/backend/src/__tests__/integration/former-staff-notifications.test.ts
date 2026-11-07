// M3: once a season finishes, its admins and leaders have no access to it, so
// nothing may tell them about one of its students by name.
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { flagLowAttendance } from "../../lib/attendance-notifications";
import { prepareSessionCancelledNotice } from "../../lib/session-notifications";
import { loadScopes } from "../../lib/auth/scopes";
import { signAccessToken } from "../../lib/auth/tokens";
import { cleanupTestData, createTestSeason, createTestUser } from "./fixtures";

jest.setTimeout(120000);

const app = createApp();

async function mint(userId: number) {
  const scopes = await loadScopes(userId);
  return (await signAccessToken({ userId, ...scopes })).token;
}

beforeAll(cleanupTestData);
afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

type Status = "DRAFT" | "ACTIVE" | "COMPLETED" | "ARCHIVED";

async function world(status: Status, label: string) {
  const season = await createTestSeason({ status });
  const [student, admin, leader] = await Promise.all([
    createTestUser(`m3-student-${label}`, "STUDENT"),
    createTestUser(`m3-admin-${label}`, "ADMIN"),
    createTestUser(`m3-leader-${label}`, "LEADER"),
  ]);
  await db.seasonAdmin.create({ data: { seasonId: season.id, userId: admin.id } });
  const group = await db.group.create({
    data: { seasonId: season.id, name: `m3-${label}`, leaders: { create: { userId: leader.id } } },
    select: { id: true },
  });
  await db.seasonEnrollment.create({
    data: {
      seasonId: season.id, studentUserId: student.id, groupId: group.id,
      status: status === "COMPLETED" || status === "ARCHIVED" ? "COMPLETED" : "ACTIVE",
    },
  });
  return { seasonId: season.id, student: student.id, admin: admin.id, leader: leader.id };
}

const notified = (userId: number, type: "MENTOR_FOLLOWUP" | "LOW_ATTENDANCE_FLAG") =>
  db.notification.count({ where: { userId, type } });

// Owner 2026-11-07: the mentor follow-up notification is gone, in every season.
describe("a flagged note", () => {
  it.each<[Status, number]>([
    ["DRAFT", 0],
    ["ACTIVE", 0],
    ["COMPLETED", 0],
    ["ARCHIVED", 0],
  ])("in a %s season tells its admin %i time(s)", async (status, expected) => {
    const w = await world(status, `note-${status.toLowerCase()}`);
    const mentor = await createTestUser(`m3-mentor-${status.toLowerCase()}`, "MENTOR");
    const res = await request(app)
      .post(`/api/v1/students/${w.student}/notes`)
      .set("authorization", `Bearer ${await mint(mentor.id)}`)
      .send({ body: "Worried", visibility: "ADMINS", followUpFlagged: true, seasonId: w.seasonId });
    expect(res.status).toBe(201);
    expect(await notified(w.admin, "MENTOR_FOLLOWUP")).toBe(expected);
  });
});

describe("two absences in a row", () => {
  it.each<[Status, number]>([
    ["ACTIVE", 1],
    ["COMPLETED", 0],
    ["ARCHIVED", 0],
  ])("in a %s season alerts its admin and leader %i time(s)", async (status, expected) => {
    const w = await world(status, `abs-${status.toLowerCase()}`);
    const at = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000);
    const first = await db.session.create({
      data: { seasonId: w.seasonId, title: "One", startsAt: at(9), durationMinutes: 60 },
    });
    const second = await db.session.create({
      data: { seasonId: w.seasonId, title: "Two", startsAt: at(2), durationMinutes: 60 },
    });
    for (const s of [first, second]) {
      await db.attendance.create({ data: { sessionId: s.id, studentUserId: w.student, status: "ABSENT" } });
    }
    await flagLowAttendance(second.id, [{ studentUserId: w.student, status: "ABSENT" }]);
    expect(await notified(w.admin, "LOW_ATTENDANCE_FLAG")).toBe(expected);
    expect(await notified(w.leader, "LOW_ATTENDANCE_FLAG")).toBe(expected);
  });
});

describe("a cancelled session", () => {
  it.each<[Status, boolean]>([
    ["DRAFT", false],
    ["ACTIVE", true],
    ["COMPLETED", false],
    ["ARCHIVED", false],
  ])("in a %s season: telling its leader is %s", async (status, told) => {
    const w = await world(status, `cancel-${status.toLowerCase()}`);
    const session = await db.session.create({
      data: { seasonId: w.seasonId, title: "Later", startsAt: new Date(Date.now() + 86_400_000), durationMinutes: 60 },
    });
    const notice = await prepareSessionCancelledNotice(w.seasonId, [session.id]);
    expect((notice?.recipientIds ?? []).includes(w.leader)).toBe(told);
  });
});
