import type { SeasonStatus } from "@space/shared";
import { standingFor, type Standing, type StandingHistoryRow } from "../../../../../packages/shared/src/index";
import type { Prisma } from "../../generated/prisma/client";
import { isSeasonFinished } from "../seasons/status";

/** One finished or dropped enrolment, with what the picker needs to show it. */
export type HistoryEntry = StandingHistoryRow & {
  seasonId: number;
  seasonStatus: Exclude<SeasonStatus, "DRAFT">;
  enrollmentId: number;
  enrolledAt: Date;
  /** When it ended, finished or dropped: the order of "last season". */
  endedAt: Date;
};

/**
 * Each person's completed and dropped enrolments in seasons that have started,
 * other than `exceptSeasonId`. Finished means COMPLETED in a COMPLETED or
 * ARCHIVED season; a drop is kept for "last season" but never counts as finished.
 * `finishedAt` is the enrolment's completion, else its season's end date.
 */
export async function loadHistory(
  tx: Prisma.TransactionClient,
  userIds: number[],
  exceptSeasonId: number,
): Promise<Map<number, HistoryEntry[]>> {
  const byUser = new Map<number, HistoryEntry[]>();
  if (userIds.length === 0) return byUser;
  const rows = await tx.seasonEnrollment.findMany({
    where: {
      studentUserId: { in: userIds },
      status: { in: ["COMPLETED", "WITHDRAWN"] },
      seasonId: { not: exceptSeasonId },
      season: { deletedAt: null, status: { in: ["ACTIVE", "COMPLETED", "ARCHIVED"] } },
    },
    select: {
      id: true,
      studentUserId: true,
      seasonId: true,
      status: true,
      result: true,
      enrolledAt: true,
      completedAt: true,
      droppedAt: true,
      season: { select: { title: true, program: true, status: true, endDate: true } },
    },
  });
  for (const r of rows) {
    const finished = r.status === "COMPLETED" && isSeasonFinished(r.season.status);
    const entry: HistoryEntry = {
      program: r.season.program,
      seasonTitle: r.season.title,
      enrollmentStatus: r.status,
      result: r.result,
      finishedAt: finished ? (r.completedAt ?? r.season.endDate) : null,
      seasonId: r.seasonId,
      seasonStatus: r.season.status as HistoryEntry["seasonStatus"],
      enrollmentId: r.id,
      enrolledAt: r.enrolledAt,
      endedAt: r.completedAt ?? r.droppedAt ?? r.season.endDate,
    };
    const list = byUser.get(r.studentUserId);
    if (list) list.push(entry);
    else byUser.set(r.studentUserId, [entry]);
  }
  return byUser;
}

/** Why a blocked person is blocked, to follow their name: "did not pass GBV 2026". */
export function describeBlock(standing: Standing, requiredProgram: string | null): string {
  return standing.reason === "did_not_pass"
    ? `did not pass ${standing.programSeasonTitle}`
    : `hasn't finished ${requiredProgram} yet`;
}

export type StandingSeason = { id: number; program: string; requiredProgram: string | null };

/** Each person's standing for joining `season`. Everyone in `userIds` gets an entry. */
export async function loadStandings(
  tx: Prisma.TransactionClient,
  userIds: number[],
  season: StandingSeason,
): Promise<Map<number, Standing>> {
  const history = await loadHistory(tx, userIds, season.id);
  return standingsFrom(userIds, history, season);
}

export function standingsFrom(
  userIds: number[],
  history: Map<number, HistoryEntry[]>,
  season: StandingSeason,
): Map<number, Standing> {
  const rule = { requiredProgram: season.requiredProgram, targetProgram: season.program };
  return new Map(userIds.map((id) => [id, standingFor(rule, history.get(id) ?? [])]));
}
