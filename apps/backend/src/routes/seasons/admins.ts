import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, apiError } from "../../lib/api-response";
import { auditLog } from "../../lib/audit";
import { markSessionsStale } from "../../lib/auth/session-validity";
import { parseId } from "../../lib/parse-id";
import { isUniqueViolation } from "../../lib/prisma-errors";
import { lockPeople, readSeatSeason, refuseNewSeats, refusalStatus, type SeatRefusal } from "../../lib/roles";
// Relative, not "@space/shared" — same emit trap routes/auth.ts documents.
import { addSeasonAdminRequestSchema } from "../../../../../packages/shared/src/index";
import { requireSuper } from "../users/super-only";

/**
 * SUPER-only management of a season's SeasonAdmin rows (owner decision): v1
 * had no write path for them at all, so a new season could not get an admin
 * without a database edit.
 *
 * Who can take the seat is `lib/roles`: alumni only, and no other active role.
 * A change marks the person's sessions stale, so their next refresh re-reads
 * `seasonAdminIds` without signing them out.
 */

function liveSeason(id: number) {
  return db.season.findFirst({ where: { id, deletedAt: null }, select: { id: true, status: true } });
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

  let outcome: "created" | "exists" | SeatRefusal;
  try {
    outcome = await db.$transaction(async (tx) => {
      const season = await readSeatSeason(tx, seasonId);
      if (!season) return { code: "not_found", message: "Season not found." };
      await lockPeople(tx, [userId]);
      const existing = await tx.seasonAdmin.findUnique({
        where: { seasonId_userId: { seasonId, userId } },
        select: { userId: true },
      });
      if (existing) return "exists" as const;

      const refusal = await refuseNewSeats(tx, [userId], { kind: "admin", season });
      if (refusal) return refusal;

      await tx.seasonAdmin.create({ data: { seasonId, userId, assignedById: actor.userId } });
      await markSessionsStale(tx, [userId]);
      return "created" as const;
    });
  } catch (err) {
    // The race the pre-read can lose: someone else just added the same row.
    if (!isUniqueViolation(err)) throw err;
    outcome = "exists";
  }

  if (typeof outcome !== "string") {
    return apiError(res, outcome.code, outcome.message, refusalStatus(outcome));
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
    if (count > 0) await markSessionsStale(tx, [userId]);
    return count > 0;
  });

  if (removed) auditLog("season.admin_remove", actor.userId, userId, { season: seasonId });
  // Idempotent: removing someone who is not an admin answers the same list.
  return apiOk(res, await loadSeasonAdmins(seasonId));
}
