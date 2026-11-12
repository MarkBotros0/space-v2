import { db } from "../../db/client";
import type { SessionUser } from "../auth/tokens";
import { liveSeason } from "../db/live";
import { canReadAllStudents } from "../rbac";
import { staffScopeForSeason } from "./season";

/**
 * Which of a season's students a caller may see scored (engagement, passing progress, the list's
 * numbers): every one ("season"), those in these groups, or none (null). A STUDENT is never staff:
 * the per-student check below lets them read only themselves.
 *   - SUPER / MENTOR: everything (canReadAllStudents);
 *   - ADMIN: must administer that season;
 *   - LEADER: the groups they lead in that season (C9: the group is the enrolment's).
 */
export async function scoreScopeForSeason(
  user: SessionUser,
  seasonId: number,
): Promise<{ kind: "season" } | { kind: "groups"; groupIds: number[] } | null> {
  if (user.role === "STUDENT") return null;
  if (canReadAllStudents(user)) return { kind: "season" };
  const scope = await staffScopeForSeason(user, seasonId);
  if (scope === null) return null;
  return scope.kind === "season" ? scope : { kind: "groups", groupIds: scope.groupIds };
}

/** Whether a scope from `scoreScopeForSeason` covers a student enrolled in this group. */
export function scopeCovers(scope: Awaited<ReturnType<typeof scoreScopeForSeason>>, groupId: number | null): boolean {
  if (scope === null) return false;
  if (scope.kind === "season") return true;
  return groupId !== null && scope.groupIds.includes(groupId);
}

/**
 * May this caller see this student's score IN THIS SEASON?
 *
 * canViewStudent answers "may I see this student at all": true if the caller shares ANY season with
 * them. That is not enough here: an earlier draft passed that gate and then scored whatever
 * ?seasonId= named, so an admin of season A could read the student's season-B numbers (ruling C8:
 * row-scoped at the API). A STUDENT may read only themselves (any of their own seasons).
 */
async function mayScoreInSeason(
  user: SessionUser,
  studentUserId: number,
  seasonId: number,
  groupId: number | null,
): Promise<boolean> {
  if (user.role === "STUDENT") return user.userId === studentUserId;
  return scopeCovers(await scoreScopeForSeason(user, seasonId), groupId);
}

export type ScoredEnrollment = { seasonId: number; groupId: number | null } | "forbidden" | "no_season";

/**
 * The season a student is scored in for this caller: the one `requestedSeasonId` names, else the
 * newest ACTIVE enrolment the caller is scoped to (live seasons only).
 *
 * With a requested season there is one candidate, so a season outside the caller's scope is
 * "forbidden", never a silently different season. Without one, no in-scope candidate is
 * "no_season", not "forbidden": a leader opening a former student who is now ACTIVE in someone
 * else's group has nothing of theirs to score, and the card hides on no_season (a 403 made it show
 * an error whose retry could never succeed).
 */
export async function pickScoredEnrollment(
  user: SessionUser,
  studentUserId: number,
  requestedSeasonId: number | null,
): Promise<ScoredEnrollment> {
  const candidates = await db.seasonEnrollment.findMany({
    where: {
      studentUserId,
      season: liveSeason,
      ...(requestedSeasonId !== null ? { seasonId: requestedSeasonId } : { status: "ACTIVE" }),
    },
    orderBy: { enrolledAt: "desc" },
    select: { seasonId: true, groupId: true },
  });
  if (candidates.length === 0) return "no_season";
  for (const candidate of candidates) {
    if (await mayScoreInSeason(user, studentUserId, candidate.seasonId, candidate.groupId)) return candidate;
  }
  return requestedSeasonId !== null ? "forbidden" : "no_season";
}
