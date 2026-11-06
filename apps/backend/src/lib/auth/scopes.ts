import { db } from "../../db/client";

export interface Scopes {
  seasonAdminIds: number[];
  groupLeaderIds: number[];
  activeSeasonId: number | null;
  graduationYear: number | null;
}

/**
 * A person's scopes, derived from live rows on every call. Nothing here reads
 * `StudentProfile.activeSeasonId`; that column is retired.
 *
 * - `activeSeasonId`: the season of the most recent (by `enrolledAt`) ACTIVE
 *   enrolment, provided that season is ACTIVE and not deleted.
 * - `seasonAdminIds` / `groupLeaderIds`: DRAFT or ACTIVE, non-deleted seasons
 *   only, so a finished season drops its staff.
 */
export async function loadScopes(userId: number): Promise<Scopes> {
  const liveSeason = { status: { in: ["DRAFT", "ACTIVE"] as ("DRAFT" | "ACTIVE")[] }, deletedAt: null };
  const [adminRows, leaderRows, enrolment, account] = await Promise.all([
    db.seasonAdmin.findMany({
      where: { userId, season: liveSeason },
      select: { seasonId: true },
      orderBy: { seasonId: "asc" },
    }),
    db.groupLeader.findMany({
      where: { userId, group: { season: liveSeason } },
      select: { groupId: true },
      orderBy: { groupId: "asc" },
    }),
    db.seasonEnrollment.findFirst({
      where: { studentUserId: userId, status: "ACTIVE", season: { status: "ACTIVE", deletedAt: null } },
      orderBy: [{ enrolledAt: "desc" }, { id: "desc" }],
      select: { seasonId: true },
    }),
    db.user.findUnique({ where: { id: userId }, select: { graduationYear: true } }),
  ]);
  return {
    seasonAdminIds: adminRows.map((r) => r.seasonId),
    groupLeaderIds: leaderRows.map((r) => r.groupId),
    activeSeasonId: enrolment?.seasonId ?? null,
    graduationYear: account?.graduationYear ?? null,
  };
}
