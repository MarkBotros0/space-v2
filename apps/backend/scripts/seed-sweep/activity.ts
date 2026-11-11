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

  return { reflection, reading, parts, onlineQuiz };
}

export type SweepActivity = Awaited<ReturnType<typeof seedActivity>>;
