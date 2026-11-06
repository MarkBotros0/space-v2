import type { UserDetail, UserRole, UserStatus } from "@space/shared";

import { db } from "../../db/client";
import { deriveRoles } from "../../lib/auth/scopes";

interface StatusRow {
  passwordHash: string | null;
  lastLoginAt: Date | null;
  deletedAt: Date | null;
}

/**
 * The four badge states, derived once (R81/R82's precedence: inactive,
 * active, invited, pending). v1 wrote this expression twice in two pages and
 * shipped the hash to a server component to do it (R85); here the hash never
 * leaves this function's input.
 */
function deriveStatus(row: StatusRow, hasLiveInvite: boolean): UserStatus {
  if (row.deletedAt !== null) return "inactive";
  if (row.passwordHash !== null || row.lastLoginAt !== null) return "active";
  return hasLiveInvite ? "invited" : "pending";
}

export const LIST_SELECT = {
  id: true, name: true, email: true, role: true, graduationYear: true,
  lastLoginAt: true, deletedAt: true, passwordHash: true,
} as const;

type ListRow = {
  id: number; name: string; email: string; role: UserRole;
  graduationYear: number | null; lastLoginAt: Date | null;
  deletedAt: Date | null; passwordHash: string | null;
};

/** `role` is the derived one (`deriveRoles`), never the stored column. */
export function toListItem(row: ListRow, hasLiveInvite: boolean, role: UserRole) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role,
    graduationYear: row.graduationYear,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    status: deriveStatus(row, hasLiveInvite),
  };
}

/**
 * The detail shape, built in ONE place. GET /:id and PATCH /:id (Task 3) both
 * answer through this, so a PATCH response is byte-for-byte what a following
 * GET returns — an earlier draft had PATCH hand-build `invite: null` while
 * claiming parity.
 */
export async function loadUserDetail(id: number): Promise<UserDetail | null> {
  const row = await db.user.findUnique({ where: { id }, select: LIST_SELECT });
  if (!row) return null;

  // Latest invite regardless of state — the panel shows a used/expired one's
  // dates too, which is more honest than v1's bare "Invited" badge (R75).
  const invite = await db.inviteToken.findFirst({
    where: { userId: id },
    orderBy: { createdAt: "desc" },
    select: {
      createdAt: true, expiresAt: true, usedAt: true,
      invitedBy: { select: { name: true } },
    },
  });

  // The seasons a demotion away from ADMIN would take away (updateUser
  // deletes the SeasonAdmin rows), so the edit screen can name them first.
  const adminRows = await db.seasonAdmin.findMany({
    where: { userId: id, season: { deletedAt: null } },
    select: { season: { select: { id: true, code: true, title: true } } },
    orderBy: { season: { startDate: "desc" } },
  });

  const now = new Date();
  const hasLiveInvite =
    invite !== null && invite.usedAt === null && invite.expiresAt > now;

  return {
    ...toListItem(row, hasLiveInvite, (await deriveRoles([row])).get(row.id) ?? row.role),
    invite: invite
      ? {
          issuedAt: invite.createdAt.toISOString(),
          expiresAt: invite.expiresAt.toISOString(),
          usedAt: invite.usedAt?.toISOString() ?? null,
          invitedByName: invite.invitedBy?.name ?? null,
        }
      : null,
    adminSeasons: adminRows.map((r) => r.season),
  };
}
