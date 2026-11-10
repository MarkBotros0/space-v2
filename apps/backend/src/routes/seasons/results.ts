import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, apiError } from "../../lib/api-response";
import { auditLog } from "../../lib/audit";
import { parseId } from "../../lib/parse-id";
import { idParam } from "../../lib/http/params";
import { notFound } from "../../lib/http/not-found";
import { parseOr400 } from "../../lib/http/validate";
import { loadSeasonResults } from "../../lib/queries/season-results";
import { findLiveSeason } from "../../lib/queries/seasons";
import { graduatePerson } from "../../lib/students/graduation";
import { isSuper } from "../../lib/rbac";
import { lockPeople } from "../../lib/roles";
import { requireUser, requireRole } from "../../middleware/require-auth";
import { updateSeasonResultRequestSchema } from "../../../../../packages/shared/src/index";
import { isSeasonFinished } from "../../lib/seasons/status";

/** Each finished student's pass result for a season. SUPER only. */
export async function getSeasonResults(req: Request, res: Response) {
  const user = requireRole(req, res, isSuper);
  if (!user) return;
  const id = idParam(res, req.params.id, "season");
  if (id === null) return;
  const season = await findLiveSeason(id, { id: true });
  if (!season) return notFound(res, "Season");
  return apiOk(res, { results: await loadSeasonResults(id) });
}

/**
 * Correct one student's result after the season ended. SUPER only. Passed on a
 * graduating season graduates them then; Did not pass never takes alumni status
 * away. The flag is frozen once the season has finished, so it can be read first.
 */
export async function updateSeasonResult(req: Request, res: Response) {
  const user = requireRole(req, res, isSuper);
  if (!user) return;
  const id = parseId(req.params.id);
  const studentUserId = parseId(req.params.studentUserId);
  if (id === null || studentUserId === null) return apiError(res, "bad_request", "Invalid id.", 400);
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
  if (!enrolment) return apiError(res, "not_found", "Enrolment not found.", 404);
  if (enrolment.status !== "COMPLETED") {
    return apiError(res, "no_result", "This student has no result for the season.", 409);
  }

  const { result } = body;
  const reason = result === "NOT_PASSED" ? body.reason?.trim() || null : null;
  const now = new Date();
  const graduated = await db.$transaction(async (tx) => {
    await lockPeople(tx, [studentUserId]);
    await tx.seasonEnrollment.update({
      where: { studentUserId_seasonId: { studentUserId, seasonId: id } },
      data: { result, resultReason: reason, resultSetAt: now },
    });
    if (result !== "PASSED" || !season.graduatesOnPass) return false;
    const outcome = await graduatePerson(tx, studentUserId, season.year);
    return typeof outcome !== "string";
  });
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
    where: { ...scope, status: "ACTIVE", deletedAt: null, endDate: { lt: new Date() } },
    orderBy: { endDate: "asc" },
    select: { id: true, code: true, title: true, endDate: true },
  });
  return apiOk(res, { seasons: rows.map((r) => ({ ...r, endDate: r.endDate.toISOString() })) });
}
