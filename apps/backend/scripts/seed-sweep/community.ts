import bcrypt from "bcryptjs";

import { db } from "../../src/db/client";
import { newPublicId } from "../../src/lib/public-id";
import type { SweepPeople } from "./people";
import { fromToday, SWEEP_PASSWORD } from "./shared";

/**
 * The community-model screens (sweep flows in student-scenarios/s5x, admin-scenarios/s6x).
 *
 * Students between seasons, one per state Today tells apart:
 *   finished@ (newest enrolment COMPLETED, passed), student3@ (dropped, seeded in
 *   scenarios.ts), fresh@ (never enrolled), alumni@ (graduated; also given a result).
 * The finished season has an assignment, a quiz and a session behind its three lists.
 * "Spring Intensive" is an ACTIVE season past its end date that the admin runs: the
 * overdue callout and the End review list (nothing blocks it). The current season is
 * already blocked (a SUBMITTED reflection, a quiz attempt, an unmarked session), which
 * is the blockers state. Flows only open these; nothing here is ever saved by a flow.
 *
 * "Community Gathering" is a community-wide DRAFT (the Alumni tab of the people picker,
 * Select all across both tabs, and Start's "Seasons to end first" list, since the
 * ACTIVE seasons above stand in its way). Only the draft is seeded: a community-wide
 * season runs alone, so a live one would break every scenario here that needs ACTIVE
 * seasons (and `preflight:community` would call the seed a violation), which also rules
 * out a studying alumnus. Those screens are reached by a flow that makes the draft the
 * only live season first, then a studying alumnus signs in; neither is a save a flow
 * makes, so it is the seed's job in a separate run (see the Task 8 sweep notes).
 */
export async function seedCommunityScenario({ superUser, admin, leader, alumni, pastSeason }: SweepPeople): Promise<{
  finished: { email: string; name: string };
  fresh: { email: string; name: string };
}> {
  const passwordHash = await bcrypt.hash(SWEEP_PASSWORD, 10);
  const student = (key: string, name: string) =>
    db.user.create({ data: { email: `${key}@sweep.jpc.test`, name, role: "STUDENT", passwordHash } });

  const finished = await student("finished", "Fady Finished");
  const fresh = await student("fresh", "Nour Newcomer");
  await db.studentProfile.create({ data: { userId: finished.id, university: "Cairo University" } });

  // Results on the finished season, so Today's card and the history say "Passed".
  const stamp = { result: "PASSED" as const, resultSetAt: fromToday(-380) };
  await db.seasonEnrollment.updateMany({
    where: { studentUserId: alumni.id, seasonId: pastSeason.id },
    data: stamp,
  });
  await db.seasonEnrollment.create({
    data: {
      studentUserId: finished.id,
      seasonId: pastSeason.id,
      status: "COMPLETED",
      enrolledAt: fromToday(-500),
      completedAt: fromToday(-380),
      ...stamp,
    },
  });

  // Behind the three lists of the finished season.
  const finale = await db.session.findFirstOrThrow({ where: { seasonId: pastSeason.id } });
  const assignment = await db.assignment.create({
    data: {
      seasonId: pastSeason.id,
      sessionId: finale.id,
      title: "Closing reflection",
      description: "<p>Write what you take away from the season.</p>",
      dueAt: fromToday(-385),
      isAllGroups: true,
      createdById: admin.id,
    },
  });
  await db.submission.create({
    data: {
      publicId: newPublicId(),
      assignmentId: assignment.id,
      studentUserId: finished.id,
      text: "I learned to ask better questions.",
      status: "REVIEWED",
      submittedAt: fromToday(-386),
      reviewedAt: fromToday(-384),
      reviewedById: leader.id,
      feedback: "Well said.",
    },
  });
  const quiz = await db.quiz.create({
    data: {
      seasonId: pastSeason.id,
      title: "Final check-in",
      kind: "ONLINE",
      maxScore: 1,
      publishedAt: fromToday(-390),
      createdById: admin.id,
    },
  });
  await db.quizQuestion.create({
    data: { quizId: quiz.id, order: 1, type: "MCQ", prompt: "Which hall did we meet in?", points: 1, options: ["Hall A", "Hall B"], correctIndex: 0 },
  });
  await db.quizAttempt.create({
    data: { quizId: quiz.id, studentUserId: finished.id, status: "GRADED", autoScore: 1, totalScore: 1, submittedAt: fromToday(-389), gradedAt: fromToday(-389) },
  });
  await db.attendance.create({
    data: { sessionId: finale.id, studentUserId: finished.id, status: "PRESENT", markedById: leader.id },
  });

  // An overdue season the admin runs, with students and nothing left to mark.
  const year = new Date().getUTCFullYear();
  const overdue = await db.season.create({
    data: {
      code: `spring-${year}`,
      title: `Spring Intensive ${year}`,
      program: "GBV",
      year,
      status: "ACTIVE",
      startDate: fromToday(-60),
      endDate: fromToday(-3),
      createdById: superUser.id,
    },
  });
  await db.seasonAdmin.create({ data: { seasonId: overdue.id, userId: admin.id, assignedById: superUser.id } });
  const group = await db.group.create({ data: { seasonId: overdue.id, name: "Spring Group" } });
  for (const [key, name] of [["spring1", "Sami Spring"], ["spring2", "Salwa Spring"], ["spring3", "Sherif Spring"]] as const) {
    const s = await student(key, name);
    await db.groupStudent.create({ data: { groupId: group.id, seasonId: overdue.id, studentUserId: s.id } });
    await db.seasonEnrollment.create({
      data: { studentUserId: s.id, seasonId: overdue.id, groupId: group.id, status: "ACTIVE", enrolledAt: fromToday(-60) },
    });
  }

  // A community-wide draft, empty: Super picks its people on the picker's two tabs.
  await db.season.create({
    data: {
      code: `community-${year + 1}`,
      title: `Community Gathering ${year + 1}`,
      program: "COMMUNITY",
      year: year + 1,
      status: "DRAFT",
      isCommunityWide: true,
      startDate: fromToday(30),
      endDate: fromToday(120),
      createdById: superUser.id,
    },
  });
  return { finished, fresh };
}
