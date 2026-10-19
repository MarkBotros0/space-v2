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

import bcrypt from "bcryptjs";

import { db } from "../src/db/client";
import { config } from "../src/lib/config";
import { newPublicId } from "../src/lib/public-id";

export const SWEEP_PASSWORD = "sweep-password-123";

const DAY = 24 * 60 * 60 * 1000;
const fromToday = (days: number, hour = 18) => {
  const d = new Date(Date.now() + days * DAY);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
};

function assertLocalDatabase(): void {
  const host = new URL(config.databaseUrl).hostname;
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) {
    throw new Error(
      `seed:sweep refuses to run against "${host}": it only seeds a local database, ` +
        "never the staging database shared with jpc-space.",
    );
  }
}

async function main(): Promise<void> {
  assertLocalDatabase();
  if ((await db.user.count()) > 0)
    throw new Error("seed:sweep expects an empty, freshly migrated database.");

  const passwordHash = await bcrypt.hash(SWEEP_PASSWORD, 10);
  const user = (
    key: string,
    name: string,
    role: "SUPER" | "ADMIN" | "LEADER" | "STUDENT" | "MENTOR",
    graduationYear?: number,
  ) =>
    db.user.create({
      data: { email: `${key}@sweep.jpc.test`, name, role, passwordHash, graduationYear },
    });

  const superUser = await user("super", "Sara Super", "SUPER");
  const admin = await user("admin", "Adam Admin", "ADMIN");
  const leader = await user("leader", "Lina Leader", "LEADER");
  const mentor = await user("mentor", "Mina Mentor", "MENTOR");
  const student = await user("student", "Samir Student", "STUDENT");
  const classmate = await user("student2", "Salma Student", "STUDENT");
  const alumni = await user("alumni", "Aya Alumni", "STUDENT", fromToday(-365).getUTCFullYear());

  const year = new Date().getUTCFullYear();
  const pastSeason = await db.season.create({
    data: {
      code: `gbv-${year - 1}`,
      title: `GBV ${year - 1}`,
      program: "GBV",
      year: year - 1,
      status: "COMPLETED",
      startDate: fromToday(-500),
      endDate: fromToday(-380),
      createdById: superUser.id,
    },
  });
  const season = await db.season.create({
    data: {
      code: `gbv-${year}`,
      title: `GBV ${year}`,
      program: "GBV",
      year,
      description: "Fake season for the UI sweep.",
      status: "ACTIVE",
      startDate: fromToday(-30),
      endDate: fromToday(90),
      createdById: superUser.id,
    },
  });
  await db.seasonAdmin.create({
    data: { seasonId: season.id, userId: admin.id, assignedById: superUser.id },
  });

  const group = await db.group.create({
    data: { seasonId: season.id, name: "Group A", description: "Tuesday evening group" },
  });
  await db.groupLeader.create({ data: { groupId: group.id, userId: leader.id } });
  for (const s of [student, classmate]) {
    await db.groupStudent.create({ data: { groupId: group.id, studentUserId: s.id } });
    await db.seasonEnrollment.create({
      data: { studentUserId: s.id, seasonId: season.id, groupId: group.id, status: "ACTIVE" },
    });
    await db.studentProfile.create({
      data: { userId: s.id, activeSeasonId: season.id, university: "Cairo University", year: "3" },
    });
  }
  await db.seasonEnrollment.create({
    data: {
      studentUserId: alumni.id,
      seasonId: pastSeason.id,
      status: "COMPLETED",
      completedAt: fromToday(-380),
    },
  });
  await db.studentProfile.create({
    data: { userId: alumni.id, university: "Ain Shams University" },
  });

  const pastSession = await db.session.create({
    data: {
      seasonId: season.id,
      title: "Opening night",
      startsAt: fromToday(-7),
      location: "Hall A",
    },
  });
  await db.session.create({
    data: {
      seasonId: season.id,
      title: "Week 2: Calling",
      startsAt: fromToday(7),
      location: "Hall A",
      description: "Bring a notebook.",
    },
  });
  await db.session.create({
    data: { seasonId: pastSeason.id, title: "Last year's finale", startsAt: fromToday(-390) },
  });
  await db.attendance.create({
    data: {
      sessionId: pastSession.id,
      studentUserId: student.id,
      status: "PRESENT",
      markedById: leader.id,
    },
  });
  await db.attendance.create({
    data: {
      sessionId: pastSession.id,
      studentUserId: classmate.id,
      status: "LATE",
      lateMinutes: 15,
      markedById: leader.id,
    },
  });

  const reflection = await db.assignment.create({
    data: {
      seasonId: season.id,
      sessionId: pastSession.id,
      title: "Opening night reflection",
      description: "<p>Write a short reflection on the opening night.</p>",
      dueAt: fromToday(-2),
      isAllGroups: true,
      createdById: admin.id,
    },
  });
  await db.assignment.create({
    data: {
      seasonId: season.id,
      title: "Read chapter 2",
      description: "<p>Read chapter 2 and note three questions.</p>",
      dueAt: fromToday(10),
      isAllGroups: true,
      createdById: admin.id,
    },
  });
  await db.submission.create({
    data: {
      publicId: newPublicId(),
      assignmentId: reflection.id,
      studentUserId: student.id,
      text: "It was a good start to the season.",
      status: "SUBMITTED",
      submittedAt: fromToday(-3),
    },
  });

  // A graded paper quiz for the performance table, and a published online
  // quiz the student has not started, so "Take quiz" shows.
  const paperQuiz = await db.quiz.create({
    data: {
      seasonId: season.id,
      sessionId: pastSession.id,
      title: "Opening night quiz",
      kind: "PAPER",
      createdById: admin.id,
    },
  });
  await db.quizGrade.create({
    data: {
      quizId: paperQuiz.id,
      studentUserId: student.id,
      score: 82,
      gradedById: leader.id,
      gradedAt: fromToday(-5),
    },
  });
  const onlineQuiz = await db.quiz.create({
    data: {
      seasonId: season.id,
      title: "Week 2 check-in",
      kind: "ONLINE",
      maxScore: 3,
      publishedAt: fromToday(-1),
      createdById: admin.id,
    },
  });
  await db.quizQuestion.createMany({
    data: [
      {
        quizId: onlineQuiz.id,
        order: 1,
        type: "MCQ",
        prompt: "Which hall do we meet in?",
        points: 1,
        options: ["Hall A", "Hall B", "Online"],
        correctIndex: 0,
      },
      {
        quizId: onlineQuiz.id,
        order: 2,
        type: "MCQ",
        prompt: "How long is a session?",
        points: 1,
        options: ["60 minutes", "90 minutes", "2 hours"],
        correctIndex: 1,
      },
      {
        quizId: onlineQuiz.id,
        order: 3,
        type: "ESSAY",
        prompt: "What do you hope to learn this season?",
        points: 1,
      },
    ],
  });

  await db.notification.createMany({
    data: [
      {
        userId: student.id,
        type: "ASSIGNMENT_CREATED",
        title: "New assignment: Read chapter 2",
        link: "/assignments",
      },
      {
        userId: student.id,
        type: "QUIZ_GRADED",
        title: "Opening night quiz graded",
        body: "You scored 82.",
        link: "/quizzes",
        readAt: fromToday(-4),
      },
    ],
  });

  const roles = { student, alumni, leader, admin, super: superUser, mentor };
  const users = Object.fromEntries(
    Object.entries(roles).map(([role, u]) => [role, { email: u.email, name: u.name }]),
  );
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
