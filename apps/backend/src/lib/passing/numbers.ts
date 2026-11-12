import type { PassingNumbers, SeasonAvailability } from "@space/shared";

import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import { SUBMITTED_WHERE } from "../assignments/submitted";
import { liveAssignment, liveUser } from "../db/live";
import { seasonParticipant } from "../queries/season-participants";
import { countingScore } from "../quizzes/best-attempt";
import { round2, toScore } from "../quizzes/score";

/*
 * THE three numbers of season passing (docs/superpowers/plans/2026-11-12-season-passing.md,
 * "Global Constraints"). Progress, the outlook and End all read them from here.
 *
 * - Attendance: PRESENT or LATE over the season's sessions that have started, from the student's
 *   own enrolment on (the student page's `attendancePctForEnrollments`).
 * - Assignments: submitted (`SUBMITTED_WHERE`: in the app or marked by staff) over the season's
 *   live assignments. Every assignment is for the whole season.
 * - Quizzes: Σ counting score over Σ maxScore of every PAPER quiz and every published ONLINE quiz.
 *   ONLINE counts `countingScore` (the admin's score, else the best GRADED attempt), PAPER its
 *   grade; nothing is 0.
 */

/** The quizzes that count: every PAPER quiz and every published ONLINE quiz. */
export const COUNTED_QUIZ = { OR: [{ kind: "PAPER" as const }, { publishedAt: { not: null } }] };

type Client = Prisma.TransactionClient;

/** Whether the season has anything for each number: any session, any live assignment, any counted quiz. */
export async function loadSeasonAvailability(seasonId: number, client: Client = db): Promise<SeasonAvailability> {
  const [session, assignment, quiz] = await Promise.all([
    client.session.findFirst({ where: { seasonId }, select: { id: true } }),
    client.assignment.findFirst({ where: { seasonId, ...liveAssignment }, select: { id: true } }),
    client.quiz.findFirst({ where: { seasonId, ...COUNTED_QUIZ }, select: { id: true } }),
  ]);
  return { attendance: session !== null, assignments: assignment !== null, quizzes: quiz !== null };
}

/**
 * The three numbers for students of a season, by user id, in a fixed number of queries however many
 * students. `studentUserIds` null means every live participant (`seasonParticipant`); given ids are
 * read as asked, but a deleted account or a student with no enrolment here is left out.
 */
export async function loadPassingNumbers(
  seasonId: number,
  studentUserIds: number[] | null,
  client: Client = db,
  now = new Date(),
): Promise<{ available: SeasonAvailability; numbers: Map<number, PassingNumbers> }> {
  const enrolments = await client.seasonEnrollment.findMany({
    where: {
      seasonId,
      studentUser: liveUser,
      ...(studentUserIds === null ? seasonParticipant : { studentUserId: { in: studentUserIds } }),
    },
    orderBy: { id: "asc" },
    select: { studentUserId: true, enrolledAt: true },
  });
  const ids = enrolments.map((e) => e.studentUserId);
  const [sessions, assignmentCount, quizzes] = await Promise.all([
    client.session.findMany({ where: { seasonId }, select: { id: true, startsAt: true } }),
    client.assignment.count({ where: { seasonId, ...liveAssignment } }),
    client.quiz.findMany({ where: { seasonId, ...COUNTED_QUIZ }, select: { id: true, kind: true, maxScore: true } }),
  ]);
  const available = { attendance: sessions.length > 0, assignments: assignmentCount > 0, quizzes: quizzes.length > 0 };
  const numbers = new Map<number, PassingNumbers>();
  if (ids.length === 0) return { available, numbers };

  const started = sessions.filter((s) => s.startsAt.getTime() <= now.getTime());
  const rows = await loadStudentRows(client, seasonId, ids, started, quizzes);
  const maxTotal = quizzes.reduce((total, q) => total + q.maxScore, 0);
  for (const e of enrolments) {
    const eligible = started.filter((s) => s.startsAt.getTime() >= e.enrolledAt.getTime());
    const attended = eligible.filter((s) => rows.present.has(`${e.studentUserId}:${s.id}`)).length;
    numbers.set(e.studentUserId, {
      attendance: { attended, total: eligible.length },
      assignments: { submitted: rows.submittedBy.get(e.studentUserId) ?? 0, total: assignmentCount },
      quizzes: { scored: quizTotal(e.studentUserId, quizzes, rows), max: maxTotal },
    });
  }
  return { available, numbers };
}

type CountedQuiz = { id: number; kind: "PAPER" | "ONLINE"; maxScore: number };
type StudentRows = Awaited<ReturnType<typeof loadStudentRows>>;

/** The students' attendance, submissions, grades and graded attempts, keyed `student:row`: four queries. */
async function loadStudentRows(
  client: Client,
  seasonId: number,
  ids: number[],
  started: { id: number }[],
  quizzes: CountedQuiz[],
) {
  const [present, submitted, grades, attempts] = await Promise.all([
    client.attendance.findMany({
      where: {
        studentUserId: { in: ids },
        sessionId: { in: started.map((s) => s.id) },
        status: { in: ["PRESENT", "LATE"] },
      },
      select: { studentUserId: true, sessionId: true },
    }),
    client.submission.findMany({
      where: { studentUserId: { in: ids }, assignment: { seasonId, ...liveAssignment }, ...SUBMITTED_WHERE },
      select: { studentUserId: true },
    }),
    client.quizGrade.findMany({
      where: { quizId: { in: quizzes.map((q) => q.id) }, studentUserId: { in: ids } },
      select: { quizId: true, studentUserId: true, score: true },
    }),
    client.quizAttempt.findMany({
      where: {
        quizId: { in: quizzes.filter((q) => q.kind === "ONLINE").map((q) => q.id) },
        studentUserId: { in: ids },
        status: "GRADED",
      },
      select: { quizId: true, studentUserId: true, status: true, totalScore: true, attemptNumber: true },
    }),
  ]);
  return {
    present: new Set(present.map((a) => `${a.studentUserId}:${a.sessionId}`)),
    submittedBy: countBy(submitted.map((s) => s.studentUserId)),
    gradeOf: new Map(grades.map((g) => [`${g.studentUserId}:${g.quizId}`, g])),
    attemptsOf: groupBy(attempts, (a) => `${a.studentUserId}:${a.quizId}`),
  };
}

/** Σ the student's counting score: PAPER its grade, ONLINE `countingScore`; nothing is 0. */
function quizTotal(studentUserId: number, quizzes: CountedQuiz[], rows: StudentRows): number {
  let scored = 0;
  for (const q of quizzes) {
    const key = `${studentUserId}:${q.id}`;
    const grade = rows.gradeOf.get(key) ?? null;
    scored +=
      q.kind === "ONLINE"
        ? (countingScore(grade, rows.attemptsOf.get(key) ?? [])?.score ?? 0)
        : (toScore(grade?.score ?? null) ?? 0);
  }
  return round2(scored);
}

function countBy(keys: number[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const k of keys) out.set(k, (out.get(k) ?? 0) + 1);
  return out;
}

function groupBy<T>(rows: T[], keyOf: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    out.set(key, [...(out.get(key) ?? []), row]);
  }
  return out;
}
