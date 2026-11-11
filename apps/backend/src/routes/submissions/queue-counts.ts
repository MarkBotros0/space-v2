import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";

/**
 * The queue header's three numbers over `reachable` essay works, without
 * loading rows.
 *
 * `pending` and `total` are plain counts. `late` compares two columns on two
 * tables (the essay's submittedAt > its assignment's dueAt), which a Prisma
 * filter cannot express directly, so it is resolved in two bounded steps
 * instead: first the due dates of the assignments that have any reachable
 * essay (bounded by assignments, not essays), then one count whose OR pins
 * each assignment to its own due date. Both steps reuse `reachable` verbatim,
 * so the caller's scope is applied by exactly the clause the list uses — a
 * hand-written SQL copy of that scope could drift into counting rows the
 * caller cannot see.
 */
export async function countQueue(reachable: Prisma.AssignmentPartWorkWhereInput) {
  const [pending, total, dueDates] = await Promise.all([
    db.assignmentPartWork.count({ where: { AND: [reachable, { status: "SUBMITTED" as const }] } }),
    db.assignmentPartWork.count({ where: reachable }),
    db.assignment.findMany({
      where: { dueAt: { not: null }, parts: { some: { work: { some: reachable } } } },
      select: { id: true, dueAt: true },
    }),
  ]);

  const lateClauses: Prisma.AssignmentPartWorkWhereInput[] = dueDates.flatMap((a) =>
    a.dueAt ? [{ part: { assignmentId: a.id }, submittedAt: { gt: a.dueAt } }] : [],
  );
  const late =
    lateClauses.length === 0
      ? 0
      : await db.assignmentPartWork.count({ where: { AND: [reachable, { OR: lateClauses }] } });

  return { pending, total, late };
}
