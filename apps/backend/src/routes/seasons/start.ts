import type { StartSeasonResponse } from "@space/shared";
import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, apiError } from "../../lib/api-response";
import { auditLog } from "../../lib/audit";
import { seasonPeopleIds } from "../../lib/auth/season-people";
import { markSessionsStale } from "../../lib/auth/session-validity";
import { parseId } from "../../lib/parse-id";
import { loadSeasonStartCheck } from "../../lib/queries/season-start";
import { lockPeople, lockSeasonStart, readSeatSeason, type SeatRefusal } from "../../lib/roles";
import { refusalStatus } from "../../lib/api-error";
import type { SeasonStartCheck } from "../../../../../packages/shared/src/index";
import { NOT_DRAFT, SEASON_NOT_FOUND } from "../../lib/enrolment/season-roster";
import { requireRole } from "../../middleware/require-auth";
import { canManageUsers } from "../../lib/rbac";

/** `"Mina is already leading a group in GBV 2026, and 2 more to clear."` */
function blockedMessage(check: SeasonStartCheck): string {
  const messages = [...check.seasonsInTheWay.map((s) => s.message), ...check.items.map((i) => i.message)];
  const first = messages[0]!;
  const rest = messages.length - 1;
  return rest === 0 ? first : `${first.replace(/\.$/, "")}, and ${rest} more to clear.`;
}

function refuse(res: Response, refusal: SeatRefusal) {
  return apiError(res, refusal.code, refusal.message, refusalStatus(refusal));
}

/** `GET /seasons/:id/start-check`: SUPER only. Who stops this draft from starting, for the checklist. */
export async function getSeasonStartCheck(req: Request, res: Response) {
  if (!requireRole(req, res, canManageUsers)) return;
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid season id.", 400);

  const season = await db.season.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, status: true, program: true, requiredProgram: true, isCommunityWide: true },
  });
  if (!season) return refuse(res, SEASON_NOT_FOUND);
  if (season.status !== "DRAFT") return refuse(res, NOT_DRAFT);
  return apiOk(res, await loadSeasonStartCheck(season));
}

/**
 * `POST /seasons/:id/start`: SUPER only. The one way a draft goes live. Takes the global start
 * lock, so every start is serialised and a community-wide season runs alone, then holds the
 * season, so no seat can be written around the check, then everyone in it, so
 * none of them takes a role elsewhere meanwhile. Because starts run one after another,
 * two never race over a shared person: the later one sees the earlier season as ACTIVE.
 * Everyone refreshes into their role: no one is signed out.
 */
export async function startSeason(req: Request, res: Response) {
  const user = requireRole(req, res, canManageUsers);
  if (!user) return;
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid season id.", 400);

  const outcome = await db.$transaction(
    async (tx) => {
      await lockSeasonStart(tx);
      const season = await readSeatSeason(tx, id, "update");
      if (!season) return SEASON_NOT_FOUND;
      if (season.status !== "DRAFT") return NOT_DRAFT;

      const people = await seasonPeopleIds(tx, id);
      await lockPeople(tx, people);
      const check = await loadSeasonStartCheck(season, tx);
      if (!check.ready) return { code: "start_blocked", message: blockedMessage(check) } satisfies SeatRefusal;

      const started = await tx.season.update({
        where: { id },
        data: { status: "ACTIVE", updatedById: user.userId },
        select: { id: true, code: true, status: true },
      });
      // Stamped now, not at the transaction's start: a token refreshed after that
      // start still carries the old grants and must fall before the cut-off.
      await markSessionsStale(tx, people, new Date());
      return { season: started } satisfies StartSeasonResponse;
    },
    { timeout: 30_000 },
  );
  if ("code" in outcome) return refuse(res, outcome);

  auditLog("season.start", user.userId, user.userId, { season: id });
  return apiOk(res, outcome);
}
