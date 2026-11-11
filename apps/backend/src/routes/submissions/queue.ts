import type { Request, Response } from "express";

import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import { apiOk, forbidden } from "../../lib/api-response";
import { submissionQueueScopeFor } from "../../lib/permissions";
import { isLate } from "../../lib/queries/assignments";
import { requireUser } from "../../middleware/require-auth";
import { submissionQueueQuerySchema } from "../../../../../packages/shared/src/index";
import { countQueue } from "./queue-counts";
import { parseOr400 } from "../../lib/http/validate";
import { liveAssignment } from "../../lib/db/live";

/**
 * A reviewer's queue: essays, one item per student per essay, labelled with
 * the assignment and the essay's question (spec "Review"). A video's progress
 * and a forum post are never items: only essays are reviewed.
 *
 * Scoped and paged. The caller's scope is over the essay's Submission
 * (`submissionQueueScopeFor`, the same clause the dashboard's counts use): a
 * LEADER's is "the student's enrolment *in this assignment's season* names a
 * group I lead", resolved first into an OR bounded by the leader's roster.
 */
export async function listSubmissionQueue(req: Request, res: Response) {
  const user = requireUser(req);

  if (user.role === "STUDENT") return forbidden(res);

  const parsed = parseOr400(submissionQueueQuerySchema, req.query, res, "Invalid query.");
  if (parsed === null) return;
  const { pendingOnly, seasonId, cursor, limit } = parsed;

  const scope = await submissionQueueScopeFor(user);
  if (scope === null) {
    return apiOk(res, {
      items: [],
      counts: cursor ? null : { pending: 0, total: 0, late: 0 },
      nextCursor: null,
    });
  }

  // AND rather than spreading, so the scope's own constraint cannot be
  // silently overwritten by the filters below it. A scope clause that
  // disappears here is a data leak, not a lost filter.
  //
  // A DRAFT is the student's private work-in-progress: never visible to a
  // reviewer, whatever pendingOnly says. `reachable` is everything the caller
  // may see; `where` additionally applies pendingOnly. The header counts use
  // `reachable` so they do not move as the list is filtered (REG-89).
  const reachable: Prisma.AssignmentPartWorkWhereInput = {
    AND: [
      { submission: scope },
      { part: { kind: "ESSAY", assignment: liveAssignment } },
      { status: { not: "DRAFT" as const } },
      ...(seasonId ? [{ part: { assignment: { seasonId } } }] : []),
    ],
  };
  const where: Prisma.AssignmentPartWorkWhereInput = pendingOnly
    ? { AND: [reachable, { status: "SUBMITTED" as const }] }
    : reachable;

  // The header's numbers do not move as the list scrolls (the client reads the
  // first page's), so a cursor page skips them. See ./queue-counts.ts.
  const counts = cursor ? null : await countQueue(reachable);

  // v1's order (REG-89): status ascending (SUBMITTED, REVIEWED, RETURNED — the
  // enum's declaration order, so what needs a verdict comes first), then most
  // recently handed in. id is the final tiebreak so the cursor is stable when
  // two essays share a submittedAt.
  // One extra row tells us whether another page exists without a second count.
  const rows = await db.assignmentPartWork.findMany({
    where,
    orderBy: [{ status: "asc" }, { submittedAt: { sort: "desc", nulls: "last" } }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { publicId: cursor }, skip: 1 } : {}),
    select: {
      publicId: true,
      status: true,
      submittedAt: true,
      reviewedAt: true,
      part: {
        select: { assignmentId: true, prompt: true, assignment: { select: { title: true, dueAt: true } } },
      },
      studentUser: { select: { name: true } },
    },
  });

  const page = rows.slice(0, limit);
  return apiOk(res, {
    items: page.map((r) => ({
      publicId: r.publicId,
      assignmentId: r.part.assignmentId,
      assignmentTitle: r.part.assignment.title,
      prompt: r.part.prompt ?? "",
      studentName: r.studentUser.name,
      submittedAt: r.submittedAt,
      isLate: isLate(r.submittedAt, r.part.assignment.dueAt),
      reviewStatus: r.status,
      // When the last verdict was given: a RETURNED row says "Returned <date>".
      reviewedAt: r.reviewedAt,
    })),
    counts,
    nextCursor: rows.length > limit ? (page[page.length - 1]?.publicId ?? null) : null,
  });
}
