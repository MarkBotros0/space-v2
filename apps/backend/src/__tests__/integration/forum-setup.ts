// apps/backend/src/__tests__/integration/forum-setup.ts
//
// Shared setup for the forum-*-routes suites, split out of the original
// forum-routes.test.ts. Not a test file (jest's testMatch is *.test.ts).
import type { Express } from "express";

import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

// Every string below is invented. Nothing a real student wrote is reproduced
// anywhere in this repository.
export const OWN_TEXT = "space-v2-test response one two three four five six";

/** Run before every test (the original suite's beforeEach). */
export async function resetSubmissions(seasonId: number): Promise<void> {
  await db.forumComment.deleteMany({ where: { submission: { assignment: { seasonId } } } });
  await db.submission.deleteMany({ where: { assignment: { seasonId } } });
}

export interface ForumFixtures {
  seasonId: number;
  assignmentId: number;
  untargetedAssignmentId: number;
  groupAId: number;
  studentAId: number;
  studentA2Id: number;
  studentAToken: string;
  studentA2Token: string;
  studentBToken: string;
  leaderAToken: string;
  leaderBToken: string;
  adminToken: string;
  mentorToken: string;
}

/** The original suite's beforeAll body, verbatim, returning what it set. */
export async function seedForumFixtures(app: Express): Promise<ForumFixtures> {
  await cleanupTestData();

  const season = await createTestSeason();
  const seasonId = season.id;

  const studentA = await createTestUser("fstudenta", "STUDENT");
  const studentA2 = await createTestUser("fstudenta2", "STUDENT");
  const studentB = await createTestUser("fstudentb", "STUDENT");
  const leaderA = await createTestUser("fleadera", "LEADER");
  const leaderB = await createTestUser("fleaderb", "LEADER");
  const admin = await createTestUser("fadmin", "ADMIN");
  const mentor = await createTestUser("fmentor", "MENTOR");
  const studentAId = studentA.id;
  const studentA2Id = studentA2.id;

  const groupA = await db.group.create({
    data: { seasonId, name: "Group A", leaders: { create: { userId: leaderA.id } } },
    select: { id: true },
  });
  const groupB = await db.group.create({
    data: { seasonId, name: "Group B", leaders: { create: { userId: leaderB.id } } },
    select: { id: true },
  });
  const groupAId = groupA.id;

  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  await db.seasonEnrollment.createMany({
    data: [
      { seasonId, studentUserId: studentA.id, groupId: groupA.id, status: "ACTIVE" },
      { seasonId, studentUserId: studentA2.id, groupId: groupA.id, status: "ACTIVE" },
      { seasonId, studentUserId: studentB.id, groupId: groupB.id, status: "ACTIVE" },
    ],
  });

  const assignment = await db.assignment.create({
    data: {
      seasonId,
      title: "space-v2-test-forum",
      type: "FORUM",
      forumMinWords: 5,
      forumAllowComments: true,
      isAllGroups: true,
      dueAt: new Date("2099-01-01T00:00:00.000Z"),
    },
    select: { id: true },
  });
  const assignmentId = assignment.id;

  // Targeted at group B only — student A must never reach it.
  const untargeted = await db.assignment.create({
    data: {
      seasonId,
      title: "space-v2-test-forum-b-only",
      type: "FORUM",
      forumMinWords: 0,
      forumAllowComments: true,
      isAllGroups: false,
      targets: { create: { groupId: groupB.id } },
    },
    select: { id: true },
  });
  const untargetedAssignmentId = untargeted.id;

  const studentAToken = await login(app, studentA.email);
  const studentA2Token = await login(app, studentA2.email);
  const studentBToken = await login(app, studentB.email);
  const leaderAToken = await login(app, leaderA.email);
  const leaderBToken = await login(app, leaderB.email);
  const adminToken = await login(app, admin.email);
  const mentorToken = await login(app, mentor.email);

  return {
    seasonId,
    assignmentId,
    untargetedAssignmentId,
    groupAId,
    studentAId,
    studentA2Id,
    studentAToken,
    studentA2Token,
    studentBToken,
    leaderAToken,
    leaderBToken,
    adminToken,
    mentorToken,
  };
}
