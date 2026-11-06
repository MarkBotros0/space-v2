import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, apiError } from "../../lib/api-response";
import { auditLog } from "../../lib/audit";
import { seasonPeopleIds } from "../../lib/auth/season-people";
import { markSessionsStale } from "../../lib/auth/session-validity";
import { parseId } from "../../lib/parse-id";
import { loadSeasonEndCheck } from "../../lib/queries/season-end";
import { isAdminOfSeason } from "../../lib/rbac";
import { requireUser } from "../../middleware/require-auth";
import { endSeasonRequestSchema } from "../../../../../packages/shared/src/index";
import { forbidden } from "../respond";

/** What blocks the season from ending, and who it would end for. */
export async function getSeasonEndCheck(req: Request, res: Response) {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid season id.", 400);
  if (!isAdminOfSeason(user, id)) return forbidden(res);

  const season = await db.season.findFirst({ where: { id, deletedAt: null }, select: { status: true } });
  if (!season) return apiError(res, "not_found", "Season not found.", 404);
  if (season.status !== "ACTIVE") {
    return apiError(res, "season_not_active", "Only an active season can be ended.", 409);
  }
  return apiOk(res, await loadSeasonEndCheck(id, new Date()));
}

/** Thrown inside the End transaction to roll it back with a specific answer. */
class EndRefused extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * End a season in one transaction: complete it, give every ACTIVE student a
 * PASSED / NOT_PASSED result and mark everyone's sessions stale so the finished
 * season drops out of their scopes. The season is claimed with a conditional
 * update first, so of two concurrent Ends exactly one proceeds, and the blocker
 * check runs after the claim, on the data the claim protects.
 */
export async function endSeason(req: Request, res: Response) {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid season id.", 400);
  if (!isAdminOfSeason(user, id)) return forbidden(res);

  const parsed = endSeasonRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid end-season body.", 400);
  const reasons = new Map(parsed.data.notPassed.map((n) => [n.userId, n.reason?.trim() || null]));

  const season = await db.season.findFirst({ where: { id, deletedAt: null }, select: { status: true } });
  if (!season) return apiError(res, "not_found", "Season not found.", 404);
  if (season.status !== "ACTIVE") {
    return apiError(res, "season_not_active", "Only an active season can be ended.", 409);
  }

  const now = new Date();
  try {
    const ended = await db.$transaction(async (tx) => {
      const claimed = await tx.season.updateMany({
        where: { id, status: "ACTIVE", deletedAt: null },
        data: { status: "COMPLETED", updatedById: user.userId },
      });
      if (claimed.count === 0) {
        throw new EndRefused("season_not_active", 409, "Only an active season can be ended.");
      }
      const check = await loadSeasonEndCheck(id, now, tx);
      const { submissions, quizAttempts, attendance } = check.blockers;
      if (submissions.length + quizAttempts.length + attendance.length > 0) {
        throw new EndRefused("season_unfinished", 409, "The season still has work to finish.");
      }
      const activeIds = new Set(check.students.map((s) => s.userId));
      if ([...reasons.keys()].some((uid) => !activeIds.has(uid))) {
        throw new EndRefused("bad_request", 400, "notPassed names a student who is not active in this season.");
      }

      const passedIds = [...activeIds].filter((uid) => !reasons.has(uid));
      const stamp = { status: "COMPLETED" as const, completedAt: now, resultSetAt: now };
      await tx.seasonEnrollment.updateMany({
        where: { seasonId: id, status: "ACTIVE", studentUserId: { in: passedIds } },
        data: { ...stamp, result: "PASSED", resultReason: null },
      });
      for (const [uid, reason] of reasons) {
        await tx.seasonEnrollment.updateMany({
          where: { seasonId: id, status: "ACTIVE", studentUserId: uid },
          data: { ...stamp, result: "NOT_PASSED", resultReason: reason },
        });
      }
      // A deleted account is neither passed nor failed: close its enrolment with no result.
      await tx.seasonEnrollment.updateMany({
        where: { seasonId: id, status: "ACTIVE", studentUser: { deletedAt: { not: null } } },
        data: { status: "COMPLETED", completedAt: now },
      });
      // A live student enrolled between the check and here was never reviewed: refuse.
      const unreviewed = await tx.seasonEnrollment.count({
        where: { seasonId: id, status: "ACTIVE", studentUser: { deletedAt: null } },
      });
      if (unreviewed > 0) {
        throw new EndRefused("season_unfinished", 409, "The roster changed; check the season again.");
      }
      await markSessionsStale(tx, await seasonPeopleIds(tx, id), now);
      return tx.season.findUniqueOrThrow({ where: { id }, select: { id: true, code: true, status: true } });
    });
    auditLog("season.end", user.userId, user.userId, { season: id });
    return apiOk(res, { season: ended });
  } catch (err) {
    if (err instanceof EndRefused) return apiError(res, err.code, err.message, err.status);
    throw err;
  }
}
