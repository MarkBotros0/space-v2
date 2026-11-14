/**
 * The words and numbers of a finished season's Results (season passing, spec 2026-11-12 "After
 * End"; owner 2026-11-14: "show the attendance, the quizzes and the assignments"). Each student
 * is a card with three meters (End's stored numbers, or, for a season ended before weighted
 * passing, read now), the score End stored, whether the result went against it, and the staff
 * reason. Pure, so the copy is tested apart from the screen.
 */
import type { PassingNumbers, SeasonResultRow, SeasonResultsResponse } from "@space/shared";

import type { ChipSpec } from "../../design/ui/status-chip";
import { rowLabel } from "./end-review-model";

export type ResultFilter = "all" | "passed" | "not_passed" | "none";

export type Meter = {
  key: "attendance" | "assignments" | "quizzes";
  label: string;
  /** The big figure: "80%", "3/4", or a dash with nothing to count. */
  value: string;
  /** What the figure counts, in words: "8 of 10 sessions". */
  detail: string;
  /** 0–100 for the bar; null with nothing to count. */
  pct: number | null;
};

export type ResultCardView = {
  chip: ChipSpec;
  group: string | null;
  meters: Meter[];
  /** "Score 72.5", "No score", or null for a season ended before weighted passing. */
  score: string | null;
  /** End's words when the result goes against the score. */
  against: string | null;
  reason: string | null;
};

const DASH = "–";

function resultChip(r: SeasonResultRow): ChipSpec {
  if (r.result === "PASSED") return { tone: "ok", label: "Passed" };
  if (r.result === "NOT_PASSED") return { tone: "bad", label: "Did not pass" };
  return { tone: "neutral", label: "No result" };
}

function filterOf(r: SeasonResultRow): ResultFilter {
  if (r.result === "PASSED") return "passed";
  if (r.result === "NOT_PASSED") return "not_passed";
  return "none";
}

const pctOf = (part: number, whole: number): number | null => (whole > 0 ? Math.round((part / whole) * 100) : null);
const marks = (n: number): string => String(Math.round(n * 10) / 10);

export function meters(n: PassingNumbers): Meter[] {
  const { attendance: a, assignments: s, quizzes: q } = n;
  const aPct = pctOf(a.attended, a.total);
  const qPct = pctOf(q.scored, q.max);
  return [
    {
      key: "attendance",
      label: "Attendance",
      value: aPct === null ? DASH : `${aPct}%`,
      detail: a.total === 0 ? "No sessions" : `${a.attended} of ${a.total} sessions`,
      pct: aPct,
    },
    {
      key: "assignments",
      label: "Assignments",
      value: s.total === 0 ? DASH : `${s.submitted}/${s.total}`,
      detail: s.total === 0 ? "None set" : "submitted",
      pct: pctOf(s.submitted, s.total),
    },
    {
      key: "quizzes",
      label: "Quizzes",
      value: qPct === null ? DASH : `${qPct}%`,
      detail: q.max === 0 ? "None counted" : `${marks(q.scored)} of ${marks(q.max)} marks`,
      pct: qPct,
    },
  ];
}

/** A row from a backend older than `figures`: only the attendance percent is known. */
function attendanceOnly(r: SeasonResultRow): Meter[] {
  return [{ key: "attendance", label: "Attendance", value: `${r.attendancePct}%`, detail: "", pct: r.attendancePct }];
}

export function resultCardView(r: SeasonResultRow, criteria: SeasonResultsResponse["criteria"]): ResultCardView {
  const weighted = criteria !== null && r.numbers !== null;
  let score: string | null = null;
  if (weighted) score = r.passScore === null ? "No score" : `Score ${r.passScore.toFixed(1)}`;
  // The server says whether the result goes against the stored score; the words are End's.
  const against = weighted && r.againstScore && r.result ? rowLabel(r.result, r.result === "NOT_PASSED") : null;
  return {
    chip: resultChip(r),
    group: r.groupName,
    meters: r.figures ? meters(r.figures) : attendanceOnly(r),
    score,
    against: against || null,
    reason: r.reason || null,
  };
}

/** What a screen reader says for one card, in reading order, ending on the result. */
export function resultCardLabel(name: string, v: ResultCardView): string {
  const parts = [name, v.group, ...v.meters.map((m) => `${m.label} ${m.value === DASH ? m.detail : m.value}`)];
  parts.push(v.score, v.against, v.reason, v.chip.label);
  return parts.filter((p): p is string => !!p).join(", ");
}

type ResultsSummary = { passed: number; notPassed: number; none: number; total: number };

export function summarize(rows: SeasonResultRow[]): ResultsSummary {
  const count = (f: ResultFilter) => rows.filter((r) => filterOf(r) === f).length;
  return { passed: count("passed"), notPassed: count("not_passed"), none: count("none"), total: rows.length };
}

export function filterRows(rows: SeasonResultRow[], f: ResultFilter): SeasonResultRow[] {
  return f === "all" ? rows : rows.filter((r) => filterOf(r) === f);
}

/** The line under the summary: the criteria End used, or why there is no score. */
export function criteriaLine(criteria: SeasonResultsResponse["criteria"]): string {
  if (!criteria) return "Ended before weighted passing, so there's no score. The numbers are read now.";
  const w = criteria.weights;
  return `Pass mark ${criteria.passMark}. Weights: attendance ${w.attendance}%, assignments ${w.assignments}%, quizzes ${w.quizzes}%.`;
}
