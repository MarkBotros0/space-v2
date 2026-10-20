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
  const reading = await db.assignment.create({
    data: {
      seasonId: season.id,
      title: "Read chapter 2",
      description: "<p>Read chapter 2 and note three questions.</p>",
      dueAt: fromToday(10),
      isAllGroups: true,
      createdById: admin.id,
    },
  });
  // Drafts on both, so whichever assignment a flow opens shows the editable
  // response box. Without a submission the page offers "Start working",
  // which creates one, and sweep flows never save.
  await db.submission.createMany({
    data: [
      {
        publicId: newPublicId(),
        assignmentId: reflection.id,
        studentUserId: student.id,
        text: "It was a good start to the season.",
        status: "DRAFT",
      },
      {
        publicId: newPublicId(),
        assignmentId: reading.id,
        studentUserId: student.id,
        status: "DRAFT",
      },
    ],
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

  // Leader review queue: the classmate's late submission waits for review and
  // a reviewed one carries feedback, so the queue shows both badges.
  await db.submission.createMany({
    data: [
      {
        publicId: newPublicId(),
        assignmentId: reflection.id,
        studentUserId: classmate.id,
        text: "Opening night reminded me why I joined. The worship set was my favourite part.",
        status: "SUBMITTED",
        submittedAt: fromToday(-1),
      },
      {
        publicId: newPublicId(),
        assignmentId: reading.id,
        studentUserId: classmate.id,
        text: "Three questions: who wrote it, why now, and what changes?",
        status: "REVIEWED",
        submittedAt: fromToday(-1),
        reviewedAt: fromToday(0),
        reviewedById: leader.id,
        feedback: "Good questions. Bring them to the next session.",
      },
    ],
  });

  // The online quiz has a submitted attempt with an essay answer waiting to
  // be graded, so the leader's grading page shows an attempt card.
  const [mcq1, mcq2, essay] = await db.quizQuestion.findMany({
    where: { quizId: onlineQuiz.id },
    orderBy: { order: "asc" },
  });
  const attempt = await db.quizAttempt.create({
    data: {
      quizId: onlineQuiz.id,
      studentUserId: classmate.id,
      status: "SUBMITTED",
      autoScore: 1,
      submittedAt: fromToday(0),
    },
  });
  await db.quizAnswer.createMany({
    data: [
      { attemptId: attempt.id, questionId: mcq1.id, selectedIndex: 0, isCorrect: true, pointsAwarded: 1 },
      { attemptId: attempt.id, questionId: mcq2.id, selectedIndex: 0, isCorrect: false, pointsAwarded: 0 },
      {
        attemptId: attempt.id,
        questionId: essay.id,
        text: "I hope to learn how to lead a small group well.",
      },
    ],
  });

  // Notes the leader has written, for My notes and the student's page.
  await db.engagementNote.createMany({
    data: [
      {
        studentUserId: student.id,
        authorUserId: leader.id,
        seasonId: season.id,
        body: "Quiet in group but opened up after the second session. Worth checking in.",
        visibility: "LEADERS",
        followUpFlagged: true,
      },
      {
        studentUserId: classmate.id,
        authorUserId: leader.id,
        seasonId: season.id,
        body: "Prayer request: exams next week.",
        visibility: "LEADERS",
      },
    ],
  });
  await db.notification.createMany({
    data: [
      {
        userId: leader.id,
        type: "LOW_ATTENDANCE_FLAG",
        title: "Salma Student was late to Opening night",
        link: "/groups",
      },
      {
        userId: leader.id,
        type: "SUBMISSION_REVIEWED",
        title: "New submission: Opening night reflection",
        body: "Salma Student submitted late.",
        link: "/submissions",
        readAt: fromToday(-1),
      },
    ],
  });

  // Admin-side rows (admin-scenarios, s20-s28). The submission to review is the
  // classmate's SUBMITTED reflection seeded above for the leader.
  await db.engagementNote.create({
    data: {
      studentUserId: student.id,
      authorUserId: admin.id,
      seasonId: season.id,
      body: "Settled in well; check in again after week 3.",
      visibility: "ADMINS",
    },
  });
  await db.jpcEvent.create({
    data: {
      title: "Sweep kickoff event",
      date: fromToday(14),
      description: "Fake organisation-wide event for the UI sweep.",
      visibility: "ALL",
      createdById: superUser.id,
    },
  });
  // A withdrawn student, so the Dropped students list has a row.
  const dropped = await user("student3", "Dina Dropped", "STUDENT");
  await db.seasonEnrollment.create({
    data: {
      studentUserId: dropped.id,
      seasonId: season.id,
      status: "WITHDRAWN",
      droppedAt: fromToday(-10),
      dropReason: "Moved away",
    },
  });
  await db.studentProfile.create({ data: { userId: dropped.id, university: "Cairo University" } });
  await db.notification.createMany({
    data: [
      {
        userId: admin.id,
        type: "LOW_ATTENDANCE_FLAG",
        title: "Salma Student is low on attendance budget",
        link: "/students",
      },
      {
        userId: admin.id,
        type: "SUBMISSION_REVIEWED",
        title: "New submission: Opening night reflection",
        link: "/assignments",
        readAt: fromToday(-1),
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
