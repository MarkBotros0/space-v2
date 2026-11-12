/**
 * The words of a student's Season progress (season passing, spec 2026-11-12 "Progress for staff"):
 * the three numbers on the card and in the students list, and the rows of each number's sheet.
 * Pure, so the copy is tested apart from the screen. No composite score here (owner,
 * 2026-11-07): the score shows only in the passing outlook and at End.
 */
import { passingPcts, type PassingNumberKey, type StudentListItem, type StudentProgress } from "@space/shared";

import type { ChipSpec } from "../../design/ui/status-chip";
import { formatScore } from "../../lib/format";
import { plural } from "../../lib/plural";
import { markedLine } from "../assignment-detail/progress-model";

export const NONE_THIS_SEASON = "None this season";

export type ProgressLine = { key: PassingNumberKey; label: string; pct: number | null; figure: string };

const roundPct = (x: number | null) => (x === null ? null : Math.round(x));

/** The card's three lines: a whole percent for the bar and the exact figure under it. */
export function progressLines(p: StudentProgress): ProgressLine[] {
  const pcts = passingPcts(p.numbers);
  const { attendance, assignments, quizzes } = p.numbers;
  return [
    {
      key: "attendance",
      label: "Attendance",
      pct: roundPct(pcts.attendance),
      figure:
        attendance.total > 0 ? `${attendance.attended} of ${plural(attendance.total, "session")}` : NONE_THIS_SEASON,
    },
    {
      key: "assignments",
      label: "Assignments",
      pct: roundPct(pcts.assignments),
      figure: assignments.total > 0 ? `${assignments.submitted} / ${assignments.total}` : NONE_THIS_SEASON,
    },
    {
      key: "quizzes",
      label: "Quizzes",
      pct: roundPct(pcts.quizzes),
      figure: quizzes.max > 0 ? `average of ${plural(quizzes.max, "quiz", "quizzes")}` : NONE_THIS_SEASON,
    },
  ];
}

/** What a line says aloud: "7 / 9" reads badly, so assignments say "7 of 9 submitted". */
export function progressSpoken(line: ProgressLine): string {
  if (line.pct === null) return `${line.label}, ${line.figure}`;
  const figure = line.key === "assignments" ? `${line.figure.replace(" / ", " of ")} submitted` : line.figure;
  return `${line.label} ${line.pct}%, ${figure}`;
}

/** A students-list row's numbers, one caption each so they wrap apart; none without progress. */
export function progressCaptions(progress: StudentListItem["progress"]): string[] {
  if (!progress) return [];
  const parts: [string, number | null][] = [
    ["Attendance", progress.attendancePct],
    ["Assignments", progress.assignmentsPct],
    ["Quizzes", progress.quizPct],
  ];
  if (parts.every(([, pct]) => pct === null)) return [NONE_THIS_SEASON];
  return parts.map(([label, pct]) => (pct === null ? `${label}: none this season` : `${label} ${pct}%`));
}

type ProgressAssignment = StudentProgress["assignments"][number];

/** An assignment's standing in words, with a tone that is never the only signal. */
export function assignmentStanding(a: ProgressAssignment): ChipSpec {
  if (a.submitted === "app") return { tone: "ok", label: "Submitted" };
  if (a.submitted === "staff") return { tone: "ok", label: "Marked submitted" };
  return { tone: "bad", label: "Not submitted" };
}

/** Who marked it, for a row marked by staff; null otherwise. */
export function assignmentMarkedBy(a: ProgressAssignment): string | null {
  return a.submitted === "staff" && a.staffMark ? markedLine(a.staffMark.markedByName) : null;
}

/** What staff may do on a row: mark a missing one, undo their mark; an app submission stands. */
export function assignmentAction(a: ProgressAssignment, canMark: boolean): "mark" | "undo" | null {
  if (!canMark || a.submitted === "app") return null;
  return a.submitted === "staff" ? "undo" : "mark";
}

type ProgressQuiz = StudentProgress["quizzes"][number];

/** A quiz's score with its marks and percent; no score counts as 0 in the number. */
export function quizLine(q: ProgressQuiz): string {
  if (q.score === null) return "No score yet, counts as 0";
  const marks = `${formatScore(q.score)} of ${plural(q.maxScore, "mark")}`;
  return q.maxScore > 0 ? `${marks}, ${Math.round((q.score / q.maxScore) * 100)}%` : marks;
}

/**
 * The quiz's way to a better score, both on its grading screen: a taken online quiz is reopened as
 * a retake; a paper quiz or an untaken one is graded there. Nothing once the season has ended.
 */
export function quizAction(q: ProgressQuiz, seasonActive: boolean): "Reopen retake" | "Open grading" | null {
  if (!seasonActive) return null;
  return q.kind === "ONLINE" && q.score !== null ? "Reopen retake" : "Open grading";
}
