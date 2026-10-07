import { randomUUID } from "node:crypto";

import bcrypt from "bcryptjs";
import request from "supertest";
import type { Express } from "express";

import { db } from "../../db/client";

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

export function testEmail(label: string): string {
  return `${TEST_PREFIX}${label}-${randomUUID()}${EMAIL_SUFFIX}`;
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

export async function createTestUser(
  label: string,
  role: TestRole,
): Promise<{ id: number; email: string }> {
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
export async function createUnactivatedTestUser(
  label: string,
  role: TestRole,
): Promise<{ id: number; email: string }> {
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
      where: { question: { session: inSeasons } },
    });
    await db.sessionVideoProgress.deleteMany({ where: { session: inSeasons } });
    await db.sessionVideoQuestion.deleteMany({ where: { session: inSeasons } });
    await db.forumComment.deleteMany({ where: { submission: { assignment: inSeasons } } });
    await db.attendance.deleteMany({ where: { session: inSeasons } });
    await db.submissionFile.deleteMany({
      where: { submission: { assignment: inSeasons } },
    });
    await db.submission.deleteMany({ where: { assignment: inSeasons } });
    await db.assignmentTarget.deleteMany({ where: { assignment: inSeasons } });
    await db.assignment.deleteMany({ where: inSeasons });
    await db.seasonEnrollment.deleteMany({ where: inSeasons });
    await db.groupLeader.deleteMany({ where: { group: inSeasons } });
    await db.groupStudent.deleteMany({ where: { group: inSeasons } });
    await db.group.deleteMany({ where: inSeasons });
    await db.session.deleteMany({ where: inSeasons });
    await db.seasonAdmin.deleteMany({ where: inSeasons });
    await db.studentProfile.deleteMany({ where: { activeSeasonId: { in: seasonIds } } });
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
