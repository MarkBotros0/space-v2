import {
  DEFAULT_PASS_CRITERIA,
  type PassCriteria,
  type SeasonAvailability,
} from "../../../../../packages/shared/src/index";
import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import { ApiError } from "../api-error";
import { liveSeason } from "../db/live";
import { lockSeason } from "../roles/active-role";
import { loadSeasonAvailability } from "./numbers";

/*
 * A season's pass criteria (season passing): three whole-percentage weights adding up to 100 and a
 * pass mark, on the Season row. Set by the season's admin or a super while the season is ACTIVE (and
 * by End). Before that the season shows the criteria last saved on any season, else 40/30/30 and 60.
 */

const CRITERIA_SELECT = {
  passWeightAttendance: true,
  passWeightAssignments: true,
  passWeightQuizzes: true,
  passMark: true,
} satisfies Prisma.SeasonSelect;

type CriteriaRow = Prisma.SeasonGetPayload<{ select: typeof CRITERIA_SELECT }>;

function toCriteria(row: CriteriaRow | null): PassCriteria | null {
  // The CHECK keeps the four set together, so one null means none is set.
  if (!row || row.passMark === null) return null;
  return {
    weights: {
      attendance: row.passWeightAttendance ?? 0,
      assignments: row.passWeightAssignments ?? 0,
      quizzes: row.passWeightQuizzes ?? 0,
    },
    passMark: row.passMark,
  };
}

/** The season's own criteria (saved, or stored by End); null when it has none. */
export async function loadOwnPassCriteria(
  seasonId: number,
  client: Prisma.TransactionClient = db,
): Promise<PassCriteria | null> {
  return toCriteria(await client.season.findUnique({ where: { id: seasonId }, select: CRITERIA_SELECT }));
}

/** The season's own criteria, or the default (`isDefault`): the newest saved on any live season, else 40/30/30 and 60. */
export async function loadPassCriteria(
  seasonId: number,
  client: Prisma.TransactionClient = db,
): Promise<{ criteria: PassCriteria; isDefault: boolean }> {
  const own = await loadOwnPassCriteria(seasonId, client);
  if (own) return { criteria: own, isDefault: false };
  const last = await client.season.findFirst({
    where: { ...liveSeason, passCriteriaSetAt: { not: null } },
    orderBy: [{ passCriteriaSetAt: "desc" }, { id: "desc" }],
    select: CRITERIA_SELECT,
  });
  return { criteria: toCriteria(last) ?? DEFAULT_PASS_CRITERIA, isDefault: true };
}

const NUMBER_NAMES = { attendance: "Attendance", assignments: "Assignments", quizzes: "Quizzes" } as const;

/** Refuses a weight above 0 on a number the season has nothing for (400 `weight_on_empty`). */
export function checkWeightsAvailable(criteria: PassCriteria, available: SeasonAvailability): void {
  for (const key of ["attendance", "assignments", "quizzes"] as const) {
    if (criteria.weights[key] > 0 && !available[key]) {
      throw new ApiError(
        "weight_on_empty",
        `${NUMBER_NAMES[key]} has nothing to count this season, so its weight must be 0.`,
        400,
      );
    }
  }
}

/** The Season columns that hold `criteria`, saved at `now`: the save's write and End's. */
export function passCriteriaData(criteria: PassCriteria, now: Date) {
  return {
    passWeightAttendance: criteria.weights.attendance,
    passWeightAssignments: criteria.weights.assignments,
    passWeightQuizzes: criteria.weights.quizzes,
    passMark: criteria.passMark,
    passCriteriaSetAt: now,
  } satisfies Prisma.SeasonUpdateInput;
}

/**
 * Save the season's criteria. The Season row is locked FOR NO KEY UPDATE, the lock its own write
 * takes anyway: holding it FOR SHARE first would let two saves at once deadlock upgrading it. It
 * still waits behind a staff mark's FOR SHARE and serialises with End.
 */
export async function savePassCriteria(seasonId: number, criteria: PassCriteria, now: Date): Promise<PassCriteria> {
  return db.$transaction(async (tx) => {
    await lockSeason(tx, seasonId, "update");
    const season = await tx.season.findFirst({ where: { id: seasonId, ...liveSeason }, select: { status: true } });
    if (!season) throw new ApiError("not_found", "Season not found.", 404);
    if (season.status !== "ACTIVE") {
      throw new ApiError("season_not_active", "Pass criteria can only be set on an active season.", 409);
    }
    checkWeightsAvailable(criteria, await loadSeasonAvailability(seasonId, tx));
    await tx.season.update({ where: { id: seasonId }, data: passCriteriaData(criteria, now) });
    return criteria;
  });
}
