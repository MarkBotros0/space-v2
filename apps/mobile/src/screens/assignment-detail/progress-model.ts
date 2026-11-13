/**
 * The leader's progress (spec "The leader's side"), pure: one chip per part in
 * words, each row's standing, unfinished students first, and which essay a row
 * opens. Done, left and watched come from the shared rules, never re-derived.
 */
import {
  isWatched,
  partDone,
  partsLeft,
  type AssignmentPart,
  type AssignmentProgress,
  type PartWork,
} from "@space/shared";

import type { ChipSpec } from "../../design/ui/status-chip";
import { partKindLabel } from "../../lib/assignment-labels";
import { formatShortDateTime } from "../../lib/format";
import { plural } from "../../lib/plural";

export type ProgressRow = AssignmentProgress["rows"][number];

const byPosition = (parts: AssignmentPart[]) => [...parts].sort((a, b) => a.position - b.position);
const workFor = (part: AssignmentPart, works: PartWork[]) => works.find((w) => w.partId === part.id);

function videoChip(
  part: Extract<AssignmentPart, { kind: "VIDEO" }>,
  work: PartWork | undefined,
  name: string,
  numbered: boolean,
): ChipSpec {
  const v = work?.video;
  if (partDone(part, work) && v !== undefined) {
    return v.questionCount > 0
      ? { tone: "ok", label: `${name}: ${v.correct} of ${v.questionCount} correct` }
      : { tone: "ok", label: `${name}: watched` };
  }
  if (v === undefined || v.watchedSeconds <= 0) return { tone: "neutral", label: `${name}: not started` };
  // Watched by exactly the length shared partDone reads (the work's), so this chip and partsLeft agree.
  if (isWatched(v.watchedSeconds, v.durationSeconds)) {
    return { tone: "warn", label: `${name}: ${v.answered} of ${v.questionCount} answered` };
  }
  // Only the words fall back to the part's length, for a work that has none yet.
  const shown = v.durationSeconds > 0 ? v.durationSeconds : part.durationSeconds;
  const minutes = `${Math.floor(v.watchedSeconds / 60)}/${Math.max(1, Math.round(shown / 60))} min`;
  // "Video 6/18 min" (brief); a numbered one keeps its number apart: "Video 2: 6/18 min".
  return { tone: "warn", label: numbered ? `${name}: ${minutes}` : `${name} ${minutes}` };
}

function essayChip(work: PartWork | undefined, name: string): ChipSpec {
  switch (work?.essay?.reviewStatus) {
    case "SUBMITTED":
      return { tone: "info", label: `${name}: waiting review` };
    case "REVIEWED":
      return { tone: "ok", label: `${name}: reviewed` };
    case "RETURNED":
      return { tone: "warn", label: `${name}: returned` };
    default:
      // A draft is its author's alone: to a leader it is not handed in yet.
      return { tone: "neutral", label: `${name}: not handed in` };
  }
}

/** One mark per part, in the admin's order. Parts of a kind that appears twice are numbered. */
export function partChips(parts: AssignmentPart[], works: PartWork[]): ChipSpec[] {
  const ordered = byPosition(parts);
  const seen: Record<string, number> = {};
  return ordered.map((part) => {
    const many = ordered.filter((p) => p.kind === part.kind).length > 1;
    seen[part.kind] = (seen[part.kind] ?? 0) + 1;
    const name = many ? `${partKindLabel(part.kind)} ${seen[part.kind]}` : partKindLabel(part.kind);
    const work = workFor(part, works);
    switch (part.kind) {
      case "VIDEO":
        return videoChip(part, work, name, many);
      case "ESSAY":
        return essayChip(work, name);
      case "FORUM":
        return partDone(part, work)
          ? { tone: "ok", label: `${name}: posted` }
          : { tone: "neutral", label: `${name}: not posted` };
    }
  });
}

/**
 * The chips a row shows: none while every part is untouched (all neutral), so a class of students who
 * haven't started reads as one quiet line, not three grey chips each (owner, 2026-11-13: "messy").
 */
export function shownChips(chips: ChipSpec[]): ChipSpec[] {
  return chips.every((c) => c.tone === "neutral") ? [] : chips;
}

/** The share finished, 0..100, for the summary bar. */
export function finishedPercent(finished: number, total: number): number {
  return total === 0 ? 0 : Math.round((finished / total) * 100);
}

/**
 * Finished: submitted, with no part left (a returned essay counts as left), or marked submitted by
 * staff, which counts whatever the parts say (a returned essay takes the mark away).
 */
export function isFinished(parts: AssignmentPart[], row: ProgressRow): boolean {
  if (row.staffMark !== null) return true;
  return row.submittedAt !== null && partsLeft(parts, row.parts) === 0;
}

const byName = (a: ProgressRow, b: ProgressRow) => {
  if (a.name === null || b.name === null) return a.name === b.name ? 0 : a.name === null ? 1 : -1;
  return a.name.localeCompare(b.name);
};

/** Unfinished students first (not submitted, or parts left), each half by name, unnamed last. */
export function orderProgress(
  parts: AssignmentPart[],
  rows: ProgressRow[],
): { unfinished: ProgressRow[]; finished: ProgressRow[] } {
  return {
    unfinished: rows.filter((r) => !isFinished(parts, r)).sort(byName),
    finished: rows.filter((r) => isFinished(parts, r)).sort(byName),
  };
}

/** "Marked submitted by Grace", or just "Marked submitted" once the account that marked it is gone. */
export function markedLine(markedByName: string | null): string {
  return markedByName === null ? "Marked submitted" : `Marked submitted by ${markedByName}`;
}

/**
 * The row's standing in one fact: "2 parts left", "Every part done, not submitted yet", "Submitted Mar 30, …",
 * or "Marked submitted by Grace". A student's own submission in the app stands beside a mark.
 */
export function progressLine(parts: AssignmentPart[], row: ProgressRow): string {
  if (row.staffMark !== null) {
    return row.submittedAt === null
      ? markedLine(row.staffMark.markedByName)
      : `Submitted ${formatShortDateTime(row.submittedAt)}`;
  }
  const left = partsLeft(parts, row.parts);
  if (left > 0) return `${plural(left, "part")} left`;
  if (row.submittedAt === null) return "Every part done, not submitted yet";
  return `Submitted ${formatShortDateTime(row.submittedAt)}`;
}

export type HandedInEssay = { publicId: string; label: string };

/**
 * The essays a row can open, in the admin's order, each named as its chip is
 * ("Essay 2: waiting review"): every essay handed in (waiting, reviewed or
 * returned). Always the essay work's publicId, which the review screen reads.
 * One opens directly; two or more open a list.
 */
export function handedInEssays(parts: AssignmentPart[], row: ProgressRow): HandedInEssay[] {
  const ordered = byPosition(parts);
  const chips = partChips(ordered, row.parts);
  return ordered.flatMap((part, i) => {
    const essay = part.kind === "ESSAY" ? workFor(part, row.parts)?.essay : undefined;
    if (essay === undefined || essay.reviewStatus === "DRAFT") return [];
    return [{ publicId: essay.publicId, label: chips[i]!.label }];
  });
}
