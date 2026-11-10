import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk } from "../../lib/api-response";
import { auditLog } from "../../lib/audit";
import { findLiveSeason } from "../../lib/queries/seasons";
import { notFound } from "../../lib/http/not-found";
import { seatSeasonAdmin, unseatSeasonAdmin } from "../../lib/seasons/admins";
// Relative, not "@space/shared" — same emit trap routes/auth.ts documents.
import { addSeasonAdminRequestSchema } from "../../../../../packages/shared/src/index";
import { requireRole } from "../../middleware/require-auth";
import { canManageUsers } from "../../lib/rbac";
import { idParam } from "../../lib/http/params";
import { parseOr400 } from "../../lib/http/validate";

/**
 * SUPER-only management of a season's SeasonAdmin rows (owner decision): v1
 * had no write path for them at all, so a new season could not get an admin
 * without a database edit.
 *
 * Who can take the seat is `lib/roles`: alumni only, and no other active role.
 * A change marks the person's sessions stale, so their next refresh re-reads
 * `seasonAdminIds` without signing them out.
 */

/** The list as it stands — what all three routes answer with. */
async function loadSeasonAdmins(seasonId: number) {
  const rows = await db.seasonAdmin.findMany({
    where: { seasonId },
    select: {
      assignedAt: true,
      user: { select: { id: true, name: true, email: true } },
      assignedBy: { select: { name: true } },
    },
    orderBy: [{ user: { name: "asc" } }, { userId: "asc" }],
  });
  return {
    admins: rows.map((r) => ({
      userId: r.user.id,
      name: r.user.name,
      email: r.user.email,
      assignedAt: r.assignedAt.toISOString(),
      assignedByName: r.assignedBy?.name ?? null,
    })),
  };
}

export async function listSeasonAdmins(req: Request, res: Response) {
  if (!requireRole(req, res, canManageUsers)) return;
  const seasonId = idParam(res, req.params.id, "season");
  if (seasonId === null) return;
  if (!(await findLiveSeason(seasonId, { id: true }))) return notFound(res, "Season");
  return apiOk(res, await loadSeasonAdmins(seasonId));
}

export async function addSeasonAdmin(req: Request, res: Response) {
  const actor = requireRole(req, res, canManageUsers);
  if (!actor) return;
  const seasonId = idParam(res, req.params.id, "season");
  if (seasonId === null) return;

  const parsed = parseOr400(addSeasonAdminRequestSchema, req.body, res, "Invalid body: userId is required.");
  if (parsed === null) return;
  const { userId } = parsed;

  const outcome = await seatSeasonAdmin(seasonId, userId, actor.userId);
  if (outcome === "created") auditLog("season.admin_add", actor.userId, userId, { season: seasonId });
  // Idempotent: adding an existing admin is a 200 with the unchanged list.
  return apiOk(res, await loadSeasonAdmins(seasonId), outcome === "created" ? 201 : 200);
}

export async function removeSeasonAdmin(req: Request, res: Response) {
  const actor = requireRole(req, res, canManageUsers);
  if (!actor) return;
  const seasonId = idParam(res, req.params.id, "season");
  if (seasonId === null) return;
  const userId = idParam(res, req.params.userId, "user");
  if (userId === null) return;

  if (!(await findLiveSeason(seasonId, { id: true }))) return notFound(res, "Season");

  const removed = await unseatSeasonAdmin(seasonId, userId);

  if (removed) auditLog("season.admin_remove", actor.userId, userId, { season: seasonId });
  // Idempotent: removing someone who is not an admin answers the same list.
  return apiOk(res, await loadSeasonAdmins(seasonId));
}
