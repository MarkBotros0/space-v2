import type { QuizSummary } from "@space/shared";

import { formatDate } from "../../lib/format";
import { joinMeta } from "../../lib/join-meta";
import { plural } from "../../lib/plural";

/** An online quiz nobody has published yet: students can't see it. Paper quizzes have no draft. */
export function isDraft(q: QuizSummary): boolean {
  return q.kind === "ONLINE" && q.publishedAt === null;
}

/** Newest created first; the id breaks a tie (owner, 2026-11-13: "sort by creation time"). */
function byCreated(a: QuizSummary, b: QuizSummary): number {
  return b.createdAt.localeCompare(a.createdAt) || b.id - a.id;
}

/** The Work tab's two sections (owner, 2026-11-13): drafts apart from what students can see. */
export function quizSections(rows: readonly QuizSummary[]): { drafts: QuizSummary[]; published: QuizSummary[] } {
  const sorted = [...rows].sort(byCreated);
  return { drafts: sorted.filter(isDraft), published: sorted.filter((q) => !isDraft(q)) };
}

/** What kind of quiz it is, its session, and when it was added. */
export function quizSubtitle(q: QuizSummary): string {
  const kind = q.kind === "ONLINE" ? `Online · ${plural(q.questionCount, "question")}` : "Paper";
  return joinMeta([kind, q.sessionTitle ?? "No session", `Added ${formatDate(q.createdAt)}`]);
}
