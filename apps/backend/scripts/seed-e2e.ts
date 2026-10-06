/**
 * Seed a throwaway database for the mobile end-to-end flows (Maestro).
 *
 * Usage (from apps/backend, DATABASE_URL pointing at a LOCAL database):
 *   pnpm seed:e2e
 *
 * Idempotent: it deletes anything it created on a previous run (everything is
 * keyed on the `e2e-` season code / `@e2e.jpc.test` email domain) and
 * recreates it, so repeated runs land on the same state.
 *
 * Refuses to run against a non-local database. The real staging database is
 * shared with jpc-space (v1); this must never write there.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";

import { db } from "../src/db/client";
import { config } from "../src/lib/config";

export const E2E_PASSWORD = "e2e-password-123";
export const E2E_STUDENT_EMAIL = "student@e2e.jpc.test";
export const E2E_ADMIN_EMAIL = "admin@e2e.jpc.test";
const E2E_SEASON_CODE = "e2e-season";
const E2E_EMAIL_SUFFIX = "@e2e.jpc.test";

function assertLocalDatabase(): void {
  const host = new URL(config.databaseUrl).hostname;
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) {
    throw new Error(
      `seed:e2e refuses to run against "${host}": it only seeds a local database, ` +
        "never the staging database shared with jpc-space.",
    );
  }
}

async function reset(): Promise<void> {
  const season = await db.season.findUnique({ where: { code: E2E_SEASON_CODE } });
  if (season) {
    const inSeason = { seasonId: season.id } as const;
    await db.submissionFile.deleteMany({ where: { submission: { assignment: inSeason } } });
    await db.submission.deleteMany({ where: { assignment: inSeason } });
    await db.assignmentTarget.deleteMany({ where: { assignment: inSeason } });
    await db.assignment.deleteMany({ where: inSeason });
    await db.attendance.deleteMany({ where: { session: inSeason } });
    await db.seasonEnrollment.deleteMany({ where: inSeason });
    await db.groupLeader.deleteMany({ where: { group: inSeason } });
    await db.groupStudent.deleteMany({ where: { group: inSeason } });
    await db.group.deleteMany({ where: inSeason });
    await db.session.deleteMany({ where: inSeason });
    await db.seasonAdmin.deleteMany({ where: inSeason });
    await db.studentProfile.deleteMany({ where: { activeSeasonId: season.id } });
    await db.season.delete({ where: { id: season.id } });
  }
  const users = { email: { endsWith: E2E_EMAIL_SUFFIX } } as const;
  await db.refreshToken.deleteMany({ where: { user: users } });
  await db.studentProfile.deleteMany({ where: { user: users } });
  await db.user.deleteMany({ where: users });
}

async function main(): Promise<void> {
  assertLocalDatabase();
  await reset();

  const passwordHash = await bcrypt.hash(E2E_PASSWORD, 10);
  const admin = await db.user.create({
    data: { email: E2E_ADMIN_EMAIL, name: "E2E Admin", role: "ADMIN", passwordHash },
  });
  const student = await db.user.create({
    data: { email: E2E_STUDENT_EMAIL, name: "E2E Student", role: "STUDENT", passwordHash },
  });

  const season = await db.season.create({
    data: {
      code: E2E_SEASON_CODE,
      title: "E2E Season",
      program: "E2E",
      year: 2099,
      status: "ACTIVE",
      startDate: new Date("2099-01-01T00:00:00.000Z"),
      endDate: new Date("2099-12-31T00:00:00.000Z"),
      createdById: admin.id,
    },
  });
  await db.seasonAdmin.create({ data: { seasonId: season.id, userId: admin.id } });

  const group = await db.group.create({ data: { seasonId: season.id, name: "E2E Group" } });
  await db.groupStudent.create({ data: { groupId: group.id, studentUserId: student.id } });
  await db.seasonEnrollment.create({
    data: { studentUserId: student.id, seasonId: season.id, groupId: group.id, status: "ACTIVE" },
  });
  await db.studentProfile.create({ data: { userId: student.id, activeSeasonId: season.id } });

  await db.session.create({
    data: {
      seasonId: season.id,
      title: "E2E Opening Session",
      startsAt: new Date("2099-01-08T18:00:00.000Z"),
      location: "Hall A",
    },
  });

  await db.assignment.create({
    data: {
      seasonId: season.id,
      title: "E2E Reflection",
      description: "Write a short reflection.",
      dueAt: new Date("2099-02-01T18:00:00.000Z"),
      isAllGroups: true,
      createdById: admin.id,
    },
  });

  console.log(
    `Seeded E2E data: ${E2E_STUDENT_EMAIL} / ${E2E_ADMIN_EMAIL} (password: ${E2E_PASSWORD})`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
