/**
 * Where a staff member's tap on a quiz goes (owner, 2026-11-13: the admin and super still edit a
 * published quiz until a student starts it, and see its questions after). An author (admin or
 * super) opens a draft in the builder and a published online quiz on its page, which shows the
 * questions with the key, Edit quiz, Grade and Live; the builder itself holds the questions once
 * students have started. A paper quiz has no questions, so it opens grading, and so does every
 * quiz for a leader, whose work is the marking.
 */
type QuizRow = { id: number; kind: "PAPER" | "ONLINE"; publishedAt: string | null };

export function staffQuizHref(q: QuizRow, canAuthor: boolean) {
  const params = { id: String(q.id) };
  if (canAuthor && q.kind === "ONLINE") {
    return q.publishedAt === null
      ? ({ pathname: "/quiz/[id]/edit", params } as const)
      : ({ pathname: "/quiz/[id]", params } as const);
  }
  return { pathname: "/quiz/[id]/grade", params } as const;
}
