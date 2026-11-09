import type { Request, Response } from "express";

import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import { apiOk, apiError, forbidden } from "../../lib/api-response";
import { submissionQueueScopeFor } from "../../lib/permissions";
import { isLate } from "../../lib/queries/assignments";
import { requireUser } from "../../middleware/require-auth";
import { submissionQueueQuerySchema } from "../../../../../packages/shared/src/index";
import { countQueue } from "./queue-counts";

/**
 * A reviewer's queue.
 *
 * v1's returned every submission the reader could reach, in every season, in
 * one unpaginated response. Scoped and paged here — on a phone the old shape is
 * both a privacy problem and a payload problem.
 *
 * A LEADER's scope cannot be written as a single Prisma filter: the constraint
 * is "the student's enrolment *in this assignment's season* names a group I
 * lead", which relates two branches of the query to each other. So the pairs
 * are resolved first and expanded into an OR. That is bounded by the leader's
 * own roster, not by the season.
 */
export async function listSubmissionQueue(req: Request, res: Response) {
  const user = requireUser(req);

  if (user.role === "STUDENT") return forbidden(res);

  const parsed = submissionQueueQuerySchema.safeParse(req.query);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid query.", 400);
  const { pendingOnly, seasonId, cursor, limit } = parsed.data;

  const scope = await submissionQueueScopeFor(user);
  if (scope === null) {
    return apiOk(res, {
      items: [],
      counts: cursor ? null : { pending: 0, total: 0, late: 0 },
      nextCursor: null,
    });
  }

  // AND rather than spreading, so the scope's own `assignment` constraint (the
  // ADMIN case) cannot be silently overwritten by the filters below it. A
  // scope clause that disappears here is a data leak, not a lost filter.
  //
  // A DRAFT is the student's private work-in-progress: never visible to a
  // reviewer, whatever pendingOnly says. `reachable` is everything the caller
  // may see; `where` additionally applies pendingOnly. The header counts use
  // `reachable` so they do not move as the list is filtered (REG-89).
  const reachable: Prisma.SubmissionWhereInput = {
    AND: [
      scope,
      { assignment: { deletedAt: null } },
      { status: { not: "DRAFT" as const } },
      ...(seasonId ? [{ assignment: { seasonId } }] : []),
    ],
  };
  const where: Prisma.SubmissionWhereInput = pendingOnly
    ? { AND: [reachable, { status: "SUBMITTED" as const }] }
    : reachable;

  // The header's numbers do not move as the list scrolls (the client reads the
  // first page's), so a cursor page skips them. See ./queue-counts.ts.
  const counts = cursor ? null : await countQueue(reachable);

  // v1's order (REG-89): status ascending (SUBMITTED, REVIEWED, RETURNED — the
  // enum's declaration order, so what needs a verdict comes first), then most
  // recently submitted. id is the final tiebreak so the cursor is stable when
  // two submissions share a submittedAt.
  // One extra row tells us whether another page exists without a second count.
  const rows = await db.submission.findMany({
    where,
    orderBy: [{ status: "asc" }, { submittedAt: { sort: "desc", nulls: "last" } }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { publicId: cursor }, skip: 1 } : {}),
    select: {
      publicId: true,
      status: true,
      submittedAt: true,
      studentUserId: true,
      assignmentId: true,
      assignment: {
        select: { title: true, dueAt: true, seasonId: true, season: { select: { code: true } } },
      },
      studentUser: { select: { name: true } },
    },
  });

  const page = rows.slice(0, limit);

  // Group membership is per season, so it is resolved per (student, season)
  // pair rather than from GroupStudent — ruling C9.
  const enrollments = await db.seasonEnrollment.findMany({
    where: {
      OR: page.map((r) => ({
        studentUserId: r.studentUserId,
        seasonId: r.assignment.seasonId,
      })),
    },
    select: {
      studentUserId: true,
      seasonId: true,
      groupId: true,
      group: { select: { name: true } },
    },
  });
  const groupBy = new Map(enrollments.map((e) => [`${e.studentUserId}:${e.seasonId}`, e] as const));

  return apiOk(res, {
    items: page.map((r) => {
      const enrollment = groupBy.get(`${r.studentUserId}:${r.assignment.seasonId}`);
      return {
        publicId: r.publicId,
        status: r.status,
        submittedAt: r.submittedAt,
        isLate: isLate(r.submittedAt, r.assignment.dueAt),
        assignmentId: r.assignmentId,
        assignmentTitle: r.assignment.title,
        assignmentDueAt: r.assignment.dueAt,
        seasonCode: r.assignment.season.code,
        studentUserId: r.studentUserId,
        studentName: r.studentUser.name,
        groupId: enrollment?.groupId ?? null,
        groupName: enrollment?.group?.name ?? null,
      };
    }),
    counts,
    nextCursor: rows.length > limit ? (page[page.length - 1]?.publicId ?? null) : null,
  });
}
