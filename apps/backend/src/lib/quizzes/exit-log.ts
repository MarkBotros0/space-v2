import { db } from "../../db/client";
import type { QuizGradingEvent } from "../../../../../packages/shared/src/index";

/** What the grading views add for an attempt that was ended: the reason, the staff member's name, the deadline. */
export const GRADING_END_SELECT = {
  endReason: true,
  deadlineAt: true,
  endedBy: { select: { name: true } },
} as const;

export function endInfo(a: {
  endReason: "SUBMITTED" | "TIMED_OUT" | "ENDED_BY_STAFF" | "ENDED_BY_EXITS" | null;
  deadlineAt: Date | null;
  endedBy: { name: string } | null;
}) {
  return { endReason: a.endReason, endedByName: a.endedBy?.name ?? null, deadlineAt: a.deadlineAt };
}

/** The exit log of several attempts in one query: events oldest first, per attempt id. Staff-only. */
export async function exitLogsFor(attemptIds: number[]): Promise<Map<number, QuizGradingEvent[]>> {
  const out = new Map<number, QuizGradingEvent[]>();
  if (attemptIds.length === 0) return out;
  const rows = await db.quizAttemptEvent.findMany({
    where: { attemptId: { in: attemptIds } },
    orderBy: [{ leftAt: "asc" }, { id: "asc" }],
    select: { attemptId: true, kind: true, leftAt: true, returnedAt: true },
  });
  for (const r of rows) {
    const list = out.get(r.attemptId) ?? [];
    list.push({ kind: r.kind, leftAt: r.leftAt.toISOString(), returnedAt: r.returnedAt?.toISOString() ?? null });
    out.set(r.attemptId, list);
  }
  return out;
}
