// apps/backend/src/lib/queries/dashboard.ts
import type { SessionUser } from "../../auth/tokens";
import { summarizeStudentAssignments } from "../../dashboard-figures";
import { orgDayKey } from "../../org-time";
import { listAssignmentStatesForStudent } from "../assignments";
import { loadCurrentOrNextSession, loadSeasonProgress } from "../sessions";
import { DUE_SOON_LIMIT } from "../../../../../../packages/shared/src/index";

/*
 * GET /api/v1/me/dashboard — spec 19 §7. Every figure here is a CALL to the
 * function that owns it; nothing is re-derived (ruling C4). The query count
 * is constant per variant: it does not grow with the cohort, the number of
 * groups, or the number of seasons (spec §7 "Query budget").
 */
import { SEASON_SELECT, toDashboardSession } from "./shared";
import { findLiveSeason } from "../seasons";

/**
 * The student's own Home. Season from the TOKEN's activeSeasonId — the same
 * value /me exposes — for both the title and the figures (D22; v1 mixed the
 * token's id with the database's title, R62). Roughly six queries.
 */
export async function loadStudentDashboard(user: SessionUser, now: Date) {
  const notEnrolled = {
    variant: "STUDENT" as const,
    todayOrgDay: orgDayKey(now),
    season: null,
    progress: null,
    nextSession: null,
    assignments: null,
  };
  const seasonId = user.activeSeasonId;
  if (seasonId === null) return notEnrolled;

  const season = await findLiveSeason(seasonId, SEASON_SELECT);
  if (!season) return notEnrolled;

  const [progress, next, rows] = await Promise.all([
    loadSeasonProgress(seasonId, now),
    loadCurrentOrNextSession(seasonId, now),
    listAssignmentStatesForStudent(user.userId, seasonId, now),
  ]);

  return {
    variant: "STUDENT" as const,
    todayOrgDay: orgDayKey(now),
    season,
    progress,
    nextSession: next ? toDashboardSession(next) : null,
    assignments: summarizeStudentAssignments(rows, DUE_SOON_LIMIT),
  };
}
