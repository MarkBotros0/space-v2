import { db } from "../../src/db/client";
import { addQuizQuestion } from "../../src/lib/quizzes/questions";
import type { SweepPeople } from "./people";
import { seedQuizTypes } from "./quiz-types";
import { createEssayAssignment, seedTextWork } from "./assignment-work";
import { seedThreePartAssignment } from "./three-part";
import { fromToday } from "./shared";

/** Sessions, attendance, assignments with the student's drafts, and quizzes. */
export async function seedActivity(people: SweepPeople) {
  const { admin, leader, student, classmate, season, pastSeason } = people;
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

  const reflection = await createEssayAssignment({
    seasonId: season.id,
    title: "Opening night reflection",
    description: "<p>Write a short reflection on the opening night.</p>",
    dueAt: fromToday(-2),
    createdById: admin.id,
    prompt: "What stayed with you from the opening night?",
  });
  const reading = await createEssayAssignment({
    seasonId: season.id,
    title: "Read chapter 2",
    description: "<p>Read chapter 2 and note three questions.</p>",
    dueAt: fromToday(10),
    createdById: admin.id,
    prompt: "Note three questions chapter 2 raised for you.",
  });
  // A draft on the overdue one, so its essay screen shows saved text; the reading
  // stays untouched ("Not started").
  await seedTextWork({
    assignmentId: reflection.id,
    partId: reflection.essayPartId,
    studentUserId: student.id,
    text: "It was a good start to the season.",
    status: "DRAFT",
  });
  const parts = await seedThreePartAssignment({ admin, leader, student, classmate, season });

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
  // Through the backend's own writer, so the options are QuizOption rows like the app's.
  await addQuizQuestion(onlineQuiz.id, {
    type: "SINGLE_CHOICE",
    prompt: "Which hall do we meet in?",
    points: 1,
    options: [
      { label: "Hall A", isCorrect: true },
      { label: "Hall B", isCorrect: false },
      { label: "Online", isCorrect: false },
    ],
  });
  await addQuizQuestion(onlineQuiz.id, {
    type: "SINGLE_CHOICE",
    prompt: "How long is a session?",
    points: 1,
    options: [
      { label: "60 minutes", isCorrect: false },
      { label: "90 minutes", isCorrect: true },
      { label: "2 hours", isCorrect: false },
    ],
  });
  await addQuizQuestion(onlineQuiz.id, { type: "ESSAY", prompt: "What do you hope to learn this season?", points: 1 });
  // Every question type, Arabic content and each attempt stage (quiz-types.ts).
  await seedQuizTypes(people);
  await seedTimedQuizzes(people);
  await seedAdminScore(people);

  return { reflection, reading, parts, onlineQuiz };
}

const HOUR = 60 * 60 * 1000;
/**
 * An open attempt's deadline. Hours rather than the 20 minutes a start would give: the server only
 * compares `deadlineAt`, and the sweep runs a while after the seed, so the attempt must still be open
 * then (the read closes one past its deadline). The countdown shows hours for it.
 */
const SWEEP_DEADLINE_MS = 6 * HOUR;

/**
 * Timed quizzes, quiz 8 to 10 (quiz-types.ts makes 3 to 7): a start window open now, 20 minutes each
 * (docs/rules/quiz-integrity.md "Timing"). Quiz 8 is not started by the student, so the start card
 * names the limit, and the classmate is part-way through it, so staff grading offers End attempt.
 * Quiz 9 has the classmate's attempt running, so the countdown shows when the classmate signs in
 * (s06b-held.yaml): one account holds one open attempt, so the main student holds none.
 * Integrity (docs/rules/quiz-integrity.md): the classmate's open attempt on quiz 8 has two exits, so
 * the live screen lists it first with "2 exits"; quiz 10 is the classmate's attempt ended by a third
 * exit, with a full exit log (exits, a relaunch and a blocked screenshot) for the attempt sheet.
 */
async function seedTimedQuizzes({ admin, classmate, season }: SweepPeople) {
  const now = Date.now();
  const timed = {
    seasonId: season.id,
    kind: "ONLINE" as const,
    maxScore: 2,
    publishedAt: fromToday(-1),
    createdById: admin.id,
    startsFrom: new Date(now - HOUR),
    startsUntil: fromToday(7),
    timeLimitMinutes: 20,
  };
  const question = (prompt: string, right: string, wrong: string) => ({
    type: "SINGLE_CHOICE" as const,
    prompt,
    points: 1,
    options: [
      { label: right, isCorrect: true },
      { label: wrong, isCorrect: false },
    ],
  });
  const minutesAgo = (m: number) => new Date(now - m * 60_000);
  const open = (quizId: number, studentUserId: number) =>
    db.quizAttempt.create({
      data: { quizId, studentUserId, shuffleSeed: 424242, deadlineAt: new Date(now + SWEEP_DEADLINE_MS) },
    });

  const startCard = await db.quiz.create({ data: { ...timed, title: "Timed check-in" } });
  await addQuizQuestion(startCard.id, question("Which hall do we meet in?", "Hall A", "Hall B"));
  await addQuizQuestion(startCard.id, question("How long is a session?", "90 minutes", "2 hours"));
  const exiting = await open(startCard.id, classmate.id);
  await db.quizAttemptEvent.createMany({
    data: [
      {
        attemptId: exiting.id,
        kind: "EXIT",
        clientEventId: "sweep-8-exit-1",
        leftAt: minutesAgo(12),
        returnedAt: minutesAgo(11),
      },
      {
        attemptId: exiting.id,
        kind: "EXIT",
        clientEventId: "sweep-8-exit-2",
        leftAt: minutesAgo(5),
        returnedAt: minutesAgo(4),
      },
    ],
  });

  const running = await db.quiz.create({ data: { ...timed, title: "Timed practice" } });
  await addQuizQuestion(running.id, question("Who leads the opening night?", "The season admin", "A student"));
  await addQuizQuestion(running.id, question("Where are notes kept?", "In the app", "On paper"));
  await open(running.id, classmate.id);

  // Quiz 10: the classmate's attempt was ended by the third exit (submitted as it stood), with the log staff read.
  const ended = await db.quiz.create({ data: { ...timed, title: "Timed review" } });
  await addQuizQuestion(ended.id, question("Which day is the sweep?", "Monday", "Friday"));
  await addQuizQuestion(ended.id, question("Who marks the quiz?", "The leader", "Nobody"));
  const endedAttempt = await db.quizAttempt.create({
    data: {
      quizId: ended.id,
      studentUserId: classmate.id,
      shuffleSeed: 424242,
      status: "SUBMITTED",
      endReason: "ENDED_BY_EXITS",
      deadlineAt: new Date(now + SWEEP_DEADLINE_MS),
      submittedAt: minutesAgo(1),
    },
  });
  await db.quizAttemptEvent.createMany({
    data: [
      {
        attemptId: endedAttempt.id,
        kind: "EXIT",
        clientEventId: "sweep-10-exit-1",
        leftAt: minutesAgo(30),
        returnedAt: minutesAgo(29),
      },
      {
        attemptId: endedAttempt.id,
        kind: "SCREENSHOT",
        clientEventId: "sweep-10-shot-1",
        leftAt: minutesAgo(20),
        returnedAt: null,
      },
      {
        attemptId: endedAttempt.id,
        kind: "RELAUNCH",
        clientEventId: "sweep-10-relaunch-1",
        leftAt: minutesAgo(10),
        returnedAt: minutesAgo(9),
      },
      {
        attemptId: endedAttempt.id,
        kind: "EXIT",
        clientEventId: "sweep-10-exit-2",
        leftAt: minutesAgo(2),
        returnedAt: null,
      },
    ],
  });
}

/**
 * The season admin's score (docs/rules/quiz-results.md "Manual score"): the student's "Week 1 review"
 * (quiz 4, online, published, graded) carries an admin score below their graded app score, with a
 * note. The student is no one's open attempt (held.ts holds student4 and the classmate), so the score
 * can be entered. Appended last, so no id a flow names moves: it adds a row, never a quiz.
 */
async function seedAdminScore({ admin, student }: SweepPeople) {
  const quiz = await db.quiz.findFirstOrThrow({ where: { title: "Week 1 review" }, select: { id: true } });
  const best = await db.quizAttempt.findFirstOrThrow({
    where: { quizId: quiz.id, studentUserId: student.id, status: "GRADED" },
    select: { totalScore: true },
  });
  const app = Number(best.totalScore ?? 0);
  await db.quizGrade.create({
    data: {
      quizId: quiz.id,
      studentUserId: student.id,
      score: Math.max(0, app - 1.5),
      notes: "Adjusted after the leaders reviewed the essay answers together.",
      gradedById: admin.id,
      gradedAt: fromToday(0, 11),
    },
  });
}

export type SweepActivity = Awaited<ReturnType<typeof seedActivity>>;
