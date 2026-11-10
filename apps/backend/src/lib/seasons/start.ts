import type { SeasonStartCheck, StartSeasonResponse } from "@space/shared";

import { db } from "../../db/client";
import { ApiError, toApiError } from "../api-error";
import { seasonPeopleIds } from "../auth/season-people";
import { markSessionsStale } from "../auth/session-validity";
import { NOT_DRAFT, SEASON_NOT_FOUND } from "../enrolment/season-roster";
import { loadSeasonStartCheck } from "../queries/season-start";
import { lockPeople, lockSeasonStart, readSeatSeason } from "../roles";

/** `"Mina is already leading a group in GBV 2026, and 2 more to clear."` */
export function blockedMessage(check: SeasonStartCheck): string {
  const messages = [...check.seasonsInTheWay.map((s) => s.message), ...check.items.map((i) => i.message)];
  const first = messages[0]!;
  const rest = messages.length - 1;
  return rest === 0 ? first : `${first.replace(/\.$/, "")}, and ${rest} more to clear.`;
}

/**
 * `POST /seasons/:id/start`'s transaction, the one way a draft goes live. Takes
 * the global start lock, so every start is serialised and a community-wide
 * season runs alone, then holds the season, so no seat can be written around
 * the check, then everyone in it, so none of them takes a role elsewhere
 * meanwhile. Every refusal is an ApiError thrown before the one write.
 */
export async function startSeasonNow(id: number, actorId: number): Promise<StartSeasonResponse> {
  return db.$transaction(
    async (tx) => {
      await lockSeasonStart(tx);
      const season = await readSeatSeason(tx, id, "update");
      if (!season) throw toApiError(SEASON_NOT_FOUND);
      if (season.status !== "DRAFT") throw toApiError(NOT_DRAFT);

      const people = await seasonPeopleIds(tx, id);
      await lockPeople(tx, people);
      const check = await loadSeasonStartCheck(season, tx);
      if (!check.ready) throw new ApiError("start_blocked", blockedMessage(check), 409);

      const started = await tx.season.update({
        where: { id },
        data: { status: "ACTIVE", updatedById: actorId },
        select: { id: true, code: true, status: true },
      });
      // Stamped now, not at the transaction's start: a token refreshed after that
      // start still carries the old grants and must fall before the cut-off.
      await markSessionsStale(tx, people, new Date());
      return { season: started };
    },
    { timeout: 30_000 },
  );
}
