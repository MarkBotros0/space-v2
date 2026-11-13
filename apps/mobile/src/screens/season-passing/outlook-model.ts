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
import { joinMeta } from "../../lib/join-meta";
import { plural } from "../../lib/plural";
import { WEIGHT_KEYS } from "./criteria-model";

export const NUMBER_LABELS: Record<PassingNumberKey, string> = {
  attendance: "Attendance",
  assignments: "Assignments",
  quizzes: "Quizzes",
};

/** The counts at the top: two tiles and, when some have no score, a line under them. */
export function outlookHeader(o: PassingOutlook): { onTrack: number; below: number; noScore: string | null } {
  const noScore = o.rows.filter((r) => r.score === null).length;
  return { onTrack: o.onTrack, below: o.below, noScore: noScore > 0 ? `${noScore} not scored yet` : null };
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
  const names = WEIGHT_KEYS.filter((key) => weights[key] > 0 && pcts[key] === null).map((key) =>
    NUMBER_LABELS[key].toLowerCase(),
  );
  return names.join(" and ");
}

export type OutlookStanding = "below" | "onTrack" | "none";

type OutlookRowView = {
  userId: number;
  name: string;
  standing: OutlookStanding;
  /** The score in the badge, one decimal as it is compared with the mark; "–" with none. */
  badge: string;
  chip: ChipSpec;
  lines: string[];
};

/** A student's row: their score for the badge, a status in words and one line of facts, then their group. */
export function outlookRowView(row: PassingOutlookRow, o: PassingOutlook): OutlookRowView {
  const facts: (string | null)[] = [];
  let standing: OutlookStanding;
  if (row.score === null) {
    standing = "none";
    facts.push("Nothing to count for them yet");
  } else if (row.pointsShort !== null) {
    standing = "below";
    facts.push(`${plural(row.pointsShort, "point")} short`);
    const pct = row.weakest ? passingPcts(row.numbers)[row.weakest] : null;
    if (row.weakest && pct !== null) facts.push(`${NUMBER_LABELS[row.weakest]} ${Math.round(pct)}%`);
  } else {
    standing = "onTrack";
    const above = Math.round((row.score - o.criteria.passMark) * 10) / 10;
    facts.push(above > 0 ? `${plural(above, "point")} above the mark` : "Right at the mark");
  }
  const lines = [joinMeta(facts)];
  if (row.rescaled) {
    const missing = missingNumbers(row, o);
    if (missing) lines.push(`Scored without ${missing}`);
  }
  if (row.groupName) lines.push(row.groupName);
  return {
    userId: row.userId,
    name: row.name,
    standing,
    badge: row.score === null ? "–" : row.score.toFixed(1),
    chip: STANDING_CHIPS[standing],
    lines,
  };
}

const STANDING_CHIPS: Record<OutlookStanding, ChipSpec> = {
  below: { tone: "bad", label: "Below the mark" },
  onTrack: { tone: "ok", label: "On track" },
  none: { tone: "neutral", label: "No score yet" },
};

/** The list in three sections, each with its count in brackets; an empty section is left out. */
export function outlookSections(
  o: PassingOutlook,
): { standing: OutlookStanding; header: string; rows: OutlookRowView[] }[] {
  const views = o.rows.map((row) => outlookRowView(row, o));
  return (["below", "onTrack", "none"] as const)
    .map((standing) => {
      const rows = views.filter((v) => v.standing === standing);
      return { standing, header: `${STANDING_CHIPS[standing].label} (${rows.length})`, rows };
    })
    .filter((section) => section.rows.length > 0);
}
