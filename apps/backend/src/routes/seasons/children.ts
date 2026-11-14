import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, apiError, forbidden } from "../../lib/api-response";
import { bodyErrorMessage, createAssignment } from "../../lib/assignments/writes";
import { findLiveSeason } from "../../lib/queries/seasons";
import { canAccessSeason, canManageAssignment, submissionQueueScopeFor } from "../../lib/permissions";
import {
  listAssignmentsForSeason,
  listAssignmentsForStudent,
  loadAssignmentDetail,
} from "../../lib/queries/assignments";
import { listGroupsForSeason } from "../../lib/queries/groups";
import { validateGroupWrite } from "../../lib/groups/membership";
import { createGroup } from "../../lib/groups/writes";
import { listSessionsForSeason } from "../../lib/queries/sessions";
import { isAdminOfSeason } from "../../lib/rbac";
import { requireUser } from "../../middleware/require-auth";
import { createAssignmentRequestSchema, groupWriteRequestSchema } from "../../../../../packages/shared/src/index";
import { idParam } from "../../lib/http/params";
import { parseOr400 } from "../../lib/http/validate";
import { notFound } from "../../lib/http/not-found";

/*
 * A season's child collections: its groups, sessions and assignments, read and
 * created through the season they belong to.
 */

export async function listSeasonGroups(req: Request, res: Response) {
  const user = requireUser(req);
  const seasonId = idParam(res, req.params.id, "season");
  if (seasonId === null) return;

  if (!(await canAccessSeason(user, seasonId))) return forbidden(res);

  // The scope lives in the query, so a group the caller may not see is never
  // read at all. A leader now sees only the groups they lead: v1 handed them
  // every group in the season, which is a roster of other people's students
  // with a headcount attached.
  const groups = await listGroupsForSeason(user, seasonId);
  return apiOk(res, { groups: groups ?? [] });
}

export async function createSeasonGroup(req: Request, res: Response) {
  const user = requireUser(req);
  const seasonId = idParam(res, req.params.id, "season");
  if (seasonId === null) return;

  if (!isAdminOfSeason(user, seasonId)) return forbidden(res);

  const season = await db.season.findUnique({ where: { id: seasonId }, select: { id: true } });
  if (!season) return notFound(res, "Season");

  const body = parseOr400(groupWriteRequestSchema, req.body, res, "Invalid group body.");
  if (body === null) return;

  const refusal = await validateGroupWrite(seasonId, body);
  if (refusal) return apiError(res, refusal.code, refusal.message, 409);

  const id = await createGroup(seasonId, body);
  return apiOk(res, { id }, 201);
}

export async function listSeasonSessions(req: Request, res: Response) {
  const user = requireUser(req);
  const seasonId = idParam(res, req.params.id, "season");
  if (seasonId === null) return;

  if (!(await canAccessSeason(user, seasonId))) return forbidden(res);

  const sessions = await listSessionsForSeason(seasonId, {
    includeCheckInToken: user.role !== "STUDENT",
  });
  return apiOk(res, { sessions });
}

export async function listSeasonAssignments(req: Request, res: Response) {
  const user = requireUser(req);
  const seasonId = idParam(res, req.params.id, "season");
  if (seasonId === null) return;

  if (!(await canAccessSeason(user, seasonId))) return forbidden(res);

  // Students get a different row shape — their own status per assignment,
  // rather than the season-wide submission/expected counts staff see.
  const assignments =
    user.role === "STUDENT"
      ? await listAssignmentsForStudent(user.userId, seasonId)
      : await listAssignmentsForSeason(seasonId, await submissionQueueScopeFor(user));

  return apiOk(res, { assignments });
}

export async function createSeasonAssignment(req: Request, res: Response) {
  const user = requireUser(req);
  const seasonId = idParam(res, req.params.id, "season");
  if (seasonId === null) return;

  // v1 canCreateAssignment = isAdminOfSeason (SUPER passes) — permissions.ts:273-278.
  if (!canManageAssignment(user, seasonId)) return forbidden(res);

  const season = await findLiveSeason(seasonId, { id: true });
  if (!season) return notFound(res, "Season");

  const parsed = createAssignmentRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, "bad_request", bodyErrorMessage(parsed.error, "Invalid assignment body."), 400);
  }

  // The row, its parts and the season's notifications (after the commit, R65).
  const { id } = await createAssignment(seasonId, parsed.data, user.userId);
  return apiOk(res, await loadAssignmentDetail(id, { studentUserId: null, canManage: true, readOnly: false }), 201);
}
