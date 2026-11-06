import { db } from "../../../db/client";
import type { SessionUser } from "../../auth/tokens";
import type { SeasonRecord } from "../../../../../../packages/shared/src/season-lifecycle";
import { listAssignmentStatesForStudent } from "../assignments";
import { attendancePct } from "../attendance-pct";
import { outcomeOf } from "./outcome";

/*
 * One past season, read-only, for the student it belongs to. Built from the
 * same sources the current-season screens read, so the two cannot disagree.
 * Never selects result/drop reasons, feedback or notes (spec 02 R34).
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
      season: { deletedAt: null },
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
        attempts: {
          where: { studentUserId: user.userId },
          orderBy: { attemptNumber: "desc" },
          take: 1,
          select: { status: true, totalScore: true },
        },
        grades: { where: { studentUserId: user.userId }, select: { score: true } },
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
    })),
    quizzes: quizzes.map((q): RecordQuiz => {
      const attempt = q.attempts[0];
      const base = { id: q.id, title: q.title, kind: q.kind };
      if (attempt) {
        const graded = attempt.status === "GRADED";
        return { ...base, status: attempt.status, score: graded ? attempt.totalScore : null };
      }
      // A paper quiz has no attempt: it is graded or not taken.
      const score = q.grades[0]?.score ?? null;
      return score === null
        ? { ...base, status: "NOT_TAKEN", score: null }
        : { ...base, status: "GRADED", score };
    }),
    attendance: sessions.map((s) => ({
      sessionId: s.id,
      title: s.title,
      startsAt: s.startsAt.toISOString(),
      status: s.attendance[0]?.status ?? null,
    })),
  };
}
