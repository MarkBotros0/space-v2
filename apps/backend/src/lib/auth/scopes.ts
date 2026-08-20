import { db } from "../../db/client";

export interface Scopes {
  seasonAdminIds: number[];
  groupLeaderIds: number[];
  activeSeasonId: number | null;
  graduationYear: number | null;
}

export async function loadScopes(userId: number): Promise<Scopes> {
  const [adminRows, leaderRows, profile, account] = await Promise.all([
    db.seasonAdmin.findMany({ where: { userId }, select: { seasonId: true } }),
    db.groupLeader.findMany({ where: { userId }, select: { groupId: true } }),
    db.studentProfile.findUnique({ where: { userId }, select: { activeSeasonId: true } }),
    db.user.findUnique({ where: { id: userId }, select: { graduationYear: true } }),
  ]);
  return {
    seasonAdminIds: adminRows.map((r) => r.seasonId),
    groupLeaderIds: leaderRows.map((r) => r.groupId),
    activeSeasonId: profile?.activeSeasonId ?? null,
    graduationYear: account?.graduationYear ?? null,
  };
}
