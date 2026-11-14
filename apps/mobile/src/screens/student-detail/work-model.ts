/**
 * The words of a student's Work section on their page (owner 2026-11-14: "the assignment already
 * includes the submission"): an assignment and a quiz each say in one chip what the student did,
 * and an assignment's pop-up names each part's state. Pure, so the copy is tested apart.
 */
import { htmlToPlainText, type AssignmentPart, type StudentProgress } from "@space/shared";

import type { ChipSpec } from "../../design/ui/status-chip";
import { formatScore } from "../../lib/format";
import { partKindLabel } from "../../lib/assignment-labels";
import { handedInEssays, partChips, type ProgressRow } from "../assignment-detail/progress-model";

type ProgressQuiz = StudentProgress["quizzes"][number];

/** A quiz's chip: its score as marks and percent, or that it has none yet. */
export function quizChip(q: ProgressQuiz): ChipSpec {
  if (q.score === null) return { tone: "neutral", label: "No score yet" };
  const pct = q.maxScore > 0 ? ` · ${Math.round((q.score / q.maxScore) * 100)}%` : "";
  return { tone: "ok", label: `${formatScore(q.score)} / ${formatScore(q.maxScore)}${pct}` };
}

export type PartLine = {
  partId: number;
  /** "Part 1 · Video" */
  name: string;
  title: string;
  /** The state alone ("Watched", "Waiting review"): the line already names the part. */
  chip: ChipSpec;
  /** The essay to open, when this part is one handed in. */
  essayPublicId: string | null;
};

/** "Essay 2: waiting review" → "Waiting review"; "Video 6/18 min" has no state word and stays. */
export function stateOnly(label: string): string {
  const at = label.indexOf(": ");
  if (at < 0) return label;
  const state = label.slice(at + 2);
  return state.charAt(0).toUpperCase() + state.slice(1);
}

const byPosition = (parts: AssignmentPart[]) => [...parts].sort((a, b) => a.position - b.position);

/** One line per part in the admin's order, with the student's state on it and the essay to open. */
export function partLines(parts: AssignmentPart[], row: ProgressRow | undefined): PartLine[] {
  const ordered = byPosition(parts);
  const works = row?.parts ?? [];
  const chips = partChips(ordered, works);
  const essays = row ? handedInEssays(ordered, row) : [];
  return ordered.map((part, i) => {
    const essay =
      part.kind === "ESSAY" ? works.find((w) => w.partId === part.id)?.essay : undefined;
    const handedIn = essay && essays.some((e) => e.publicId === essay.publicId) ? essay.publicId : null;
    return {
      partId: part.id,
      name: `Part ${i + 1} · ${partKindLabel(part.kind)}`,
      title: part.kind === "VIDEO" ? part.title : htmlToPlainText(part.prompt),
      chip: { ...chips[i]!, label: stateOnly(chips[i]!.label) },
      essayPublicId: handedIn,
    };
  });
}
