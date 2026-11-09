/**
 * Seeds a throwaway database with fake users for the CI UI sweep
 * (.github/workflows/ui-sweep.yml), so signed-in sweep flows never touch the
 * staging database shared with jpc-space (v1) or its real accounts.
 *
 * Usage (from apps/backend, DATABASE_URL pointing at a LOCAL, freshly
 * migrated database — scripts/apply-migrations.sh):
 *   pnpm seed:sweep [users.json]
 *
 * One user per role the sweep signs in as, the same keys as
 * tools/ui-reference/pick-users.mjs, written to the given users.json path so
 * ui-sweep.mjs reads it like the devbox one. Dates are relative to today, so
 * an active season, a past and an upcoming session and an open assignment
 * always exist whenever the sweep runs.
 *
 * Refuses to run against a non-local database.
 */
import { writeFileSync } from "node:fs";

import { db } from "../src/db/client";
import { config } from "../src/lib/config";
import { databaseHost } from "./lib/db-host";
import { seedAnnouncementScenario } from "./seed-sweep/announcements";
import { seedActivity } from "./seed-sweep/activity";
import { seedCommunityScenario } from "./seed-sweep/community";
import { seedAlumniScenario, seedMentorScenario, seedSuperScenario } from "./seed-sweep/more-roles";
import { seedPeople } from "./seed-sweep/people";
import { seedAdminScenario, seedLeaderScenario, seedStudentScenario } from "./seed-sweep/scenarios";

export { SWEEP_PASSWORD } from "./seed-sweep/shared";

function assertLocalDatabase(): void {
  const host = databaseHost(config.databaseUrl);
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) {
    throw new Error(
      `seed:sweep refuses to run against "${host}": it only seeds a local database, ` +
        "never the staging database shared with jpc-space.",
    );
  }
}

async function main(): Promise<void> {
  assertLocalDatabase();
  if ((await db.user.count()) > 0) throw new Error("seed:sweep expects an empty, freshly migrated database.");

  // Order matters: ids are insertion order, and the sweep flows name some of
  // them (e.g. leader-scenarios/s14-session-attendance.yaml's session ids).
  const people = await seedPeople();
  const activity = await seedActivity(people);
  await seedStudentScenario(people);
  await seedLeaderScenario(people, activity);
  await seedAdminScenario(people);
  // Last, so the ids the earlier flows name stay where they are.
  await seedSuperScenario(people);
  await seedMentorScenario(people);
  await seedAlumniScenario(people);
  const community = await seedCommunityScenario(people);
  await seedAnnouncementScenario(people);

  const { student, alumni, leader, admin, superUser, mentor } = people;
  // `dropped` is scenarios.ts's student3; the others are the community-model states.
  const dropped = await db.user.findFirstOrThrow({ where: { email: "student3@sweep.jpc.test" } });
  const roles = { student, alumni, leader, admin, super: superUser, mentor, ...community, dropped };
  const users = Object.fromEntries(Object.entries(roles).map(([role, u]) => [role, { email: u.email, name: u.name }]));
  const out = process.argv[2];
  if (out) writeFileSync(out, JSON.stringify(users, null, 2));
  console.log(`Seeded ${Object.keys(users).length} sweep roles${out ? ` -> ${out}` : ""}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
