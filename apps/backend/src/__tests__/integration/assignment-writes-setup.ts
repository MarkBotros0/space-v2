import type { Express } from "express";

import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

export interface AssignmentWriteFixtures {
  seasonId: number;
  otherSeasonId: number;
  groupAId: number;
  groupBId: number;
  otherGroupId: number;
  sessionId: number;
  otherSessionId: number;
  superId: number;
  adminId: number;
  studentAId: number;
  studentBId: number;
  optedOutId: number;
  withdrawnId: number;
  movedId: number;
  superToken: string;
  adminToken: string;
  otherAdminToken: string;
  leaderToken: string;
  studentToken: string;
}

/** The assignment-writes suites' shared beforeAll body, returning what it set. */
export async function seedAssignmentWriteFixtures(app: Express): Promise<AssignmentWriteFixtures> {
  await cleanupTestData();

  const seasonId = (await createTestSeason()).id;
  const otherSeasonId = (await createTestSeason({ year: 2100 })).id;

  const superUser = await createTestUser("super", "SUPER");
  const admin = await createTestUser("admin", "ADMIN");
  const otherAdmin = await createTestUser("other-admin", "ADMIN");
  const leader = await createTestUser("leader", "LEADER");
  const studentA = await createTestUser("student-a", "STUDENT");
  const studentB = await createTestUser("student-b", "STUDENT");
  const optedOut = await createTestUser("opted-out", "STUDENT");
  const withdrawn = await createTestUser("withdrawn", "STUDENT");
  const moved = await createTestUser("moved", "STUDENT");
  const superId = superUser.id;
  const adminId = admin.id;
  const studentAId = studentA.id;
  const studentBId = studentB.id;
  const optedOutId = optedOut.id;
  const withdrawnId = withdrawn.id;
  const movedId = moved.id;

  // Grants must exist before login: the token carries seasonAdminIds.
  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  await db.seasonAdmin.create({ data: { seasonId: otherSeasonId, userId: otherAdmin.id } });

  const groupAId = (
    await db.group.create({
      data: {
        seasonId,
        name: "Group A",
        students: { create: [{ studentUserId: studentA.id }, { studentUserId: optedOut.id }] },
      },
      select: { id: true },
    })
  ).id;
  const groupBId = (
    await db.group.create({
      data: { seasonId, name: "Group B", students: { create: { studentUserId: studentB.id } } },
      select: { id: true },
    })
  ).id;
  // The moved student's only GroupStudent row points at another season's
  // group (no row for this season). Their enrolment in THIS season
  // records Group A. Ruling C9: this season's targeting must follow the
  // enrolment — GroupStudent would leave them un-notified.
  const otherGroupId = (
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

  const sessionId = (
    await db.session.create({
      data: { seasonId, title: "Linked", startsAt: new Date("2099-03-01T18:00:00.000Z"), durationMinutes: 60 },
      select: { id: true },
    })
  ).id;
  const otherSessionId = (
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

  const superToken = await login(app, superUser.email);
  const adminToken = await login(app, admin.email);
  const otherAdminToken = await login(app, otherAdmin.email);
  const leaderToken = await login(app, leader.email);
  const studentToken = await login(app, studentA.email);

  return {
    seasonId,
    otherSeasonId,
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
  };
}

export const body = (over: Record<string, unknown> = {}) => ({
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

export function notificationsFor(userId: number, assignmentId: number) {
  return db.notification.findMany({
    where: { userId, type: "ASSIGNMENT_CREATED", link: `/student/assignments/${assignmentId}` },
    select: { title: true, body: true, link: true },
  });
}
