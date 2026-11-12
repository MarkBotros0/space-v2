import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, apiError, forbidden } from "../../lib/api-response";
import { auditLog } from "../../lib/audit";
import { parseId } from "../../lib/parse-id";
import { idParam } from "../../lib/http/params";
import { notFound } from "../../lib/http/not-found";
import { parseOr400 } from "../../lib/http/validate";
import { loadSeasonResults } from "../../lib/queries/season-results";
import { findLiveSeason } from "../../lib/queries/seasons";
import { liveSeason } from "../../lib/db/live";
import { correctSeasonResult } from "../../lib/seasons/results";
import { isSuper } from "../../lib/rbac";
import { requireUser } from "../../middleware/require-auth";
import { canCorrectSeasonResults } from "../../lib/permissions";
import { updateSeasonResultRequestSchema } from "../../../../../packages/shared/src/index";
import { isSeasonFinished } from "../../lib/seasons/status";

/**
 * Each finished student's pass result for a season, with the score End stored. A super, or anyone
 * with a SeasonAdmin row for the season (`canCorrectSeasonResults`).
 */
export async function getSeasonResults(req: Request, res: Response) {
  const user = requireUser(req);
  const id = idParam(res, req.params.id, "season");
  if (id === null) return;
  if (!(await canCorrectSeasonResults(user, id))) return forbidden(res);
  const season = await findLiveSeason(id, { id: true, code: true, title: true, year: true, graduatesOnPass: true });
  if (!season) return notFound(res, "Season");
  return apiOk(res, await loadSeasonResults(season));
}

/**
 * Correct one student's result after the season ended: a super, or the season's (former) admin
 * (`canCorrectSeasonResults`). The stored score stays; whether the result goes against it is
 * worked out again. Passed on a graduating season graduates them then; Did not pass never takes
 * alumni status away. The flag is frozen once the season has finished, so it can be read first.
 */
export async function updateSeasonResult(req: Request, res: Response) {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  const studentUserId = parseId(req.params.studentUserId);
  if (id === null || studentUserId === null) return apiError(res, "bad_request", "Invalid id.", 400);
  if (!(await canCorrectSeasonResults(user, id))) return forbidden(res);
  const body = parseOr400(updateSeasonResultRequestSchema, req.body, res, "Invalid result body.");
  if (body === null) return;

  const season = await findLiveSeason(id, { status: true, year: true, graduatesOnPass: true });
  if (!season) return notFound(res, "Season");
  if (!isSeasonFinished(season.status)) {
    return apiError(res, "not_finished", "Results can be corrected once the season has ended.", 409);
  }
  const enrolment = await db.seasonEnrollment.findUnique({
    where: { studentUserId_seasonId: { studentUserId, seasonId: id } },
    select: { status: true },
  });
  if (!enrolment) return notFound(res, "Enrolment");
  if (enrolment.status !== "COMPLETED") {
    return apiError(res, "no_result", "This student has no result for the season.", 409);
  }

  const { result } = body;
  const reason = result === "NOT_PASSED" ? body.reason?.trim() || null : null;
  const now = new Date();
  const graduated = await correctSeasonResult(
    id,
    studentUserId,
    { result, reason, at: now, byId: user.userId },
    season,
  );
  auditLog("season.result_correct", user.userId, studentUserId, { season: id });
  if (graduated) auditLog("student.graduate", user.userId, studentUserId, { season: id });
  return apiOk(res, { userId: studentUserId, result, reason, graduated });
}

/** ACTIVE seasons whose end date has passed: all for SUPER, the caller's own for an admin, none otherwise. */
export async function listOverdueSeasons(req: Request, res: Response) {
  const user = requireUser(req);
  const scope = isSuper(user) ? {} : user.role === "ADMIN" ? { id: { in: user.seasonAdminIds } } : null;
  if (scope === null) return apiOk(res, { seasons: [] });
  const rows = await db.season.findMany({
    where: { ...scope, status: "ACTIVE", ...liveSeason, endDate: { lt: new Date() } },
    orderBy: { endDate: "asc" },
    select: { id: true, code: true, title: true, endDate: true },
  });
  return apiOk(res, { seasons: rows.map((r) => ({ ...r, endDate: r.endDate.toISOString() })) });
}
