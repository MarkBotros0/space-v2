import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, apiError } from "../../lib/api-response";
import { auditLog } from "../../lib/audit";
import { parseId } from "../../lib/parse-id";
import { loadSeasonResults } from "../../lib/queries/season-results";
import { graduatePerson } from "../../lib/queries/students/writes";
import { isSuper } from "../../lib/rbac";
import { lockPeople } from "../../lib/roles";
import { requireUser } from "../../middleware/require-auth";
import { updateSeasonResultRequestSchema } from "../../../../../packages/shared/src/index";
import { forbidden } from "../respond";

/** Each finished student's pass result for a season. SUPER only. */
export async function getSeasonResults(req: Request, res: Response) {
  const user = requireUser(req);
  if (!isSuper(user)) return forbidden(res);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid season id.", 400);
  const season = await db.season.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!season) return apiError(res, "not_found", "Season not found.", 404);
  return apiOk(res, { results: await loadSeasonResults(id) });
}

/**
 * Correct one student's result after the season ended. SUPER only. Passed on a
 * graduating season graduates them then; Did not pass never takes alumni status
 * away. The flag is frozen once the season has finished, so it can be read first.
 */
export async function updateSeasonResult(req: Request, res: Response) {
  const user = requireUser(req);
  if (!isSuper(user)) return forbidden(res);
  const id = parseId(req.params.id);
  const studentUserId = parseId(req.params.studentUserId);
  if (id === null || studentUserId === null) return apiError(res, "bad_request", "Invalid id.", 400);
  const parsed = updateSeasonResultRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid result body.", 400);

  const season = await db.season.findFirst({
    where: { id, deletedAt: null },
    select: { status: true, year: true, graduatesOnPass: true },
  });
  if (!season) return apiError(res, "not_found", "Season not found.", 404);
  if (season.status !== "COMPLETED" && season.status !== "ARCHIVED") {
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

  const { result } = parsed.data;
  const reason = result === "NOT_PASSED" ? parsed.data.reason?.trim() || null : null;
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
