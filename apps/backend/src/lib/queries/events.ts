import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import type { SessionUser } from "../auth/tokens";
import { isAdminOfSeason, isAlumnus, isLeaderOfGroup, isSuper } from "../rbac";

/**
 * The seasons a viewer may see SEASON-scoped events for.
 *
 * Ported from v1's `viewerSeasonIds`, with ruling C7 applied: v1 reads
 * `user.seasonAdminIds` and `user.groupLeaderIds` straight off the token, and
 * those arrays are grants rather than identity — `loadScopes` fills them from
 * join tables with no role filter, so a row naming a student is reachable.
 * Every claim here is paired with the role that can legitimately hold it.
 */
export async function viewerSeasonIds(user: SessionUser): Promise<number[] | "all"> {
  if (isSuper(user)) return "all";
  const ids = new Set<number>();
  if (user.role === "STUDENT" && user.activeSeasonId) ids.add(user.activeSeasonId);
  for (const seasonId of user.seasonAdminIds) {
    if (isAdminOfSeason(user, seasonId)) ids.add(seasonId);
  }
  if (user.role === "LEADER" && user.groupLeaderIds.length > 0) {
    const groups = await db.group.findMany({
      where: { id: { in: user.groupLeaderIds } },
      select: { id: true, seasonId: true },
    });
    for (const g of groups) {
      if (isLeaderOfGroup(user, g.id)) ids.add(g.seasonId);
    }
  }
  return [...ids];
}

/**
 * The one visibility formula.
 *
 * v1 has two, at six call sites: four calendar pages pass a hardcoded literal
 * and `UpcomingEventsCard` computes `user.role !== "STUDENT"` — which is false
 * for an alumnus, because an alumnus is role STUDENT with a graduationYear. So
 * in shipped v1, ALUMNI_ONLY means "visible to staff, hidden from alumni", the
 * exact inverse of its name, on the only two surfaces alumni have (spec 15
 * R44/R45, §10 item 2). Deriving it here, from the token, means there is one
 * answer and no caller can widen it.
 *
 * SUPER is unfiltered so the manager list can show orphans and archived-season
 * events. Everyone else gets `season: { deletedAt: null }` on the SEASON branch
 * (item 4 — a soft-deleted season's events are a bug in any reading), which
 * also hides an R54 orphan, since a null relation cannot satisfy a relation
 * filter.
 */
export async function eventVisibilityFilter(
  user: SessionUser,
): Promise<Prisma.JpcEventWhereInput> {
  if (isSuper(user)) return {};

  const branches: Prisma.JpcEventWhereInput[] = [{ visibility: "ALL" }];
  if (isAlumnus(user) || user.role !== "STUDENT") {
    branches.push({ visibility: "ALUMNI_ONLY" });
  }

  const seasonIds = await viewerSeasonIds(user);
  if (seasonIds !== "all" && seasonIds.length > 0) {
    branches.push({
      visibility: "SEASON",
      seasonId: { in: seasonIds },
      season: { deletedAt: null },
    });
  }
  return { OR: branches };
}

/**
 * The window, on `(endDate ?? date)`.
 *
 * v1 has two different windows for the same rows — the agenda filters on `date`
 * while the dashboard card filters on `(endDate ?? date)` — so a five-day
 * retreat vanishes from the calendar on day two while the card two screens away
 * still shows it (spec 15 R66, §10 item 5). One rule, applied here, used by
 * every surface. Prisma cannot express COALESCE in a filter, so the null case
 * is spelled out.
 */
export function eventWindowFilter(from: Date, to: Date): Prisma.JpcEventWhereInput {
  return {
    AND: [
      { date: { lte: to } },
      { OR: [{ endDate: { gte: from } }, { endDate: null, date: { gte: from } }] },
    ],
  };
}
