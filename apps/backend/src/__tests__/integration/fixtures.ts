import { randomUUID } from "node:crypto";

import bcrypt from "bcryptjs";
import request from "supertest";
import type { Express } from "express";

import { db } from "../../db/client";
import { loadScopes } from "../../lib/auth/scopes";
import { signAccessToken } from "../../lib/auth/tokens";
import { loadSeasonEndCheck } from "../../lib/queries/season-end";
import { passingPcts, weightedScore, type PassWeights } from "../../../../../packages/shared/src/index";

/**
 * Every row these helpers create carries this prefix in a unique, queryable
 * column — User.email and Season.code. Cleanup filters on the prefix and
 * nothing else, so no query here can reach a row a real user owns.
 */
export const TEST_PREFIX = "space-v2-test-";
export const EMAIL_SUFFIX = "@jpc.test";
export const PASSWORD = "correct-horse-battery";

export const testUserFilter = {
  email: { startsWith: TEST_PREFIX, endsWith: EMAIL_SUFFIX },
} as const;

/** Lowercase, as every write path stores it (the database CHECKs that, migration 20261110080000). */
export function testEmail(label: string): string {
  return `${TEST_PREFIX}${label}-${randomUUID()}${EMAIL_SUFFIX}`.toLowerCase();
}

/**
 * 26 chars: the prefix plus 12 hex digits (48 bits — collision-free at test
 * scale). Season codes are bounded at 40 (v1 R4), and duplication appends
 * "-<year>" to derived codes, so the fixture must leave room.
 */
/**
 * JpcEvent has no code or email column, so the prefix lives in its title.
 *
 * This matters more than it looks: `JpcEvent.season` is `onDelete: SetNull`, so
 * deleting a test season does not remove its events — it nulls their `seasonId`
 * and leaves the rows behind in a database jpc-space is live against. Every
 * event fixture must go through this helper or `cleanupTestData` cannot find it.
 */
export function testEventTitle(label: string): string {
  return `${TEST_PREFIX}${label}-${randomUUID()}`;
}

export function testSeasonCode(): string {
  return `${TEST_PREFIX}${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

export type TestRole = "SUPER" | "ADMIN" | "LEADER" | "STUDENT" | "MENTOR";

export async function createTestUser(label: string, role: TestRole): Promise<{ id: number; email: string }> {
  const email = testEmail(label);
  const user = await db.user.create({
    data: {
      email,
      name: `Test ${label}`,
      role,
      passwordHash: await bcrypt.hash(PASSWORD, 10),
    },
    select: { id: true, email: true },
  });
  return user;
}

/** A user in the state only v1's CSV importer could produce (spec 11 R15):
 *  no password hash, never logged in — the precondition of the invite flow. */
export async function createUnactivatedTestUser(label: string, role: TestRole): Promise<{ id: number; email: string }> {
  const email = testEmail(label);
  return db.user.create({
    data: { email, name: `Test ${label}`, role, passwordHash: null },
    select: { id: true, email: true },
  });
}

export async function createTestSeason(
  overrides: { status?: "DRAFT" | "ACTIVE" | "COMPLETED" | "ARCHIVED"; year?: number } = {},
): Promise<{ id: number; code: string }> {
  const code = testSeasonCode();
  const season = await db.season.create({
    data: {
      code,
      title: "Test Season",
      program: "TEST",
      year: overrides.year ?? 2099,
      status: overrides.status ?? "ACTIVE",
      startDate: new Date("2099-01-01T00:00:00.000Z"),
      endDate: new Date("2099-12-31T00:00:00.000Z"),
    },
    select: { id: true, code: true },
  });
  return season;
}

/** Log in through the real endpoint and return the access token. */
export async function login(app: Express, email: string): Promise<string> {
  const res = await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD });
  if (res.status !== 200) {
    throw new Error(`fixture login failed for ${email}: ${res.status}`);
  }
  return res.body.data.accessToken as string;
}

/**
 * Remove everything the fixtures create, in explicit dependency order.
 *
 * Order is explicit rather than relying on cascades because two of the
 * Season relations are onDelete: Restrict (Group and SeasonEnrollment), so a
 * bare season.deleteMany would fail and leave rows behind in a database that
 * jpc-space is also using.
 *
 * Seasons are discovered by prefix, not by ids captured in this process, so an
 * interrupted previous run self-heals on the next run's beforeAll.
 *
 * SERIAL EXECUTION IS REQUIRED. This function is prefix-global: it deletes
 * every "space-v2-test-" row in the database, not just the ones the calling
 * suite created. Every integration suite calls it from both beforeAll and
 * afterAll, so if two suites' lifecycles ever interleave, one suite's cleanup
 * can delete another suite's in-flight fixtures mid-test. This is only safe
 * because integration suites always run one at a time — enforced by
 * `apps/backend/jest.integration.config.js` (`maxWorkers: 1`), which
 * `test:integration` in package.json points at. Do not run this suite set
 * with a config or invocation that allows parallel workers.
 */
export async function cleanupTestData(): Promise<void> {
  await db.jpcEvent.deleteMany({ where: { title: { startsWith: TEST_PREFIX } } });

  // Announcement posts: by body prefix, or by a test author. Their notifications point
  // at /announcements/<id> with no foreign key, so they go first.
  const posts = await db.announcement.findMany({
    where: { OR: [{ body: { startsWith: TEST_PREFIX } }, { author: testUserFilter }] },
    select: { id: true },
  });
  if (posts.length > 0) {
    await db.notification.deleteMany({
      where: { link: { in: posts.map((p) => `/announcements/${p.id}`) } },
    });
    await db.announcement.deleteMany({ where: { id: { in: posts.map((p) => p.id) } } });
  }

  const seasons = await db.season.findMany({
    where: { code: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  const seasonIds = seasons.map((s) => s.id);

  if (seasonIds.length > 0) {
    const inSeasons = { seasonId: { in: seasonIds } } as const;

    // Video-quiz and forum rows cascade from Session and Submission, both of
    // which are deleted below — but three of these tables hold onDelete:
    // Restrict relations to User, so a row that survives its parent's delete
    // makes the user delete at the end of this function throw and strands test
    // fixtures in the shared database. Removing them explicitly first means the
    // cleanup never depends on cascade ordering being right.
    await db.sessionVideoQuestionResponse.deleteMany({
      where: { question: { OR: [{ session: inSeasons }, { assignmentPart: { assignment: inSeasons } }] } },
    });
    await db.sessionVideoProgress.deleteMany({ where: { session: inSeasons } });
    await db.sessionVideoQuestion.deleteMany({ where: { session: inSeasons } });
    await db.forumComment.deleteMany({ where: { partWork: { submission: { assignment: inSeasons } } } });
    // Quiz graph. Quiz.season is onDelete: Cascade so season.deleteMany below
    // would usually reach these, but QuizGrade.studentUserId and
    // QuizAttempt.studentUserId are onDelete: Restrict against User - if the
    // cascade ever fails to fire, user.deleteMany at the end of this function
    // throws a foreign-key error and strands test rows in a database
    // jpc-space is live against. Explicit, like every other line here.
    await db.quizAnswerSelection.deleteMany({ where: { answer: { attempt: { quiz: inSeasons } } } });
    await db.quizAnswerBlank.deleteMany({ where: { answer: { attempt: { quiz: inSeasons } } } });
    await db.quizAnswer.deleteMany({ where: { attempt: { quiz: inSeasons } } });
    await db.quizAttemptEvent.deleteMany({ where: { attempt: { quiz: inSeasons } } });
    await db.quizAttempt.deleteMany({ where: { quiz: inSeasons } });
    await db.quizGrade.deleteMany({ where: { quiz: inSeasons } });
    await db.quizOption.deleteMany({ where: { question: { quiz: inSeasons } } });
    await db.quizBlank.deleteMany({ where: { question: { quiz: inSeasons } } });
    await db.quizQuestion.deleteMany({ where: { quiz: inSeasons } });
    await db.quiz.deleteMany({ where: inSeasons });
    await db.attendance.deleteMany({ where: { session: inSeasons } });
    await db.submissionFile.deleteMany({
      where: { partWork: { submission: { assignment: inSeasons } } },
    });
    await db.assignmentPartWork.deleteMany({ where: { part: { assignment: inSeasons } } });
    await db.submission.deleteMany({ where: { assignment: inSeasons } });
    await db.assignment.deleteMany({ where: inSeasons });
    await db.seasonEnrollment.deleteMany({ where: inSeasons });
    await db.groupLeader.deleteMany({ where: { group: inSeasons } });
    await db.groupStudent.deleteMany({ where: { group: inSeasons } });
    await db.group.deleteMany({ where: inSeasons });
    await db.session.deleteMany({ where: inSeasons });
    await db.seasonAdmin.deleteMany({ where: inSeasons });
    await db.season.deleteMany({ where: { id: { in: seasonIds } } });
  }

  // EngagementNote and InviteToken are the only onDelete: Restrict relations
  // targeting User that the season graph above does not already reach —
  // EngagementNote.season is SetNull and InviteToken has no season link. Left
  // in place, either one makes the user delete below throw and strands test
  // rows in a database jpc-space is live against.
  await db.engagementNote.deleteMany({
    where: { OR: [{ studentUser: testUserFilter }, { authorUser: testUserFilter }] },
  });
  await db.inviteToken.deleteMany({ where: { invitedBy: testUserFilter } });

  await db.refreshToken.deleteMany({ where: { user: testUserFilter } });
  await db.studentProfile.deleteMany({ where: { user: testUserFilter } });
  await db.user.deleteMany({ where: testUserFilter });
}

type Weights = PassWeights;
const NUMBER_KEYS = ["attendance", "assignments", "quizzes"] as const;

/**
 * Criteria End accepts for this season: what its check offers, unless that weights a number the
 * season has nothing for; then everything on the first number it has (as an admin would fix it).
 */
export async function endCriteriaOf(seasonId: number): Promise<{ weights: Weights; passMark: number }> {
  const check = await loadSeasonEndCheck(seasonId, new Date());
  const { weights } = check.criteria;
  const has = NUMBER_KEYS.filter((k) => check.available[k]);
  const fits = has.length === 0 || NUMBER_KEYS.every((k) => weights[k] === 0 || check.available[k]);
  const fitted = fits ? weights : { attendance: 0, assignments: 0, quizzes: 0, [has[0]!]: 100 };
  return { weights: fitted, passMark: check.criteria.passMark };
}

type Reviewed = { graduatesOnPass: boolean; userIds: number[]; scores: { userId: number; score: number | null }[] };

/**
 * What End's review screen would send: the season's flag, its live ACTIVE students and their
 * scores under `weights` (by default `endCriteriaOf`'s), as they are now.
 */
export async function reviewedOf(seasonId: number, weights?: Weights): Promise<Reviewed> {
  const check = await loadSeasonEndCheck(seasonId, new Date());
  const w = weights ?? (await endCriteriaOf(seasonId)).weights;
  return {
    graduatesOnPass: check.graduatesOnPass,
    userIds: check.students.map((s) => s.userId),
    scores: check.students.map((s) => ({ userId: s.userId, score: weightedScore(passingPcts(s.numbers), w).score })),
  };
}

/** A whole End body: `notPassed`, the criteria `endCriteriaOf` picks and `reviewed` (by default `reviewedOf`). */
export async function endBodyOf(
  seasonId: number,
  notPassed: { userId: number; reason: string | null }[] = [],
  reviewed?: Reviewed,
) {
  const criteria = await endCriteriaOf(seasonId);
  return {
    notPassed,
    passedNotes: [],
    ...criteria,
    reviewed: reviewed ?? (await reviewedOf(seasonId, criteria.weights)),
  };
}

/** An access token for this user with their live scopes, minted directly (no login round trip). */
export async function tokenFor(userId: number): Promise<string> {
  const scopes = await loadScopes(userId);
  return (await signAccessToken({ userId, ...scopes })).token;
}

/** The Authorization header for a token, for supertest's `.set(...)`. */
export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
