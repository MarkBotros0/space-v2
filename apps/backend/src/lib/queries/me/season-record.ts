import { db } from "../../../db/client";
import type { SessionUser } from "../../auth/tokens";
import type { SeasonRecord } from "../../../../../../packages/shared/src/season-lifecycle";
import { listAssignmentStatesForStudent } from "../assignments";
import { attendancePct } from "../attendance-pct";
import { toScore } from "../../quizzes/score";
import { countingScore } from "../../quizzes/best-attempt";
import { outcomeOf } from "./outcome";
import { liveSeason } from "../../db/live";

/*
 * One past season, read-only, for the student it belongs to. Built from the
 * same sources the current-season screens read, so the two cannot disagree.
 * Never selects result/drop reasons, feedback or notes (spec 02 R34), except the season admin's
 * note on their quiz score, which the student is meant to see (plan 4).
 */

type RecordQuiz = SeasonRecord["quizzes"][number];

export async function loadSeasonRecord(
  user: SessionUser,
  seasonId: number,
  now: Date = new Date(),
): Promise<SeasonRecord | null> {
  // Only a finished enrolment in a live season: ACTIVE work is not "past".
  const enrollment = await db.seasonEnrollment.findFirst({
    where: {
      studentUserId: user.userId,
      seasonId,
      status: { not: "ACTIVE" },
      season: { ...liveSeason, status: { not: "DRAFT" } },
    },
    select: {
      status: true,
      result: true,
      group: { select: { name: true } },
      season: { select: { id: true, code: true, title: true, startDate: true, endDate: true } },
    },
  });
  if (!enrollment) return null;

  const [assignmentRows, quizzes, sessions] = await Promise.all([
    listAssignmentStatesForStudent(user.userId, seasonId, now),
    db.quiz.findMany({
      // Unpublished ONLINE quizzes are drafts the student never saw.
      where: { seasonId, OR: [{ kind: "PAPER" }, { publishedAt: { not: null } }] },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        title: true,
        kind: true,
        resultsReleasedAt: true,
        attempts: {
          where: { studentUserId: user.userId },
          orderBy: { attemptNumber: "desc" },
          select: { status: true, totalScore: true, attemptNumber: true },
        },
        grades: { where: { studentUserId: user.userId }, select: { score: true, notes: true } },
      },
    }),
    db.session.findMany({
      where: { seasonId },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        title: true,
        startsAt: true,
        attendance: { where: { studentUserId: user.userId }, select: { status: true } },
      },
    }),
  ]);

  const attended = sessions.filter((s) => {
    const status = s.attendance[0]?.status;
    return status === "PRESENT" || status === "LATE";
  }).length;

  return {
    season: {
      id: enrollment.season.id,
      code: enrollment.season.code,
      title: enrollment.season.title,
      startDate: enrollment.season.startDate.toISOString(),
      endDate: enrollment.season.endDate.toISOString(),
    },
    outcome: outcomeOf(enrollment.status, enrollment.result),
    groupName: enrollment.group?.name ?? null,
    attendancePct: attendancePct(attended, sessions.length),
    assignments: assignmentRows.map((a) => ({
      id: a.id,
      title: a.title,
      dueAt: a.dueAt?.toISOString() ?? null,
      dueOrgDay: a.dueOrgDay,
      isOverdue: a.isOverdue,
      status: a.status,
      reviewedAt: a.reviewedAt?.toISOString() ?? null,
      submittedAt: a.submittedAt?.toISOString() ?? null,
      partsTotal: a.partsTotal,
      partsDone: a.partsDone,
      returned: a.returned,
      hasEssay: a.hasEssay,
      staffMarked: a.staffMarked,
      createdAt: a.createdAt.toISOString(),
    })),
    quizzes: quizzes.map((q): RecordQuiz => {
      const attempt = q.attempts[0]; // newest first
      const base = { id: q.id, title: q.title, kind: q.kind, adminScore: null };
      // The score that counts shows with no release (spec "What students see"): on an ONLINE
      // quiz the admin's score when there is one (plan 4, reading as GRADED), else the best graded
      // attempt's; a paper score shows once entered. Otherwise status is the latest attempt's.
      if (q.kind === "ONLINE") {
        const counting = countingScore(q.grades[0] ?? null, q.attempts);
        if (counting?.source === "manual") {
          // Labelled "Score entered by your admin", with the note the student sees (plan 4).
          const adminScore = { score: counting.score, notes: q.grades[0]?.notes ?? null };
          return { ...base, status: "GRADED", score: counting.score, adminScore };
        }
        if (attempt) return { ...base, status: attempt.status, score: counting?.score ?? null };
      }
      // A paper quiz has no attempt: it is graded or not taken.
      const score = toScore(q.grades[0]?.score ?? null);
      return score === null ? { ...base, status: "NOT_TAKEN", score: null } : { ...base, status: "GRADED", score };
    }),
    attendance: sessions.map((s) => ({
      sessionId: s.id,
      title: s.title,
      startsAt: s.startsAt.toISOString(),
      status: s.attendance[0]?.status ?? null,
    })),
  };
}
