import type { UserRole } from "@space/shared";

import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";

export interface Scopes {
  seasonAdminIds: number[];
  groupLeaderIds: number[];
  activeSeasonId: number | null;
  graduationYear: number | null;
}

/** A season that still grants its people anything. */
const LIVE_SEASON = {
  status: { in: ["DRAFT", "ACTIVE"] as ("DRAFT" | "ACTIVE")[] },
  deletedAt: null,
};

/** The two roles `User.role` still decides, and no season row can change. */
function isPermanentRole(role: UserRole): boolean {
  return role === "SUPER" || role === "MENTOR";
}

/**
 * The one rule: SUPER and MENTOR are stored; anyone else is ADMIN, LEADER or
 * STUDENT according to their live season rows. A stored ADMIN or LEADER with
 * no rows is a STUDENT.
 */
export function deriveRole(storedRole: UserRole, grants: { adminIds: number[]; leaderIds: number[] }): UserRole {
  if (isPermanentRole(storedRole)) return storedRole;
  if (grants.adminIds.length > 0) return "ADMIN";
  if (grants.leaderIds.length > 0) return "LEADER";
  return "STUDENT";
}

type Grant = { id: number; seasonStatus: "DRAFT" | "ACTIVE" | "COMPLETED" | "ARCHIVED" };

/**
 * Someone with any role in an ACTIVE season has no access to a draft they've
 * been appointed to until that role ends. The rows stay, so access arrives by
 * itself on the first refresh afterwards (Review Focus 4).
 */
function usableGrants(admin: Grant[], leader: Grant[], hasActiveEnrolment: boolean) {
  const inActive = (g: Grant) => g.seasonStatus === "ACTIVE";
  const serving = hasActiveEnrolment || admin.some(inActive) || leader.some(inActive);
  const keep = (grants: Grant[]) => (serving ? grants.filter(inActive) : grants).map((g) => g.id);
  return { adminIds: keep(admin), leaderIds: keep(leader) };
}

async function readGrants(userIds: number[], client: Prisma.TransactionClient = db) {
  const [adminRows, leaderRows, enrolments] = await Promise.all([
    client.seasonAdmin.findMany({
      where: { userId: { in: userIds }, season: LIVE_SEASON },
      select: { userId: true, seasonId: true, season: { select: { status: true } } },
      orderBy: { seasonId: "asc" },
    }),
    client.groupLeader.findMany({
      where: { userId: { in: userIds }, group: { season: LIVE_SEASON } },
      select: { userId: true, groupId: true, group: { select: { season: { select: { status: true } } } } },
      orderBy: { groupId: "asc" },
    }),
    client.seasonEnrollment.findMany({
      where: {
        studentUserId: { in: userIds },
        status: "ACTIVE",
        season: { status: "ACTIVE", deletedAt: null },
      },
      orderBy: [{ enrolledAt: "desc" }, { id: "desc" }],
      select: { studentUserId: true, seasonId: true },
    }),
  ]);
  return (userId: number) => {
    const enrolment = enrolments.find((e) => e.studentUserId === userId);
    return {
      ...usableGrants(
        adminRows.filter((r) => r.userId === userId).map((r) => ({ id: r.seasonId, seasonStatus: r.season.status })),
        leaderRows
          .filter((r) => r.userId === userId)
          .map((r) => ({ id: r.groupId, seasonStatus: r.group.season.status })),
        enrolment !== undefined,
      ),
      activeSeasonId: enrolment?.seasonId ?? null,
    };
  };
}

/**
 * A person's role and scopes, derived from live rows on every call. Nothing
 * here reads `StudentProfile.activeSeasonId`; that column is retired.
 *
 * - `role`: see `deriveRole`.
 * - `activeSeasonId`: the season of the most recent (by `enrolledAt`) ACTIVE
 *   enrolment, provided that season is ACTIVE and not deleted.
 * - `seasonAdminIds` / `groupLeaderIds`: DRAFT or ACTIVE, non-deleted seasons
 *   only, so a finished season drops its staff; see `usableGrants` for drafts.
 * - SUPER and MENTOR hold no seasons, so their lists stay empty whatever rows exist.
 */
export async function loadScopes(userId: number): Promise<Scopes & { role: UserRole }> {
  const account = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, graduationYear: true },
  });
  const graduationYear = account?.graduationYear ?? null;
  const storedRole: UserRole = account?.role ?? "STUDENT";
  if (isPermanentRole(storedRole)) {
    return { role: storedRole, seasonAdminIds: [], groupLeaderIds: [], activeSeasonId: null, graduationYear };
  }

  const grants = (await readGrants([userId]))(userId);
  return {
    role: deriveRole(storedRole, grants),
    seasonAdminIds: grants.adminIds,
    groupLeaderIds: grants.leaderIds,
    activeSeasonId: grants.activeSeasonId,
    graduationYear,
  };
}

/** One person's role as `loadScopes` gives it, read through the caller's transaction. */
export async function derivedRoleOf(
  tx: Prisma.TransactionClient,
  person: { id: number; role: UserRole },
): Promise<UserRole> {
  if (isPermanentRole(person.role)) return person.role;
  return deriveRole(person.role, (await readGrants([person.id], tx))(person.id));
}

/** `deriveRole` for a page of people, in one set of queries. Keyed by user id. */
export async function deriveRoles(people: { id: number; role: UserRole }[]): Promise<Map<number, UserRole>> {
  const seasonal = people.filter((p) => !isPermanentRole(p.role)).map((p) => p.id);
  const grantsOf = seasonal.length > 0 ? await readGrants(seasonal) : null;
  return new Map(
    people.map((p) => [
      p.id,
      deriveRole(p.role, grantsOf && !isPermanentRole(p.role) ? grantsOf(p.id) : { adminIds: [], leaderIds: [] }),
    ]),
  );
}

/**
 * The where-clause for "people of this role" on staff lists. ADMIN means a
 * SeasonAdmin row in a DRAFT or ACTIVE season, LEADER likewise, STUDENT neither.
 * Someone who both administers and leads matches ADMIN and LEADER.
 */
export function usersWithRole(role: UserRole): Prisma.UserWhereInput {
  if (isPermanentRole(role)) return { role };
  const seasonal = { role: { notIn: ["SUPER", "MENTOR"] as ("SUPER" | "MENTOR")[] } };
  const adminRow = { season: LIVE_SEASON };
  const leaderRow = { group: { season: LIVE_SEASON } };
  if (role === "ADMIN") return { ...seasonal, seasonAdminAssignments: { some: adminRow } };
  if (role === "LEADER") return { ...seasonal, groupLeaderAssignments: { some: leaderRow } };
  return {
    ...seasonal,
    seasonAdminAssignments: { none: adminRow },
    groupLeaderAssignments: { none: leaderRow },
  };
}
