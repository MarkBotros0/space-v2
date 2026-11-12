/**
 * The End review by the score (season passing, spec 2026-11-12 "Ending the season"): each student's
 * score under the criteria shown, who starts as Passed, the bulk actions, the words on a row, the
 * POST body and the confirm. Pure, so it is tested apart from the screen. The score comes from the
 * shared `weightedScore` and `meetsMark`, the same the server recomputes at End with, so what the
 * admin sees is what End checks. The score only pre-selects: the admin decides.
 */
import {
  classLabel,
  meetsMark,
  passingPcts,
  usableWeights,
  weightedScore,
  type EndSeasonRequest,
  type PassCriteria,
  type PassingNumberKey,
  type SeasonEndCheck,
} from "@space/shared";

import type { ChipSpec } from "../../design/ui/status-chip";
import { blankToNull } from "../../lib/form-values";
import { plural } from "../../lib/plural";
import { draftFrom, parseCriteria, WEIGHT_KEYS } from "../season-passing/criteria-model";
import { NUMBER_LABELS } from "../season-passing/outlook-model";

type Student = SeasonEndCheck["students"][number];
export type EndResult = "PASSED" | "NOT_PASSED";
export type Selection = Record<number, EndResult>;
/** A note and the result it was written for: a reason for Did not pass, a note for a pass. */
export type EndNote = { result: EndResult; text: string };
export type ScoredRow = { userId: number; score: number | null; rescaled: boolean; onTrack: boolean | null };

/** Each student's score under `c`, and whether it reaches the mark (null: no score). */
export function scoreRows(students: Student[], c: PassCriteria): ScoredRow[] {
  return students.map((s) => {
    const { score, rescaled } = weightedScore(passingPcts(s.numbers), c.weights);
    return { userId: s.userId, score, rescaled, onTrack: meetsMark(score, c.passMark) };
  });
}

/** On track or no score: Passed. Below the mark: Did not pass. */
export function initialSelection(rows: ScoredRow[]): Selection {
  const sel: Selection = {};
  for (const r of rows) sel[r.userId] = r.onTrack === false ? "NOT_PASSED" : "PASSED";
  return sel;
}

/** Every on-track row Passed; the rest as they were. */
export function selectAllOnTrack(sel: Selection, rows: ScoredRow[]): Selection {
  const next = { ...sel };
  for (const r of rows) if (r.onTrack === true) next[r.userId] = "PASSED";
  return next;
}

/** Everyone Did not pass. */
export function clearAll(rows: ScoredRow[]): Selection {
  const sel: Selection = {};
  for (const r of rows) sel[r.userId] = "NOT_PASSED";
  return sel;
}

/**
 * The selection the review shows: what the admin set by hand stands, every other row follows its
 * score, so changing the criteria or a reloaded check re-selects only the rows nobody touched.
 * Hand-set rows for someone no longer on the review are dropped.
 */
export function selectionFor(rows: ScoredRow[], hand: Selection): Selection {
  const sel = initialSelection(rows);
  for (const r of rows) {
    const chosen = hand[r.userId];
    if (chosen) sel[r.userId] = chosen;
  }
  return sel;
}

/** A result that goes against the score, in words; null when it follows it or there is no score. */
export function rowLabel(
  result: EndResult,
  onTrack: boolean | null,
): "Passed below the mark" | "Did not pass above the mark" | null {
  if (result === "PASSED" && onTrack === false) return "Passed below the mark";
  if (result === "NOT_PASSED" && onTrack === true) return "Did not pass above the mark";
  return null;
}

/**
 * The criteria End starts from: the season's, with a weight on a number the season has nothing for
 * moved to the others in proportion (the criteria form's own rule), so the weights sent fit.
 */
export function fittedCriteria(check: SeasonEndCheck): PassCriteria {
  const parsed = parseCriteria(draftFrom(check.criteria, check.available), check.available);
  return parsed.ok ? parsed.criteria : check.criteria;
}

/** The criteria the admin chose, made to fit what a reloaded check has to count. */
export function refit(c: PassCriteria, check: SeasonEndCheck): PassCriteria {
  return fittedCriteria({ ...check, criteria: c });
}

/** Whether the admin's criteria differ from the ones the review started from. */
export function criteriaChanged(chosen: PassCriteria | null, check: SeasonEndCheck): boolean {
  if (chosen === null) return false;
  const start = fittedCriteria(check);
  const now = refit(chosen, check);
  return now.passMark !== start.passMark || WEIGHT_KEYS.some((key) => now.weights[key] !== start.weights[key]);
}

/** Numbers the season's own criteria weight but the season has nothing for. */
export function ignoredNumbers(check: SeasonEndCheck): PassingNumberKey[] {
  return usableWeights(check.criteria.weights, check.available).ignored;
}

/** The End POST: the criteria shown, every score shown under them, who doesn't pass and the notes. */
export function buildEndRequest(
  check: SeasonEndCheck,
  c: PassCriteria,
  sel: Selection,
  notes: Record<number, EndNote>,
): EndSeasonRequest {
  const rows = scoreRows(check.students, c);
  const notPassed: EndSeasonRequest["notPassed"] = [];
  const passedNotes: EndSeasonRequest["passedNotes"] = [];
  for (const r of rows) {
    const note = notes[r.userId];
    // A note goes only with the result it was written for: a flipped row drops it.
    const text = note && note.result === sel[r.userId] ? blankToNull(note.text) : null;
    if (sel[r.userId] === "NOT_PASSED") notPassed.push({ userId: r.userId, reason: text });
    else if (text !== null) passedNotes.push({ userId: r.userId, note: text });
  }
  return {
    notPassed,
    passedNotes,
    weights: c.weights,
    passMark: c.passMark,
    reviewed: {
      graduatesOnPass: check.graduatesOnPass,
      userIds: rows.map((r) => r.userId),
      scores: rows.map((r) => ({ userId: r.userId, score: r.score })),
    },
  };
}

/** "attendance", "attendance and quizzes": the weighted numbers a student had nothing for. */
function missingNumbers(s: Student, c: PassCriteria): string {
  const pcts = passingPcts(s.numbers);
  return WEIGHT_KEYS.filter((key) => c.weights[key] > 0 && pcts[key] === null)
    .map((key) => NUMBER_LABELS[key].toLowerCase())
    .join(" and ");
}

/** "Attendance 80%, assignments 75%, quizzes 60%": the numbers the student has, as one sentence. */
function numbersLine(s: Student): string | null {
  const pcts = passingPcts(s.numbers);
  const parts = WEIGHT_KEYS.flatMap((key) => {
    const value = pcts[key];
    return value === null ? [] : [`${NUMBER_LABELS[key].toLowerCase()} ${Math.round(value)}%`];
  });
  if (parts.length === 0) return null;
  const line = parts.join(", ");
  return line.charAt(0).toUpperCase() + line.slice(1);
}

type ReviewRowView = { chip: ChipSpec; lines: string[] };

/** A student's row on the review: the result in words, then one fact per line. */
export function reviewRowView(s: Student, row: ScoredRow, result: EndResult, c: PassCriteria): ReviewRowView {
  const lines: string[] = [];
  if (s.groupName) lines.push(s.groupName);
  if (row.score === null) lines.push("No score");
  else lines.push(`Score ${row.score.toFixed(1)}, ${row.onTrack ? "on track" : "below the mark"}`);
  const numbers = numbersLine(s);
  if (numbers) lines.push(numbers);
  if (row.rescaled && row.score !== null) {
    const missing = missingNumbers(s, c);
    if (missing) lines.push(`Scored without ${missing}`);
  }
  const label = rowLabel(result, row.onTrack);
  if (label) lines.push(label);
  const chip: ChipSpec = result === "PASSED" ? { tone: "ok", label: "Passed" } : { tone: "bad", label: "Did not pass" };
  return { chip, lines };
}

/** The confirm: how many pass and don't, the class a graduating season makes, and who loses access. */
export function confirmCopy(p: {
  title: string;
  pass: number;
  notPass: number;
  graduating: boolean;
  year: number | null;
}): { title: string; description: string } {
  const counts = `${plural(p.pass, "student")} ${p.pass === 1 ? "passes" : "pass"}, ${p.notPass} ${p.notPass === 1 ? "doesn't" : "don't"}.`;
  const graduates =
    p.graduating && p.pass > 0
      ? ` ${plural(p.pass, "student")} ${p.pass === 1 ? "graduates" : "graduate"}${p.year === null ? "" : ` as ${classLabel(p.year)}`}.`
      : "";
  return {
    title: `End ${p.title}?`,
    description: `${counts}${graduates} Their leaders and admins lose access. This ends the season for ${plural(p.pass + p.notPass, "person", "people")}.`,
  };
}
