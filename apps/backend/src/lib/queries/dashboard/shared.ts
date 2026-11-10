// apps/backend/src/lib/queries/dashboard.ts
import { orgDayKey, orgWallTime } from "../../org-time";
import { type CurrentOrNextSession } from "../sessions";

/*
 * GET /api/v1/me/dashboard — spec 19 §7. Every figure here is a CALL to the
 * function that owns it; nothing is re-derived (ruling C4). The query count
 * is constant per variant: it does not grow with the cohort, the number of
 * groups, or the number of seasons (spec §7 "Query budget").
 */

/** Org wall-clock day and time ride beside the instant (C2/X13). */
export function toDashboardSession(s: CurrentOrNextSession) {
  return {
    id: s.id,
    title: s.title,
    startsAt: s.startsAt,
    dayKey: orgDayKey(s.startsAt),
    time: orgWallTime(s.startsAt),
    durationMinutes: s.durationMinutes,
    location: s.location,
    youtubeUrl: s.youtubeUrl,
    isInProgress: s.isInProgress,
  };
}

export const SEASON_SELECT = { id: true, code: true, title: true, status: true } as const;
