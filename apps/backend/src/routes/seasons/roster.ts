import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, apiError, forbidden } from "../../lib/api-response";
import { parseId } from "../../lib/parse-id";
import { listSeasonRoster } from "../../lib/queries/groups";
import {
  assignStudentsToGroups,
  GroupOutsideSeasonError,
  unassignStudentsFromGroups,
} from "../../lib/groups/membership";
import { isAdminOfSeason } from "../../lib/rbac";
import { requireUser } from "../../middleware/require-auth";
import { groupAssignmentsRequestSchema } from "../../../../../packages/shared/src/index";

/** Season-admin only (spec 05 §4 — v1's roster page required canEditSeason). */
async function requireLiveSeasonAdmin(req: Request, res: Response): Promise<number | null> {
  const user = requireUser(req);
  const seasonId = parseId(req.params.id);
  if (seasonId === null) {
    apiError(res, "bad_request", "Invalid season id.", 400);
    return null;
  }
  if (!isAdminOfSeason(user, seasonId)) {
    forbidden(res);
    return null;
  }
  const season = await db.season.findFirst({ where: { id: seasonId, deletedAt: null }, select: { id: true } });
  if (!season) {
    apiError(res, "not_found", "Season not found.", 404);
    return null;
  }
  return seasonId;
}

export async function getSeasonRoster(req: Request, res: Response) {
  const seasonId = await requireLiveSeasonAdmin(req, res);
  if (seasonId === null) return;
  return apiOk(res, { roster: await listSeasonRoster(seasonId) });
}

/**
 * Bulk group assignment (spec 05 §7, Plan 6 D-16.12). Non-null groupIds go
 * through assignStudentsToGroups — the same function Plan 17's importer
 * commits through — and nulls through unassignStudentsFromGroups, in ONE
 * transaction: a group outside the season refuses everything.
 */
export async function saveGroupAssignments(req: Request, res: Response) {
  const seasonId = await requireLiveSeasonAdmin(req, res);
  if (seasonId === null) return;

  const parsed = groupAssignmentsRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid assignments.", 400);

  const toAssign: { studentUserId: number; groupId: number }[] = [];
  const toUnassign: number[] = [];
  for (const a of parsed.data.assignments) {
    if (a.groupId === null) toUnassign.push(a.studentUserId);
    else toAssign.push({ studentUserId: a.studentUserId, groupId: a.groupId });
  }

  try {
    const result = await db.$transaction(
      async (tx) => {
        const assigned = await assignStudentsToGroups(tx, seasonId, toAssign);
        const unassigned = await unassignStudentsFromGroups(tx, seasonId, toUnassign);
        return {
          assigned: assigned.assigned,
          unassigned: unassigned.unassigned,
          skippedStudentIds: [...assigned.skippedStudentIds, ...unassigned.skippedStudentIds],
        };
      },
      // Four statements per student, 500 students max (spec 05 R56).
      { timeout: 30_000 },
    );
    return apiOk(res, result);
  } catch (err) {
    if (err instanceof GroupOutsideSeasonError) {
      return apiError(res, "group_outside_season", err.message, 400);
    }
    throw err;
  }
}
