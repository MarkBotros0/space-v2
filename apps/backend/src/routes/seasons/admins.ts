import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, apiError } from "../../lib/api-response";
import { auditLog } from "../../lib/audit";
import { revokeAllRefreshTokensForUser } from "../../lib/auth/tokens";
import { parseId } from "../../lib/parse-id";
import { isUniqueViolation } from "../../lib/prisma-errors";
// Relative, not "@space/shared" — same emit trap routes/auth.ts documents.
import { addSeasonAdminRequestSchema } from "../../../../../packages/shared/src/index";
import { requireSuper } from "../users/super-only";

/**
 * SUPER-only management of a season's SeasonAdmin rows (owner decision): v1
 * had no write path for them at all, so a new season could not get an admin
 * without a database edit.
 *
 * Every write that changes a row revokes the user's refresh tokens. The grant
 * lives in the `seasonAdminIds` claim; revoking forces the next refresh to
 * fail, and the following login re-derives the claim from the table — the
 * same move a role change makes (routes/users/accounts.ts). The access token
 * already issued keeps its old claim for at most its 900 s TTL.
 */

async function liveSeason(id: number): Promise<boolean> {
  const season = await db.season.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  return season !== null;
}

const seasonNotFound = (res: Response) => apiError(res, "not_found", "Season not found.", 404);

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
  if (!requireSuper(req, res)) return;
  const seasonId = parseId(req.params.id);
  if (seasonId === null) return apiError(res, "bad_request", "Invalid season id.", 400);
  if (!(await liveSeason(seasonId))) return seasonNotFound(res);
  return apiOk(res, await loadSeasonAdmins(seasonId));
}

export async function addSeasonAdmin(req: Request, res: Response) {
  const actor = requireSuper(req, res);
  if (!actor) return;
  const seasonId = parseId(req.params.id);
  if (seasonId === null) return apiError(res, "bad_request", "Invalid season id.", 400);

  const parsed = addSeasonAdminRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid body: userId is required.", 400);
  const { userId } = parsed.data;

  if (!(await liveSeason(seasonId))) return seasonNotFound(res);

  let outcome: "created" | "exists" | "not_found" | "user_inactive" | "not_admin";
  try {
    outcome = await db.$transaction(async (tx) => {
      // Read inside the transaction with the write, so the role checked is
      // the role the row is written against.
      const target = await tx.user.findUnique({
        where: { id: userId },
        select: { role: true, deletedAt: true },
      });
      if (!target) return "not_found" as const;
      if (target.deletedAt !== null) return "user_inactive" as const;
      // A SeasonAdmin row on any other role is a grant without identity:
      // isAdminOfSeason pairs the claim with role ADMIN (ruling C7), so the
      // row would do nothing but confuse the user detail screen.
      if (target.role !== "ADMIN") return "not_admin" as const;

      const existing = await tx.seasonAdmin.findUnique({
        where: { seasonId_userId: { seasonId, userId } },
        select: { userId: true },
      });
      if (existing) return "exists" as const;

      await tx.seasonAdmin.create({ data: { seasonId, userId, assignedById: actor.userId } });
      await revokeAllRefreshTokensForUser(tx, userId);
      return "created" as const;
    });
  } catch (err) {
    // The race the pre-read can lose: someone else just added the same row.
    if (!isUniqueViolation(err)) throw err;
    outcome = "exists";
  }

  if (outcome === "not_found") return apiError(res, "not_found", "User not found.", 404);
  if (outcome === "user_inactive") {
    return apiError(res, "user_inactive", "That account is deactivated.", 400);
  }
  if (outcome === "not_admin") {
    return apiError(res, "not_an_admin", "Only a user with the ADMIN role can administer a season.", 400);
  }
  if (outcome === "created") auditLog("season.admin_add", actor.userId, userId, { season: seasonId });
  // Idempotent: adding an existing admin is a 200 with the unchanged list.
  return apiOk(res, await loadSeasonAdmins(seasonId), outcome === "created" ? 201 : 200);
}

export async function removeSeasonAdmin(req: Request, res: Response) {
  const actor = requireSuper(req, res);
  if (!actor) return;
  const seasonId = parseId(req.params.id);
  if (seasonId === null) return apiError(res, "bad_request", "Invalid season id.", 400);
  const userId = parseId(req.params.userId);
  if (userId === null) return apiError(res, "bad_request", "Invalid user id.", 400);

  if (!(await liveSeason(seasonId))) return seasonNotFound(res);

  // No role or activation check: removing a stale row (a deactivated admin's,
  // say) is exactly the clean-up this route exists for.
  const removed = await db.$transaction(async (tx) => {
    const { count } = await tx.seasonAdmin.deleteMany({ where: { seasonId, userId } });
    if (count > 0) await revokeAllRefreshTokensForUser(tx, userId);
    return count > 0;
  });

  if (removed) auditLog("season.admin_remove", actor.userId, userId, { season: seasonId });
  // Idempotent: removing someone who is not an admin answers the same list.
  return apiOk(res, await loadSeasonAdmins(seasonId));
}
