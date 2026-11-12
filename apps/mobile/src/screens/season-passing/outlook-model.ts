/**
 * The words of the passing outlook (season passing, spec 2026-11-12 "Passing outlook"): the counts,
 * the criteria and one line per fact on each student's row. Pure, so the copy is tested apart from
 * the screen. The server sends the score, how far short and the weakest number; nothing is
 * recomputed here but the percentage shown beside the weakest number and which number a re-scaled
 * score left out.
 */
import {
  passingPcts,
  usableWeights,
  type PassingNumberKey,
  type PassingOutlook,
  type PassingOutlookRow,
} from "@space/shared";

import type { ChipSpec } from "../../design/ui/status-chip";
import { plural } from "../../lib/plural";

export const NUMBER_LABELS: Record<PassingNumberKey, string> = {
  attendance: "Attendance",
  assignments: "Assignments",
  quizzes: "Quizzes",
};
const KEYS: readonly PassingNumberKey[] = ["attendance", "assignments", "quizzes"];

/** The counts at the top, each on its own line. */
export function outlookHeader(o: PassingOutlook): { onTrack: string; below: string; noScore: string | null } {
  const noScore = o.rows.filter((r) => r.score === null).length;
  return {
    onTrack: `${o.onTrack} on track`,
    below: `${o.below} below the mark`,
    noScore: noScore > 0 ? `${noScore} not scored yet` : null,
  };
}

/** The criteria as the season holds them, one line each. */
export function criteriaLines(o: PassingOutlook): string[] {
  const { weights, passMark } = o.criteria;
  return [...KEYS.map((key) => `${NUMBER_LABELS[key]} ${weights[key]}%`), `Pass mark ${passMark}`];
}

/** What the criteria line can't say: they are only suggested, or a weight counts as 0 this season. */
export function criteriaNotes(o: PassingOutlook): string[] {
  const notes: string[] = [];
  if (o.isDefault) notes.push("Suggested criteria: nobody has saved criteria for this season yet.");
  for (const key of o.weightsIgnored) {
    notes.push(
      `${NUMBER_LABELS[key]} has nothing to count this season, so its ${o.criteria.weights[key]}% counts as 0.`,
    );
  }
  return notes;
}

/** "attendance", "attendance and quizzes": the numbers a re-scaled score was computed without. */
function missingNumbers(row: PassingOutlookRow, o: PassingOutlook): string {
  const pcts = passingPcts(row.numbers);
  const { weights } = usableWeights(o.criteria.weights, o.available);
  const names = KEYS.filter((key) => weights[key] > 0 && pcts[key] === null).map((key) =>
    NUMBER_LABELS[key].toLowerCase(),
  );
  return names.join(" and ");
}

type OutlookRowView = { userId: number; name: string; chip: ChipSpec; lines: string[] };

/** A student's row: a status in words, then one fact per line. */
export function outlookRowView(row: PassingOutlookRow, o: PassingOutlook): OutlookRowView {
  const lines: string[] = [];
  let chip: ChipSpec;
  if (row.score === null) {
    chip = { tone: "neutral", label: "No score yet" };
    lines.push("Nothing to count for them yet");
  } else if (row.pointsShort !== null) {
    chip = { tone: "bad", label: "Below the mark" };
    lines.push(`${plural(row.pointsShort, "point")} short`);
    if (row.weakest) {
      const pct = passingPcts(row.numbers)[row.weakest];
      if (pct !== null) lines.push(`${NUMBER_LABELS[row.weakest]} ${Math.round(pct)}%`);
    }
    lines.push(`Score ${row.score.toFixed(1)}`);
  } else {
    chip = { tone: "ok", label: "On track" };
    lines.push(`Score ${row.score.toFixed(1)}`);
  }
  if (row.rescaled) {
    const missing = missingNumbers(row, o);
    if (missing) lines.push(`Scored without ${missing}`);
  }
  if (row.groupName) lines.push(row.groupName);
  return { userId: row.userId, name: row.name, chip, lines };
}
