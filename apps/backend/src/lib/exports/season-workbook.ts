// apps/backend/src/lib/exports/season-workbook.ts
import ExcelJS from "exceljs";

import type { SubmissionStatus } from "../../generated/prisma/enums";
import { db } from "../../db/client";
import { formatDayInOrgTime } from "../org-time";
import { attendanceCellFor } from "./attendance-cell";
import { computeEngagementForSeasons } from "../queries/engagement";
import {
  COLLATOR,
  addKeySheet,
  columnWidths,
  freezeFirstRowAndColumns,
  styleHeader,
} from "./workbook-style";

const SUBMISSION_LABEL: Record<SubmissionStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  REVIEWED: "Reviewed",
  RETURNED: "Returned",
};

/** Blank means "assigned, nothing submitted"; n/a means "not assigned" (D-17.15). */
const NOT_ASSIGNED = "n/a";

const KEY_SYMBOLS: Array<[string, string]> = [
  ["P", "Present"],
  ["A", "Absent"],
  ["number", "Late — minutes after the session's start"],
  ["L", "Late, with no minutes recorded"],
  ["(blank)", "No record for this student and session / assignment"],
  [NOT_ASSIGNED, "This assignment was not assigned to this student"],
];

export interface SheetSummary {
  name: string;
  columnCount: number;
  rowCount: number;
}

export interface SeasonWorkbookSummary {
  seasonCode: string;
  seasonTitle: string;
  rowCount: number;
  sheets: SheetSummary[];
  estimatedBytes: number;
}

export interface SeasonWorkbookResult extends SeasonWorkbookSummary {
  workbook: ExcelJS.Workbook;
}

/**
 * The season's active students × (sessions, quizzes, assignments) matrix.
 *
 * Returns null when the season does not exist OR is soft-deleted. v1 fetched
 * it with findUniqueOrThrow on `id` alone (R81), while both of its report
 * queries filtered deletedAt (R1, R53) — so anyone who could name a deleted
 * season's id could still export its complete attendance and grade history.
 * That is a data-retention hole v1 has by oversight; leaving it out of v2 is a
 * one-line divergence nobody will miss (spec D14).
 *
 * Ten queries: five for the grid (the shape v1 already had right — R89, the
 * best-behaved read in the domain) plus the five inside
 * computeEngagementForSeasons, which supplies the two percentage columns. Five
 * extra round trips buy the guarantee that a spreadsheet cell and the chart on
 * the screen above it are the same number (ruling C4). v1's five queries
 * produced percentages that disagreed with its own reports page for any season
 * containing a group-targeted assignment (spec D2).
 */
export async function buildSeasonWorkbook(seasonId: number): Promise<SeasonWorkbookResult | null> {
  const data = await loadSeasonExportData(seasonId);
  if (!data) return null;
  const { season, students, sessions, quizzes, assignments, engagementBy } = data;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "JPC Space";
  workbook.created = new Date();

  // --- Attendance -----------------------------------------------------------
  const attendance = workbook.addWorksheet("Attendance");
  const attHeader = [
    "Student",
    "Email",
    "Group",
    ...sessions.map((s) => `${formatDayInOrgTime(s.startsAt)} · ${s.title} (minutes late from start)`),
    "Attendance %",
  ];
  attendance.addRow(attHeader);
  attendance.columns = columnWidths(attHeader.length, 16);

  const attendanceBySession = sessions.map(
    (s) => new Map(s.attendance.map((a) => [a.studentUserId, a])),
  );

  for (const student of students) {
    const cells = sessions.map((_, i) => {
      const record = attendanceBySession[i]!.get(student.studentUserId);
      if (!record) return "";
      return attendanceCellFor(record.status, record.lateMinutes);
    });
    // Read, not recomputed: the same attendancePct the report shows, whose
    // denominator starts at this student's enrolledAt (domain 9 R55, spec D8).
    // v1's own workbook percentage happened to agree with engagement (R73);
    // this makes that agreement structural instead of coincidental.
    const pct = engagementBy.get(student.studentUserId)?.attendancePct ?? 0;
    attendance.addRow([student.name, student.email, student.groupName, ...cells, pct]);
  }
  styleHeader(attendance.getRow(1));
  freezeFirstRowAndColumns(attendance, 3);

  // --- Grades ---------------------------------------------------------------
  const grades = workbook.addWorksheet("Grades");
  const gradeHeader = [
    "Student",
    "Email",
    "Group",
    ...quizzes.map((q) => `${q.title} (/${q.maxScore})`),
    "Average %",
  ];
  grades.addRow(gradeHeader);
  grades.columns = columnWidths(gradeHeader.length, 18);

  const scoreByQuiz = quizzes.map((q) => new Map(q.grades.map((g) => [g.studentUserId, g.score])));

  for (const student of students) {
    let pctSum = 0;
    let gradedCount = 0;
    const cells = quizzes.map((q, i) => {
      const score = scoreByQuiz[i]!.get(student.studentUserId);
      if (score === null || score === undefined) return "";
      // maxScore > 0 is guaranteed by the query (D16 / R77), so every graded
      // quiz contributes and there is no "prints a score but is excluded from
      // the average" case left to explain.
      pctSum += (score / q.maxScore) * 100;
      gradedCount += 1;
      return score;
    });
    // Unweighted mean of percentages, not total-scored over total-available.
    // v1's arithmetic (R76), kept: changing it would move a number without
    // anyone asking.
    const avg = gradedCount > 0 ? Math.round(pctSum / gradedCount) : "";
    grades.addRow([student.name, student.email, student.groupName, ...cells, avg]);
  }
  styleHeader(grades.getRow(1));
  freezeFirstRowAndColumns(grades, 3);

  // --- Assignments ----------------------------------------------------------
  const assignmentSheet = workbook.addWorksheet("Assignments");
  const assignmentHeader = [
    "Student",
    "Email",
    "Group",
    ...assignments.map((a) => a.title),
    // The header names the denominator. A file produced under one arithmetic
    // and a file produced under another must be distinguishable by a reader
    // holding both, without this document (ruling C5, spec D2).
    "Submitted % (assigned to student)",
  ];
  assignmentSheet.addRow(assignmentHeader);
  assignmentSheet.columns = columnWidths(assignmentHeader.length, 20);

  const statusByAssignment = assignments.map(
    (a) => new Map(a.submissions.map((s) => [s.studentUserId, s.status])),
  );

  for (const student of students) {
    const cells = assignments.map((a, i) => {
      const assigned =
        a.isAllGroups ||
        (student.groupId !== null && a.targets.some((t) => t.groupId === student.groupId));
      // Ruling C9: the enrolment's group for THIS season, never GroupStudent.
      if (!assigned) return NOT_ASSIGNED;
      const status = statusByAssignment[i]!.get(student.studentUserId);
      // Blank, not v1's em dash: "—" and blank both meant "no row found" and
      // nothing distinguished "not applicable" from "missing" (R79, R82).
      return status ? SUBMISSION_LABEL[status] : "";
    });
    const pct = engagementBy.get(student.studentUserId)?.submissionPct ?? 0;
    assignmentSheet.addRow([student.name, student.email, student.groupName, ...cells, pct]);
  }
  styleHeader(assignmentSheet.getRow(1));
  freezeFirstRowAndColumns(assignmentSheet, 3);

  addKeySheet(workbook, {
    scopeDescription: `${season.title} (${season.code})`,
    symbols: KEY_SYMBOLS,
  });

  const sheets: SheetSummary[] = [
    { name: "Attendance", columnCount: attHeader.length, rowCount: students.length },
    { name: "Grades", columnCount: gradeHeader.length, rowCount: students.length },
    { name: "Assignments", columnCount: assignmentHeader.length, rowCount: students.length },
    { name: "Key", columnCount: 2, rowCount: KEY_SYMBOLS.length + 8 },
  ];

  return {
    workbook,
    seasonCode: season.code,
    seasonTitle: season.title,
    rowCount: students.length,
    sheets,
    estimatedBytes: estimateBytes(sheets),
  };
}

/**
 * The manifest's numbers, without building anything.
 *
 * Four counts and a season lookup. The point is that a phone can be told "38
 * students × 14 sessions, about 40 kB" before it commits to a download on a
 * cellular connection (spec §7).
 */
export async function summariseSeasonWorkbook(
  seasonId: number,
): Promise<SeasonWorkbookSummary | null> {
  const season = await db.season.findFirst({
    where: { id: seasonId, deletedAt: null },
    select: { code: true, title: true },
  });
  if (!season) return null;

  const now = new Date();
  const [rowCount, sessionCount, quizCount, assignmentCount] = await Promise.all([
    db.seasonEnrollment.count({ where: { seasonId, status: "ACTIVE" } }),
    db.session.count({ where: { seasonId, startsAt: { lte: now } } }),
    db.quiz.count({ where: quizWhere(seasonId) }),
    db.assignment.count({ where: { seasonId, deletedAt: null } }),
  ]);

  const sheets: SheetSummary[] = [
    { name: "Attendance", columnCount: 4 + sessionCount, rowCount },
    { name: "Grades", columnCount: 4 + quizCount, rowCount },
    { name: "Assignments", columnCount: 4 + assignmentCount, rowCount },
    { name: "Key", columnCount: 2, rowCount: KEY_SYMBOLS.length + 8 },
  ];

  return {
    seasonCode: season.code,
    seasonTitle: season.title,
    rowCount,
    sheets,
    estimatedBytes: estimateBytes(sheets),
  };
}

/**
 * A heuristic, and labelled as one on the contract.
 *
 * XLSX is a zip of XML, so the only honest way to know the size is to build the
 * file — which is the thing the manifest exists to avoid. ~12 bytes of
 * compressed XML per cell plus a fixed overhead has been close enough to warn a
 * user before a multi-megabyte download, which is all it is for.
 */
function estimateBytes(sheets: SheetSummary[]): number {
  const cells = sheets.reduce((n, s) => n + s.columnCount * (s.rowCount + 1), 0);
  return 8 * 1024 + cells * 12;
}

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
function quizWhere(seasonId: number) {
  return {
    seasonId,
    maxScore: { gt: 0 },
    OR: [{ kind: "PAPER" as const }, { kind: "ONLINE" as const, publishedAt: { not: null } }],
  };
}

async function loadSeasonExportData(seasonId: number) {
  // 1 — the season, with the soft-delete check v1 omitted.
  const season = await db.season.findFirst({
    where: { id: seasonId, deletedAt: null },
    select: { code: true, title: true },
  });
  if (!season) return null;

  // 2 — the roster. groupId comes from the ENROLMENT (R66, ruling C9); the
  // group NAME comes with it so the sheet needs no second lookup.
  const enrollments = await db.seasonEnrollment.findMany({
    where: { seasonId, status: "ACTIVE" },
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
      attendance: { select: { studentUserId: true, status: true, lateMinutes: true } },
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
      grades: { select: { studentUserId: true, score: true } },
    },
  });

  // 5 — assignments with their targets and submissions.
  const assignments = await db.assignment.findMany({
    where: { seasonId, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      title: true,
      isAllGroups: true,
      targets: { select: { groupId: true } },
      submissions: { select: { studentUserId: true, status: true } },
    },
  });

  // 6..10 — the two percentage columns, from the one definition.
  const engagement = await computeEngagementForSeasons([seasonId]);
  const engagementBy = new Map(engagement.map((r) => [r.studentUserId, r]));

  return { season, students, sessions, quizzes, assignments, engagementBy };
}
