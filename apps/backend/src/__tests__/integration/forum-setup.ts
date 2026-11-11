// apps/backend/src/__tests__/integration/forum-setup.ts
//
// Shared setup for the forum-*-routes suites, split out of the original
// forum-routes.test.ts. Not a test file (jest's testMatch is *.test.ts).
//
// A forum is a FORUM part of an assignment: a post is the student's
// AssignmentPartWork on that part, and its comments hang off that work.
import type { Express } from "express";

import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

// Every string below is invented. Nothing a real student wrote is reproduced
// anywhere in this repository.
export const OWN_TEXT = "space-v2-test response one two three four five six";

/** Run before every test (the original suite's beforeEach). */
export async function resetSubmissions(seasonId: number): Promise<void> {
  const inSeason = { part: { assignment: { seasonId } } };
  await db.forumComment.deleteMany({ where: { partWork: inSeason } });
  await db.assignmentPartWork.deleteMany({ where: inSeason });
  await db.submission.deleteMany({ where: { assignment: { seasonId } } });
}

/** The forum's base path for one FORUM part. */
export const forumPath = (f: { assignmentId: number; partId: number }) =>
  `/api/v1/assignments/${f.assignmentId}/parts/${f.partId}/forum`;

/** An assignment with one FORUM part (after an essay part, with `withEssay`). */
export async function createForum(
  seasonId: number,
  title: string,
  forum: { minWords?: number | null; allowComments?: boolean; postToRead?: boolean } = {},
  opts: { dueAt?: Date | null; withEssay?: boolean } = {},
): Promise<{ assignmentId: number; partId: number; essayPartId: number | null }> {
  const essay = { position: 0, kind: "ESSAY" as const, prompt: "space-v2-test essay" };
  const part = {
    position: opts.withEssay ? 1 : 0,
    kind: "FORUM" as const,
    prompt: "space-v2-test share one idea",
    minWords: forum.minWords ?? null,
    allowComments: forum.allowComments ?? true,
    postToRead: forum.postToRead ?? true,
  };
  const a = await db.assignment.create({
    data: {
      seasonId,
      title,
      dueAt: opts.dueAt ?? null,
      parts: { create: opts.withEssay ? [essay, part] : [part] },
    },
    select: { id: true, parts: { select: { id: true, kind: true } } },
  });
  return {
    assignmentId: a.id,
    partId: a.parts.find((p) => p.kind === "FORUM")!.id,
    essayPartId: a.parts.find((p) => p.kind === "ESSAY")?.id ?? null,
  };
}

export interface ForumFixtures {
  seasonId: number;
  assignmentId: number;
  partId: number;
  /** An ESSAY part on the same assignment, before the forum. */
  essayPartId: number;
  /** A second forum assignment with no minimum. */
  openForum: { assignmentId: number; partId: number };
  groupAId: number;
  studentAId: number;
  studentA2Id: number;
  studentAToken: string;
  studentA2Token: string;
  studentBToken: string;
  /** A student whose place in the season is WITHDRAWN. */
  withdrawnToken: string;
  leaderAToken: string;
  leaderBToken: string;
  adminToken: string;
  mentorToken: string;
}

/** The original suite's beforeAll body, on the part model, returning what it set. */
export async function seedForumFixtures(app: Express): Promise<ForumFixtures> {
  await cleanupTestData();

  const season = await createTestSeason();
  const seasonId = season.id;

  const studentA = await createTestUser("fstudenta", "STUDENT");
  const studentA2 = await createTestUser("fstudenta2", "STUDENT");
  const studentB = await createTestUser("fstudentb", "STUDENT");
  const withdrawn = await createTestUser("fwithdrawn", "STUDENT");
  const leaderA = await createTestUser("fleadera", "LEADER");
  const leaderB = await createTestUser("fleaderb", "LEADER");
  const admin = await createTestUser("fadmin", "ADMIN");
  const mentor = await createTestUser("fmentor", "MENTOR");

  const groupA = await db.group.create({
    data: { seasonId, name: "Group A", leaders: { create: { userId: leaderA.id } } },
    select: { id: true },
  });
  const groupB = await db.group.create({
    data: { seasonId, name: "Group B", leaders: { create: { userId: leaderB.id } } },
    select: { id: true },
  });

  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  await db.seasonEnrollment.createMany({
    data: [
      { seasonId, studentUserId: studentA.id, groupId: groupA.id, status: "ACTIVE" },
      { seasonId, studentUserId: studentA2.id, groupId: groupA.id, status: "ACTIVE" },
      { seasonId, studentUserId: studentB.id, groupId: groupB.id, status: "ACTIVE" },
      { seasonId, studentUserId: withdrawn.id, groupId: groupA.id, status: "WITHDRAWN" },
    ],
  });

  const forum = await createForum(
    seasonId,
    "space-v2-test-forum",
    { minWords: 5 },
    { dueAt: new Date("2099-01-01T00:00:00.000Z"), withEssay: true },
  );
  const open = await createForum(seasonId, "space-v2-test-forum-open", { minWords: null });

  return {
    seasonId,
    assignmentId: forum.assignmentId,
    partId: forum.partId,
    essayPartId: forum.essayPartId!,
    openForum: { assignmentId: open.assignmentId, partId: open.partId },
    groupAId: groupA.id,
    studentAId: studentA.id,
    studentA2Id: studentA2.id,
    studentAToken: await login(app, studentA.email),
    studentA2Token: await login(app, studentA2.email),
    studentBToken: await login(app, studentB.email),
    withdrawnToken: await login(app, withdrawn.email),
    leaderAToken: await login(app, leaderA.email),
    leaderBToken: await login(app, leaderB.email),
    adminToken: await login(app, admin.email),
    mentorToken: await login(app, mentor.email),
  };
}
