import { Router } from "express";

import { apiOk, apiError } from "../../lib/api-response";
import { parseId } from "../../lib/parse-id";
import { loadMyAttendance, loadMySeason, loadSeasonHistory, loadSeasonRecord } from "../../lib/queries/me";
import { requireAuth, requireUser } from "../../middleware/require-auth";
import { notFound } from "../../lib/http/not-found";

/** The student's own season reads, mounted under /api/v1/me. */
export const meSeasonReadsRouter = Router();

const STUDENTS_ONLY = "This is only available to students and alumni.";

/*
 * Student self-service reads (Plan 11). requireAuth per route (ruling X5).
 * Role STUDENT covers alumni too (role stays STUDENT, graduationYear set).
 * Staff get 403, not an empty shape: a staff client calling these is a bug.
 */
meSeasonReadsRouter.get("/season-history", requireAuth, async (req, res) => {
  const user = requireUser(req);
  if (user.role !== "STUDENT") return apiError(res, "forbidden", STUDENTS_ONLY, 403);
  return apiOk(res, { seasons: await loadSeasonHistory(user) });
});

meSeasonReadsRouter.get("/seasons/:seasonId", requireAuth, async (req, res) => {
  const user = requireUser(req);
  if (user.role !== "STUDENT") return apiError(res, "forbidden", STUDENTS_ONLY, 403);
  const seasonId = parseId(req.params.seasonId);
  const record = seasonId === null ? null : await loadSeasonRecord(user, seasonId);
  if (!record) return notFound(res, "Season");
  return apiOk(res, { record });
});

meSeasonReadsRouter.get("/season", requireAuth, async (req, res) => {
  const user = requireUser(req);
  if (user.role !== "STUDENT") return apiError(res, "forbidden", STUDENTS_ONLY, 403);
  return apiOk(res, { season: await loadMySeason(user) });
});

meSeasonReadsRouter.get("/attendance", requireAuth, async (req, res) => {
  const user = requireUser(req);
  if (user.role !== "STUDENT") return apiError(res, "forbidden", STUDENTS_ONLY, 403);
  return apiOk(res, await loadMyAttendance(user));
});
