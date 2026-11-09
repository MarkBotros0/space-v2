import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, apiError } from "../../lib/api-response";
import {
  assignmentColumns,
  bodyErrorMessage,
  notifyAssignmentCreated,
  targetedStudentIds,
  validateAssignmentRefs,
} from "../../lib/assignment-writes";
import { parseId } from "../../lib/parse-id";
import { canAccessSeason, canManageAssignment } from "../../lib/permissions";
import {
  assignmentDetailPayload,
  listAssignmentsForSeason,
  listAssignmentsForStudent,
  loadAssignmentById,
} from "../../lib/queries/assignments";
import {
  applyLeaderChange,
  listGroupsForSeason,
  planLeaderChange,
  setGroupStudents,
  validateGroupWrite,
} from "../../lib/queries/groups";
import { listSessionsForSeason } from "../../lib/queries/sessions";
import { isAdminOfSeason } from "../../lib/rbac";
import { refusalStatus } from "../../lib/api-error";
import { requireUser } from "../../middleware/require-auth";
import { createAssignmentRequestSchema, groupWriteRequestSchema } from "../../../../../packages/shared/src/index";
import { forbidden } from "../respond";

/*
 * A season's child collections: its groups, sessions and assignments, read and
 * created through the season they belong to.
 */

export async function listSeasonGroups(req: Request, res: Response) {
  const user = requireUser(req);
  const seasonId = parseId(req.params.id);
  if (seasonId === null) return apiError(res, "bad_request", "Invalid season id.", 400);

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
  const seasonId = parseId(req.params.id);
  if (seasonId === null) return apiError(res, "bad_request", "Invalid season id.", 400);

  if (!isAdminOfSeason(user, seasonId)) return forbidden(res);

  const season = await db.season.findUnique({ where: { id: seasonId }, select: { id: true } });
  if (!season) return apiError(res, "not_found", "Season not found.", 404);

  const parsed = groupWriteRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid group body.", 400);

  const refusal = await validateGroupWrite(seasonId, parsed.data);
  if (refusal) return apiError(res, refusal.code, refusal.message, 409);

  const outcome = await db.$transaction(async (tx) => {
    const plan = await planLeaderChange(tx, seasonId, null, parsed.data.leaderIds);
    if (plan.refusal) return { refusal: plan.refusal, id: null };

    const created = await tx.group.create({
      data: {
        seasonId,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
      },
      select: { id: true },
    });
    await applyLeaderChange(tx, created.id, plan.change);
    await setGroupStudents(tx, seasonId, created.id, parsed.data.studentIds);
    return { refusal: null, id: created.id };
  });

  if (outcome.refusal) {
    return apiError(res, outcome.refusal.code, outcome.refusal.message, refusalStatus(outcome.refusal));
  }
  return apiOk(res, { id: outcome.id }, 201);
}

export async function listSeasonSessions(req: Request, res: Response) {
  const user = requireUser(req);
  const seasonId = parseId(req.params.id);
  if (seasonId === null) return apiError(res, "bad_request", "Invalid season id.", 400);

  if (!(await canAccessSeason(user, seasonId))) return forbidden(res);

  const sessions = await listSessionsForSeason(seasonId, {
    includeCheckInToken: user.role !== "STUDENT",
  });
  return apiOk(res, { sessions });
}

export async function listSeasonAssignments(req: Request, res: Response) {
  const user = requireUser(req);
  const seasonId = parseId(req.params.id);
  if (seasonId === null) return apiError(res, "bad_request", "Invalid season id.", 400);

  if (!(await canAccessSeason(user, seasonId))) return forbidden(res);

  // Students get a different row shape — their own status per assignment,
  // rather than the season-wide submission/expected counts staff see.
  const assignments =
    user.role === "STUDENT"
      ? await listAssignmentsForStudent(user.userId, seasonId)
      : await listAssignmentsForSeason(seasonId);

  return apiOk(res, { assignments });
}

export async function createSeasonAssignment(req: Request, res: Response) {
  const user = requireUser(req);
  const seasonId = parseId(req.params.id);
  if (seasonId === null) return apiError(res, "bad_request", "Invalid season id.", 400);

  // v1 canCreateAssignment = isAdminOfSeason (SUPER passes) — permissions.ts:273-278.
  if (!canManageAssignment(user, seasonId)) return forbidden(res);

  const season = await db.season.findFirst({
    where: { id: seasonId, deletedAt: null },
    select: { id: true },
  });
  if (!season) return apiError(res, "not_found", "Season not found.", 404);

  const parsed = createAssignmentRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, "bad_request", bodyErrorMessage(parsed.error, "Invalid assignment body."), 400);
  }
  const body = parsed.data;

  const refusal = await validateAssignmentRefs(seasonId, body);
  if (refusal) return apiError(res, refusal.code, refusal.message, 400);

  const columns = assignmentColumns(body);
  // R84: the row and its targets commit together.
  const created = await db.$transaction(async (tx) => {
    const assignment = await tx.assignment.create({
      data: { seasonId, ...columns, createdById: user.userId, updatedById: user.userId },
      select: { id: true },
    });
    if (!body.isAllGroups) {
      await tx.assignmentTarget.createMany({
        data: body.groupIds.map((groupId) => ({ assignmentId: assignment.id, groupId })),
      });
    }
    return assignment;
  });

  // R65: fan-out after the commit, never inside it.
  await notifyAssignmentCreated(
    { id: created.id, title: body.title, dueAt: columns.dueAt },
    await targetedStudentIds(seasonId, body.isAllGroups, body.groupIds),
  );

  const detail = await loadAssignmentById(created.id);
  // Unreachable — the row was written above — but the loader is nullable.
  if (!detail) return apiError(res, "not_found", "Assignment not found.", 404);
  return apiOk(res, assignmentDetailPayload(detail, { isStudent: false, canManage: true, mySubmission: null }), 201);
}
