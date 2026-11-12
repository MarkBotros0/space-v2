import ExcelJS from "exceljs";

import type { PartWork } from "../../../../../../packages/shared/src/index";
import { formatDayInOrgTime } from "../../org-time";
import { addKeySheet, columnWidths, freezeFirstRowAndColumns, styleHeader } from "../workbook-style";
import { bestGraded } from "../../quizzes/best-attempt";
import { toScore } from "../../quizzes/score";
import { partWorksFor, standingOf } from "../../queries/assignments";
import { loadSeasonExportData } from "./load";
import { estimateBytes, KEY_SYMBOLS, type SeasonWorkbookSummary, type SheetSummary } from "./summary";

/**
 * One student's cell for one assignment: "Submitted", how many parts are done
 * ("2 of 3 done"), or "Not submitted" when none is. Drafts are the student's
 * own: a part written but not handed in doesn't count as done here.
 */
function assignmentCell(submitted: boolean, works: PartWork[]): string {
  if (submitted) return "Submitted";
  const { partsTotal, partsDone } = standingOf(works);
  return partsDone > 0 ? `${partsDone} of ${partsTotal} done` : "Not submitted";
}

type ExportQuiz = NonNullable<Awaited<ReturnType<typeof loadSeasonExportData>>>["quizzes"][number];

/** Student to score for one quiz column: the paper grade, or an ONLINE quiz's best graded attempt. */
function scoresOf(q: ExportQuiz): Map<number, number | null> {
  if (q.kind === "PAPER") return new Map(q.grades.map((g) => [g.studentUserId, toScore(g.score)]));
  const attemptsOf = new Map<number, ExportQuiz["attempts"]>();
  for (const a of q.attempts) attemptsOf.set(a.studentUserId, [...(attemptsOf.get(a.studentUserId) ?? []), a]);
  const scores = new Map<number, number | null>();
  for (const [studentId, attempts] of attemptsOf) {
    scores.set(studentId, toScore(bestGraded(attempts)?.totalScore ?? null));
  }
  return scores;
}

interface SeasonWorkbookResult extends SeasonWorkbookSummary {
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
 * Twelve queries: seven for the grid (v1 had five, the shape right — R89, the
 * best-behaved read in the domain) plus the five inside
 * computeEngagementForSeasons, which supplies the two percentage columns. Five
 * extra round trips buy the guarantee that a spreadsheet cell and the chart on
 * the screen above it are the same number (ruling C4). v1's five queries
 * produced percentages that disagreed with its own reports page (spec D2).
 */
export async function buildSeasonWorkbook(seasonId: number): Promise<SeasonWorkbookResult | null> {
  const data = await loadSeasonExportData(seasonId);
  if (!data) return null;
  const { season, students, sessions, quizzes, assignments, works, engagementBy } = data;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "JPC Space";
  workbook.created = new Date();

  // --- Attendance -----------------------------------------------------------
  const attendance = workbook.addWorksheet("Attendance");
  const attHeader = [
    "Student",
    "Email",
    "Group",
    ...sessions.map((s) => `${formatDayInOrgTime(s.startsAt)} · ${s.title}`),
    "Attendance %",
  ];
  attendance.addRow(attHeader);
  attendance.columns = columnWidths(attHeader.length, 16);

  const attendanceBySession = sessions.map((s) => new Map(s.attendance.map((a) => [a.studentUserId, a])));

  for (const student of students) {
    const cells = sessions.map((_, i) => {
      const record = attendanceBySession[i]!.get(student.studentUserId);
      if (!record) return "";
      if (record.status === "PRESENT") return "P";
      if (record.status === "ABSENT") return "A";
      // Ruling C3. v1 printed `lateMinutes ?? "L"` — minutes measured from when
      // an admin opened check-in rather than from session.startsAt, with no
      // threshold, exported to a spreadsheet where a reader sorts and averages
      // them as "minutes late" (R69, R70). No column distinguishes v1-era rows
      // from v2-era ones, so the workbook cannot annotate per cell — it
      // withholds the number instead. The Key sheet says so.
      return "L";
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
  const gradeHeader = ["Student", "Email", "Group", ...quizzes.map((q) => `${q.title} (/${q.maxScore})`), "Average %"];
  grades.addRow(gradeHeader);
  grades.columns = columnWidths(gradeHeader.length, 18);

  const scoreByQuiz = quizzes.map((q) => scoresOf(q));

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

  const submittedBy = assignments.map((a) => new Set(a.submissions.map((s) => s.studentUserId)));

  for (const student of students) {
    // Every assignment is the whole season's: no "not assigned" cell any more.
    const cells = assignments.map((a, i) =>
      assignmentCell(
        submittedBy[i]!.has(student.studentUserId),
        partWorksFor(a.parts, student.studentUserId, works, { forStaff: true }),
      ),
    );
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
