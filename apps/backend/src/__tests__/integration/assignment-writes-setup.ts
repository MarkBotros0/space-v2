import type { Express } from "express";

import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

export interface AssignmentWriteFixtures {
  seasonId: number;
  otherSeasonId: number;
  groupAId: number;
  superId: number;
  adminId: number;
  studentAId: number;
  studentBId: number;
  optedOutId: number;
  withdrawnId: number;
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

  // Grants must exist before login: the token carries seasonAdminIds.
  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  await db.seasonAdmin.create({ data: { seasonId: otherSeasonId, userId: otherAdmin.id } });

  const groupAId = (await db.group.create({ data: { seasonId, name: "Group A" }, select: { id: true } })).id;
  const groupBId = (await db.group.create({ data: { seasonId, name: "Group B" }, select: { id: true } })).id;
  await db.groupLeader.create({ data: { groupId: groupAId, userId: leader.id } });

  await db.seasonEnrollment.createMany({
    data: [
      { seasonId, studentUserId: studentA.id, groupId: groupAId, status: "ACTIVE" },
      { seasonId, studentUserId: optedOut.id, groupId: groupAId, status: "ACTIVE" },
      { seasonId, studentUserId: studentB.id, groupId: groupBId, status: "ACTIVE" },
      { seasonId, studentUserId: withdrawn.id, groupId: groupBId, status: "WITHDRAWN" },
    ],
  });
  await db.notificationPreference.create({ data: { userId: optedOut.id, assignmentCreated: false } });

  return {
    seasonId,
    otherSeasonId,
    groupAId,
    superId: superUser.id,
    adminId: admin.id,
    studentAId: studentA.id,
    studentBId: studentB.id,
    optedOutId: optedOut.id,
    withdrawnId: withdrawn.id,
    superToken: await login(app, superUser.email),
    adminToken: await login(app, admin.email),
    otherAdminToken: await login(app, otherAdmin.email),
    leaderToken: await login(app, leader.email),
    studentToken: await login(app, studentA.email),
  };
}

export const videoPart = (over: Record<string, unknown> = {}) => ({
  kind: "VIDEO",
  title: "Watch this first",
  youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  blockSkipping: false,
  durationSeconds: 600,
  ...over,
});

export const essayPart = (over: Record<string, unknown> = {}) => ({
  kind: "ESSAY",
  prompt: "What did you learn?",
  minWords: 50,
  maxWords: 500,
  maxFileSizeMb: 10,
  allowedMimeCategories: ["pdf"],
  ...over,
});

export const forumPart = (over: Record<string, unknown> = {}) => ({
  kind: "FORUM",
  prompt: "Share one idea with your group",
  minWords: null,
  postToRead: true,
  allowComments: false,
  ...over,
});

export const body = (over: Record<string, unknown> = {}) => ({
  title: "Week 4 reflection",
  description: "Write a page.",
  dueDay: "2099-03-10",
  dueTime: "23:59",
  reminder: { enabled: true, days: 2, anchor: "NEXT_SESSION", time: "09:00" },
  parts: [essayPart()],
  ...over,
});

export function notificationsFor(userId: number, assignmentId: number) {
  return db.notification.findMany({
    where: { userId, type: "ASSIGNMENT_CREATED", link: `/student/assignments/${assignmentId}` },
    select: { title: true, body: true, link: true },
  });
}

/** An assignment's parts as stored, in order. */
export function storedParts(assignmentId: number) {
  return db.assignmentPart.findMany({
    where: { assignmentId },
    orderBy: { position: "asc" },
    select: { id: true, position: true, kind: true, youtubeId: true, minWords: true, maxWords: true },
  });
}

/**
 * A student's work on one part, with the submission it belongs to. `submitted`
 * stamps the assignment as handed in; the essay status follows it.
 */
export async function seedWork(
  assignmentId: number,
  partId: number,
  studentUserId: number,
  opts: { submitted?: boolean; watchedSeconds?: number } = {},
) {
  const at = opts.submitted ? new Date() : null;
  const submission = await db.submission.upsert({
    where: { assignmentId_studentUserId: { assignmentId, studentUserId } },
    create: {
      assignmentId,
      studentUserId,
      publicId: `space-v2-test-s${assignmentId}-${studentUserId}`,
      submittedAt: at,
      completedAt: at,
    },
    update: {},
    select: { id: true },
  });
  return db.assignmentPartWork.create({
    data: {
      publicId: `space-v2-test-w${partId}-${studentUserId}`,
      partId,
      submissionId: submission.id,
      studentUserId,
      status: opts.submitted ? "SUBMITTED" : "DRAFT",
      submittedAt: at,
      text: "Some words",
      watchedSeconds: opts.watchedSeconds ?? 0,
    },
    select: { id: true },
  });
}

/**
 * Task 2 leaves the link between a part's work and its submission to the
 * services: the part and the submission are the same assignment's, and the
 * work and the submission the same student's. Every write must keep that.
 */
export async function inconsistentWorks(assignmentId: number) {
  const works = await db.assignmentPartWork.findMany({
    where: { OR: [{ part: { assignmentId } }, { submission: { assignmentId } }] },
    select: {
      id: true,
      studentUserId: true,
      part: { select: { assignmentId: true } },
      submission: { select: { assignmentId: true, studentUserId: true } },
    },
  });
  return works.filter(
    (w) => w.part.assignmentId !== w.submission.assignmentId || w.studentUserId !== w.submission.studentUserId,
  );
}
