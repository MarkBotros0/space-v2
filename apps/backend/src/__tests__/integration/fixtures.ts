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

export function testSeasonCode(): string {
  return `${TEST_PREFIX}${randomUUID()}`;
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
 */
export async function cleanupTestData(): Promise<void> {
  const seasons = await db.season.findMany({
    where: { code: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  const seasonIds = seasons.map((s) => s.id);

  if (seasonIds.length > 0) {
    const inSeasons = { seasonId: { in: seasonIds } } as const;

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
