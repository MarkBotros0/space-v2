import type { SeasonStatus, SeasonWriteBody } from "@space/shared";

import type { SeatRefusal } from "../roles";
import { isSeasonFinished } from "./status";

/** The columns a SUPER's full-body write sets; the title is always re-derived (R10). */
export function seasonColumns(body: SeasonWriteBody) {
  return {
    code: body.code,
    title: `${body.program} ${body.year}`,
    program: body.program,
    // Undefined leaves the column alone on an update; create takes the default (null).
    requiredProgram: body.requiredProgram,
    graduatesOnPass: body.graduatesOnPass,
    isCommunityWide: body.isCommunityWide,
    year: body.year,
    description: body.description ?? null,
    startDate: new Date(body.startDate),
    endDate: new Date(body.endDate),
    status: body.status,
    absenceBudgetMinutes: body.absenceBudgetMinutes,
    absenceWeightMinutes: body.absenceWeightMinutes,
  };
}

/**
 * The only moves are an unchanged status and COMPLETED to or from ARCHIVED. A
 * season only starts through Start, which runs the checks, and only finishes
 * through End season, which completes its enrolments: any other way (ACTIVE back
 * to DRAFT, then COMPLETED) strands them ACTIVE in a finished season. A finished
 * season never reopens.
 */
export function statusChangeError(from: SeasonStatus, to: SeasonStatus): SeatRefusal | null {
  if (from === to) return null;
  if (from === "DRAFT") {
    if (to === "ACTIVE") return { code: "use_start_season", message: "Start the season from its Start button." };
    return { code: "invalid_status_change", message: "A draft season can only be started." };
  }
  if (from === "ACTIVE") {
    return { code: "use_end_season", message: "End the season instead of changing its status." };
  }
  if (isSeasonFinished(to)) return null;
  return { code: "season_finished", message: "A finished season cannot be reopened." };
}
