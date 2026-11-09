import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";

/**
 * The queue header's three numbers over `reachable`, without loading rows.
 *
 * The old version selected every reachable submission and counted in memory —
 * for SUPER and MENTOR that was the whole table, on every page request.
 *
 * `pending` and `total` are plain counts. `late` compares two columns on two
 * tables (Submission.submittedAt > Assignment.dueAt), which a Prisma filter
 * cannot express directly, so it is resolved in two bounded steps instead:
 * first the due dates of the assignments that have any reachable submission
 * (bounded by assignments, not submissions), then one count whose OR pins each
 * assignment to its own due date. Both steps reuse `reachable` verbatim, so the
 * caller's scope is applied by exactly the clause the list uses — a hand-written
 * SQL copy of that scope could drift into counting rows the caller cannot see.
 */
export async function countQueue(reachable: Prisma.SubmissionWhereInput) {
  const [pending, total, dueDates] = await Promise.all([
    db.submission.count({ where: { AND: [reachable, { status: "SUBMITTED" as const }] } }),
    db.submission.count({ where: reachable }),
    db.assignment.findMany({
      where: { dueAt: { not: null }, submissions: { some: reachable } },
      select: { id: true, dueAt: true },
    }),
  ]);

  const lateClauses: Prisma.SubmissionWhereInput[] = dueDates.flatMap((a) =>
    a.dueAt ? [{ assignmentId: a.id, submittedAt: { gt: a.dueAt } }] : [],
  );
  const late =
    lateClauses.length === 0 ? 0 : await db.submission.count({ where: { AND: [reachable, { OR: lateClauses }] } });

  return { pending, total, late };
}
