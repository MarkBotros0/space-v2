import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, apiError, forbidden } from "../../lib/api-response";
import { parseId } from "../../lib/parse-id";
import { isAdminOfSeason } from "../../lib/rbac";
import { freeAlumni } from "../../lib/roles";
import { requireUser } from "../../middleware/require-auth";

/** A season someone was part of: started, whatever came of it. */
const PAST_OR_CURRENT = { deletedAt: null, status: { not: "DRAFT" } } as const;
const SEASON_FIELDS = { select: { id: true, title: true, startDate: true } } as const;

type SeasonRef = { id: number; title: string; startDate: Date };

/** Each person's latest season, as a student or on its staff. */
async function lastSeasons(userIds: number[]): Promise<Map<number, SeasonRef>> {
  const [enrolled, administered, led] = await Promise.all([
    db.seasonEnrollment.findMany({
      where: { studentUserId: { in: userIds }, season: PAST_OR_CURRENT },
      select: { studentUserId: true, season: SEASON_FIELDS },
    }),
    db.seasonAdmin.findMany({
      where: { userId: { in: userIds }, season: PAST_OR_CURRENT },
      select: { userId: true, season: SEASON_FIELDS },
    }),
    db.groupLeader.findMany({
      where: { userId: { in: userIds }, group: { season: PAST_OR_CURRENT } },
      select: { userId: true, group: { select: { season: SEASON_FIELDS } } },
    }),
  ]);

  const latest = new Map<number, SeasonRef>();
  const consider = (userId: number, season: SeasonRef) => {
    const held = latest.get(userId);
    const later =
      !held ||
      season.startDate > held.startDate ||
      (season.startDate.getTime() === held.startDate.getTime() && season.id > held.id);
    if (later) latest.set(userId, season);
  };
  for (const row of enrolled) consider(row.studentUserId, row.season);
  for (const row of administered) consider(row.userId, row.season);
  for (const row of led) consider(row.userId, row.group.season);
  return latest;
}

/**
 * The picker for a season's staff: alumni with no active role, showing only
 * their name and last season. A season admin sees nothing else of anyone's
 * earlier seasons (spec, Who sees what).
 */
export async function listStaffCandidates(req: Request, res: Response) {
  const user = requireUser(req);
  const seasonId = parseId(req.params.id);
  if (seasonId === null) return apiError(res, "bad_request", "Invalid season id.", 400);
  if (!isAdminOfSeason(user, seasonId)) return forbidden(res);

  const season = await db.season.findFirst({ where: { id: seasonId, deletedAt: null }, select: { id: true } });
  if (!season) return apiError(res, "not_found", "Season not found.", 404);

  const people = await db.user.findMany({
    where: freeAlumni,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: { id: true, name: true },
  });
  const last = await lastSeasons(people.map((p) => p.id));

  return apiOk(res, {
    people: people.map((p) => {
      const lastSeason = last.get(p.id);
      return { id: p.id, name: p.name, lastSeason: lastSeason ? { title: lastSeason.title } : null };
    }),
  });
}
