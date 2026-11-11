import { db } from "../../../db/client";
import { liveAssignment } from "../../db/live";
import { loadWorkIndex, PART_SELECT } from "../../queries/assignments";
import { computeEngagementForSeasons } from "../../queries/engagement";
import { seasonParticipant } from "../../queries/season-participants";
import { findLiveSeason } from "../../queries/seasons";
import { COLLATOR } from "../workbook-style";

/**
 * Quizzes worth a column.
 *
 * publishedAt is documented in the schema as the draft marker for ONLINE
 * quizzes ("students only see published quizzes",
 * prisma/schema.prisma:653-654) and v1's export ignored it (R74), so an
 * unpublished quiz became a column of blanks that reads as a cohort-wide
 * failure to sit it. PAPER quizzes have no publish concept and stay.
 * maxScore = 0 is not a grade (R77). Both exclusions live in the `where` so the
 * column never exists, rather than existing and being skipped.
 */
export function quizWhere(seasonId: number) {
  return {
    seasonId,
    maxScore: { gt: 0 },
    OR: [{ kind: "PAPER" as const }, { kind: "ONLINE" as const, publishedAt: { not: null } }],
  };
}

export async function loadSeasonExportData(seasonId: number) {
  // 1 — the season, with the soft-delete check v1 omitted.
  const season = await findLiveSeason(seasonId, { code: true, title: true });
  if (!season) return null;

  // 2 — the roster. groupId comes from the ENROLMENT (R66, ruling C9); the
  // group NAME comes with it so the sheet needs no second lookup.
  const enrollments = await db.seasonEnrollment.findMany({
    where: { seasonId, ...seasonParticipant },
    select: {
      studentUserId: true,
      groupId: true,
      studentUser: { select: { name: true, email: true } },
      group: { select: { name: true } },
    },
  });
  const students = enrollments
    .map((e) => ({
      studentUserId: e.studentUserId,
      name: e.studentUser.name,
      email: e.studentUser.email,
      groupId: e.groupId,
      groupName: e.group?.name ?? "",
    }))
    .sort((a, b) => COLLATOR.compare(a.name, b.name));

  const now = new Date();

  // 3 — past sessions with their attendance rows.
  const sessions = await db.session.findMany({
    where: { seasonId, startsAt: { lte: now } },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      title: true,
      startsAt: true,
      // lateMinutes is deliberately NOT selected. Nothing in v2 renders it, and
      // not fetching it is the cheapest possible guarantee that nobody
      // "restores" the cell by reaching for a field that is already in hand.
      attendance: { select: { studentUserId: true, status: true } },
    },
  });

  // 4 — quizzes worth a column, with their grades.
  const quizzes = await db.quiz.findMany({
    where: quizWhere(seasonId),
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      title: true,
      maxScore: true,
      kind: true,
      grades: { select: { studentUserId: true, score: true } },
      // ONLINE columns show the best graded attempt (spec "Honest accidents").
      attempts: {
        where: { status: "GRADED" },
        select: { studentUserId: true, status: true, totalScore: true, attemptNumber: true },
      },
    },
  });

  // 5 — assignments with their parts and who submitted, then 5b — every
  // student's work on those parts (two queries, see loadWorkIndex).
  const assignments = await db.assignment.findMany({
    where: { seasonId, ...liveAssignment },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      title: true,
      parts: { orderBy: { position: "asc" }, select: PART_SELECT },
      submissions: { where: { submittedAt: { not: null } }, select: { studentUserId: true } },
    },
  });
  const works = await loadWorkIndex(
    assignments.flatMap((a) => a.parts.map((p) => p.id)),
    students.map((s) => s.studentUserId),
  );

  // 6..10 — the two percentage columns, from the one definition.
  const engagement = await computeEngagementForSeasons([seasonId]);
  const engagementBy = new Map(engagement.map((r) => [r.studentUserId, r]));

  return { season, students, sessions, quizzes, assignments, works, engagementBy };
}
