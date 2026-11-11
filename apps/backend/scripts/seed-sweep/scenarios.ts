import { db } from "../../src/db/client";
import { saveAnswers, submitAnswers } from "../../src/lib/quizzes/attempts";
import type { SweepActivity } from "./activity";
import { markSubmitted, seedTextWork } from "./assignment-work";
import type { SweepPeople } from "./people";
import { fromToday } from "./shared";

/** The student's notifications. */
export async function seedStudentScenario({ student }: SweepPeople): Promise<void> {
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
}

/** Leader review queue, a quiz attempt to grade, notes and notifications. */
export async function seedLeaderScenario(
  { leader, student, classmate, season }: SweepPeople,
  { reflection, reading, onlineQuiz }: SweepActivity,
): Promise<void> {
  // Leader review queue: the classmate's late essay waits for review and a
  // reviewed one carries feedback, so the queue shows both chips.
  await seedTextWork({
    assignmentId: reflection.id,
    partId: reflection.essayPartId,
    studentUserId: classmate.id,
    text: "Opening night reminded me why I joined. The worship set was my favourite part.",
    status: "SUBMITTED",
    submittedAt: fromToday(-1),
  });
  await markSubmitted(reflection.id, classmate.id, fromToday(-1));
  await seedTextWork({
    assignmentId: reading.id,
    partId: reading.essayPartId,
    studentUserId: classmate.id,
    text: "Three questions: who wrote it, why now, and what changes?",
    status: "REVIEWED",
    submittedAt: fromToday(-1),
    reviewedAt: fromToday(0),
    reviewedById: leader.id,
    feedback: "Good questions. Bring them to the next session.",
  });
  await markSubmitted(reading.id, classmate.id, fromToday(-1), fromToday(0));

  // The online quiz has a submitted attempt with an essay answer waiting to
  // be graded, so the leader's grading page shows an attempt card.
  const [hall, length, essay] = await db.quizQuestion.findMany({
    where: { quizId: onlineQuiz.id },
    orderBy: { order: "asc" },
    select: { id: true, quizOptions: { select: { id: true, label: true } } },
  });
  if (!hall || !length || !essay) throw new Error("seed-sweep: the online quiz needs two choices and an essay");
  const option = (q: typeof hall, label: string) => q.quizOptions.find((o) => o.label === label)!.id;
  const attempt = await db.quizAttempt.create({ data: { quizId: onlineQuiz.id, studentUserId: classmate.id } });
  await saveAnswers(attempt.id, [
    { type: "SINGLE_CHOICE", questionId: hall.id, optionId: option(hall, "Hall A") },
    { type: "SINGLE_CHOICE", questionId: length.id, optionId: option(length, "60 minutes") },
    { type: "ESSAY", questionId: essay.id, text: "I hope to learn how to lead a small group well." },
  ]);
  // One right, one wrong, the essay waiting for the leader: SUBMITTED.
  await submitAnswers(onlineQuiz.id, attempt.id);

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
        title: "Reviewed: Week 1 reading",
        body: "Feedback was recorded for Salma Student.",
        link: "/submissions",
        readAt: fromToday(-1),
      },
    ],
  });
}

/** Admin-side rows: a note, an event, a dropped student, notifications. */
export async function seedAdminScenario({ user, superUser, admin, student, season }: SweepPeople): Promise<void> {
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
      enrolledAt: fromToday(-30),
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
}
