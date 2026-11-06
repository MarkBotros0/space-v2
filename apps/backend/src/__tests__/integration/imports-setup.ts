// apps/backend/src/__tests__/integration/imports-setup.ts
//
// Shared setup for the imports-*-routes suites, split out of the original
// imports-routes.test.ts. Not a test file (jest's testMatch is *.test.ts).
import type { Express } from "express";

import { db } from "../../db/client";
import { TEST_PREFIX, cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

/**
 * ── THE PREFIX GUARD ──────────────────────────────────────────────────────
 *
 * This is the only suite in the repo that asks the API to CREATE USERS OUT OF
 * FREE TEXT, against a staging database jpc-space is live on. `cleanupTestData`
 * finds users with `{ email: { startsWith: "space-v2-test-", endsWith:
 * "@jpc.test" } }` and nothing else — so a single mistyped fixture address
 * mints a real-looking account that nothing will ever delete.
 *
 * `sheet()` therefore REFUSES to build a paste containing an email cleanup
 * could not reach. Every paste in this file goes through it. Never build one
 * by hand, and never inline a literal address.
 * ──────────────────────────────────────────────────────────────────────────
 */
export function sheet(header: string, ...lines: string[]): string {
  for (const line of [header, ...lines]) {
    for (const cell of line.split(/[\t,]/)) {
      const value = cell.trim();
      if (!value.includes("@")) continue;
      // Compared lower-cased: the case-insensitivity tests deliberately paste
      // `testEmail(...).toUpperCase()`, which is still a fixture address. Any
      // uppercase variant the importer wrongly stored is swept by the
      // case-insensitive delete in afterAll below.
      const lower = value.toLowerCase();
      if (!(lower.startsWith(TEST_PREFIX) && lower.endsWith("@jpc.test"))) {
        throw new Error(
          `Fixture paste contains "${value}", which cleanupTestData cannot delete. ` +
            `Every fixture email must come from testEmail().`,
        );
      }
    }
  }
  return [header, ...lines].join("\n");
}

/** Post-commit assertion helper — reads back exactly the rows a paste named. */
export async function usersByEmail(emails: string[]) {
  return db.user.findMany({
    where: { email: { in: emails } },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      passwordHash: true,
      graduationYear: true,
      phone: true,
      dateOfBirth: true,
      studentProfile: { select: { activeSeasonId: true, university: true, faculty: true, universityGraduationYear: true, notes: true } },
      seasonEnrollments: { select: { seasonId: true, status: true, groupId: true } },
    },
  });
}

export async function oneUserByEmail(email: string) {
  const [row] = await usersByEmail([email]);
  if (!row) throw new Error("expected the import to have created a user for that address");
  return row;
}

export interface ImportFixtures {
  seasonId: number;
  otherSeasonId: number;
  superToken: string;
  adminToken: string;
  studentToken: string;
}

/** The original suite's beforeAll body, verbatim, returning what it set. */
export async function seedImportFixtures(app: Express): Promise<ImportFixtures> {
  await cleanupTestData();

  // EVERY season here is a test season. See the fixture-safety audit: an
  // enrolment written into a real season survives cleanup and then blocks the
  // user delete behind SeasonEnrollment's onDelete: Restrict.
  const seasonId = (await createTestSeason()).id;
  const otherSeasonId = (await createTestSeason()).id;

  const superUser = await createTestUser("super", "SUPER");
  const admin = await createTestUser("admin", "ADMIN");
  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  const student = await createTestUser("student", "STUDENT");

  const superToken = await login(app, superUser.email);
  const adminToken = await login(app, admin.email);
  const studentToken = await login(app, student.email);

  return { seasonId, otherSeasonId, superToken, adminToken, studentToken };
}

/** The original suite's afterAll body, verbatim. */
export async function teardownImportFixtures(): Promise<void> {
  await cleanupTestData();
  // cleanupTestData's filter is case-SENSITIVE. This suite pastes uppercase
  // variants of fixture addresses on purpose; if a regression ever stored one,
  // the shared filter would miss it. Sweep case-insensitively before asserting.
  const anyCase = {
    email: { startsWith: TEST_PREFIX, endsWith: "@jpc.test", mode: "insensitive" as const },
  };
  await db.studentProfile.deleteMany({ where: { user: anyCase } });
  await db.user.deleteMany({ where: anyCase });
  // Belt and braces on a shared database: prove the suite left nothing.
  const strays = await db.user.count({
    where: { email: { startsWith: TEST_PREFIX, mode: "insensitive" } },
  });
  if (strays !== 0) {
    throw new Error(`imports suite left ${strays} prefixed users behind — cleanupTestData did not reach them`);
  }
  await db.$disconnect();
}
