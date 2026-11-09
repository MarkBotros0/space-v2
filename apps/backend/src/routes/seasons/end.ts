import type { ApiErrorCode } from "@space/shared";
import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, apiError, forbidden } from "../../lib/api-response";
import { auditLog } from "../../lib/audit";
import { seasonPeopleIds } from "../../lib/auth/season-people";
import { markSessionsStale } from "../../lib/auth/session-validity";
import { parseId } from "../../lib/parse-id";
import { loadSeasonEndCheck } from "../../lib/queries/season-end";
import { graduatePassed } from "../../lib/queries/students/writes";
import { isAdminOfSeason } from "../../lib/rbac";
import { lockPeople, lockSeason } from "../../lib/roles";
import { requireUser } from "../../middleware/require-auth";
import { endSeasonRequestSchema } from "../../../../../packages/shared/src/index";

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
    readonly code: ApiErrorCode,
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * End a season in one transaction: complete it, give every ACTIVE student a
 * PASSED / NOT_PASSED result, graduate those who passed if it is a graduating
 * season, and mark everyone's sessions stale so the finished season drops out of
 * their scopes and a graduate's next token says alumnus. The season's row is
 * locked first, so its flag is read as End will act on it, and a seat
 * write goes in wholly before this or sees the season finished. It is claimed
 * with a conditional update, so of two concurrent Ends exactly one proceeds, and
 * the blocker check runs after the claim, on the data the claim protects, as does
 * the comparison with `reviewed`, what the staff member was shown.
 */
export async function endSeason(req: Request, res: Response) {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid season id.", 400);
  if (!isAdminOfSeason(user, id)) return forbidden(res);

  const parsed = endSeasonRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid end-season body.", 400);
  const reasons = new Map(parsed.data.notPassed.map((n) => [n.userId, n.reason?.trim() || null]));

  const season = await db.season.findFirst({ where: { id, deletedAt: null }, select: { status: true, year: true } });
  if (!season) return apiError(res, "not_found", "Season not found.", 404);
  if (season.status !== "ACTIVE") {
    return apiError(res, "season_not_active", "Only an active season can be ended.", 409);
  }

  const now = new Date();
  try {
    const ended = await db.$transaction(
      async (tx) => {
        await lockSeason(tx, id, "update");
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
        // Graduating can't be undone, and everyone not named in notPassed passes:
        // End only goes ahead on what the staff member was actually shown.
        const reviewedIds = new Set(parsed.data.reviewed.userIds);
        if (
          parsed.data.reviewed.graduatesOnPass !== check.graduatesOnPass ||
          reviewedIds.size !== activeIds.size ||
          [...activeIds].some((uid) => !reviewedIds.has(uid))
        ) {
          throw new EndRefused("season_unfinished", 409, "The roster changed; check the season again.");
        }
        if ([...reasons.keys()].some((uid) => !activeIds.has(uid))) {
          throw new EndRefused("bad_request", 400, "notPassed names a student who is not active in this season.");
        }

        // Season, people, rows: the same order as a graduation or a correction, which
        // hold the person and then write the row. A person is seated only under the
        // season's lock, so this list can't grow.
        const people = await seasonPeopleIds(tx, id);
        await lockPeople(tx, people);

        const passedIds = [...activeIds].filter((uid) => !reasons.has(uid));
        const stamp = { status: "COMPLETED" as const, completedAt: now, resultSetAt: now };
        const completed = await tx.seasonEnrollment.updateManyAndReturn({
          where: { seasonId: id, status: "ACTIVE", studentUserId: { in: passedIds } },
          data: { ...stamp, result: "PASSED", resultReason: null },
          select: { studentUserId: true },
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
        // Only those whose row was completed just now: someone who left it while End
        // waited for them didn't pass. Under the people's locks, since a seat write
        // elsewhere reads graduationYear under them.
        const graduated = check.graduatesOnPass
          ? await graduatePassed(
              tx,
              completed.map((c) => c.studentUserId),
              season.year,
            )
          : [];
        // Stamped now, not at the transaction's start: a token refreshed after that
        // start still carries the old grants and must fall before the cut-off.
        await markSessionsStale(tx, people, new Date());
        const row = await tx.season.findUniqueOrThrow({
          where: { id },
          select: { id: true, code: true, status: true },
        });
        return { season: row, graduated };
      },
      { timeout: 30_000 },
    );
    auditLog("season.end", user.userId, user.userId, { season: id });
    for (const graduate of ended.graduated) {
      auditLog("student.graduate", user.userId, graduate, { season: id });
    }
    return apiOk(res, { season: ended.season, graduated: ended.graduated.length });
  } catch (err) {
    if (err instanceof EndRefused) return apiError(res, err.code, err.message, err.status);
    throw err;
  }
}
