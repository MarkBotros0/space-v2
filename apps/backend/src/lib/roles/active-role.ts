import type { Prisma } from "../../generated/prisma/client";

export type ActiveRole = {
  kind: "admin" | "leader" | "student";
  seasonId: number;
  seasonCode: string;
  seasonTitle: string;
  groupName: string | null;
};

/** Only an ACTIVE season gives a role: a draft hasn't started, a finished one has ended. */
export const ACTIVE_SEASON = { status: "ACTIVE", deletedAt: null } as const;
const SEASON_FIELDS = { id: true, code: true, title: true } as const;

/**
 * Each person's one active role. The rule keeps it to one; if older rows break
 * it, admin comes before leader before student, so admin wins over leader in
 * one season. `groupName` is the group a leader leads or a student is placed
 * in, and null for an admin even if they also lead.
 *
 * Inside a write, call this after `lockPeople`, so it reads what the previous
 * holder of the lock committed.
 */
export async function activeRolesFor(
  tx: Prisma.TransactionClient,
  userIds: number[],
): Promise<Map<number, ActiveRole>> {
  const roles = new Map<number, ActiveRole>();
  if (userIds.length === 0) return roles;

  const add = (
    userId: number,
    kind: ActiveRole["kind"],
    season: { id: number; code: string; title: string },
    groupName: string | null,
  ) => {
    if (roles.has(userId)) return;
    roles.set(userId, {
      kind,
      seasonId: season.id,
      seasonCode: season.code,
      seasonTitle: season.title,
      groupName,
    });
  };

  const admins = await tx.seasonAdmin.findMany({
    where: { userId: { in: userIds }, season: ACTIVE_SEASON },
    select: { userId: true, season: { select: SEASON_FIELDS } },
    orderBy: { seasonId: "asc" },
  });
  for (const row of admins) add(row.userId, "admin", row.season, null);

  const leaders = await tx.groupLeader.findMany({
    where: { userId: { in: userIds }, group: { season: ACTIVE_SEASON } },
    select: { userId: true, group: { select: { name: true, season: { select: SEASON_FIELDS } } } },
    orderBy: { groupId: "asc" },
  });
  for (const row of leaders) add(row.userId, "leader", row.group.season, row.group.name);

  const students = await tx.seasonEnrollment.findMany({
    where: { studentUserId: { in: userIds }, status: "ACTIVE", season: ACTIVE_SEASON },
    select: {
      studentUserId: true,
      season: { select: SEASON_FIELDS },
      group: { select: { name: true } },
    },
    orderBy: [{ enrolledAt: "desc" }, { id: "desc" }],
  });
  for (const row of students) {
    add(row.studentUserId, "student", row.season, row.group?.name ?? null);
  }

  return roles;
}

/**
 * Serialises seat writes per person, so two admins seating someone at the same
 * moment take turns and the second sees the first's row. Hold it for the whole
 * transaction: lock, `activeRolesFor`, `seatRefusal`, write. Ascending id order
 * means two writes over the same people can't deadlock.
 */
export async function lockPeople(tx: Prisma.TransactionClient, userIds: number[]): Promise<void> {
  if (userIds.length === 0) return;
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ANY(${userIds}::int[]) ORDER BY id FOR UPDATE`;
}

export function describeActiveRole(name: string, role: ActiveRole): string {
  switch (role.kind) {
    case "admin":
      return `${name} is already an admin of ${role.seasonTitle}`;
    case "leader":
      return `${name} is already leading a group in ${role.seasonTitle}`;
    case "student":
      return `${name} is already a student in ${role.seasonTitle}`;
  }
}
