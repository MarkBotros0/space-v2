import { db } from "../../src/db/client";
import type { SweepPeople } from "./people";
import { seedHeldQuizAttempt } from "./quiz-types";
import { fromToday } from "./shared";

/**
 * The held student (docs/rules/quiz-integrity.md "Relaunch and the route lock"): their attempt on
 * quiz 3 is open, so signing in lands on it and every other route comes back to it (s06b-held.yaml).
 * In Group B, which the sweep leader doesn't lead, so the leader's rosters and shots don't change.
 * Seeded last: user, group and attempt ids the earlier flows name stay where they are.
 * "student3" is scenarios.ts's dropped student, so this one is student4.
 */
export async function seedHeldStudent({ user, season }: SweepPeople) {
  const held = await user("student4", "Hadi Student", "STUDENT");
  const group = await db.group.create({
    data: { seasonId: season.id, name: "Group B", description: "Thursday evening group" },
  });
  await db.groupStudent.create({ data: { groupId: group.id, seasonId: season.id, studentUserId: held.id } });
  await db.seasonEnrollment.create({
    data: {
      studentUserId: held.id,
      seasonId: season.id,
      groupId: group.id,
      status: "ACTIVE",
      enrolledAt: fromToday(-30),
    },
  });
  await db.studentProfile.create({ data: { userId: held.id, university: "Cairo University" } });
  await seedHeldQuizAttempt(held.id);
  return held;
}
