import { Router } from "express";
// Relative, not "@space/shared" — same emit trap routes/auth.ts documents.
import type { Request, Response } from "express";
import {
  userRoleSchema,
  userStatusSchema,
  type UserDetail,
  type UserRole,
  type UserStatus,
} from "../../../../packages/shared/src/index";

import { db } from "../db/client";
import { apiOk, apiError } from "../lib/api-response";
import type { SessionUser } from "../lib/auth/tokens";
import { parseId } from "../lib/parse-id";
import { canManageUsers } from "../lib/rbac";
import { requireAuth, requireUser } from "../middleware/require-auth";

export const usersRouter = Router();
// Allowed by ruling X5: this router is mounted on /api/v1/users, a prefix it
// owns outright, so no other router's unknown paths can be turned into 401s.
usersRouter.use(requireAuth);

/** Every route in this file is SUPER-only (spec 11 §4 — canManageUsers). */
function requireSuper(req: Request, res: Response): SessionUser | null {
  const user = requireUser(req);
  if (!canManageUsers(user)) {
    apiError(res, "forbidden", "You don't have access to this.", 403);
    return null;
  }
  return user;
}

/** A live, unaccepted invite — the "invited" badge condition (R82). */
export function liveInviteWhere(now: Date) {
  return { usedAt: null, expiresAt: { gt: now } } as const;
}

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
export function deriveStatus(row: StatusRow, hasLiveInvite: boolean): UserStatus {
  if (row.deletedAt !== null) return "inactive";
  if (row.passwordHash !== null || row.lastLoginAt !== null) return "active";
  return hasLiveInvite ? "invited" : "pending";
}

const LIST_SELECT = {
  id: true, name: true, email: true, role: true, graduationYear: true,
  lastLoginAt: true, deletedAt: true, passwordHash: true,
} as const;

type ListRow = {
  id: number; name: string; email: string; role: UserRole;
  graduationYear: number | null; lastLoginAt: Date | null;
  deletedAt: Date | null; passwordHash: string | null;
};

function toListItem(row: ListRow, hasLiveInvite: boolean) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    graduationYear: row.graduationYear,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    status: deriveStatus(row, hasLiveInvite),
  };
}

usersRouter.get("/", async (req, res) => {
  const user = requireSuper(req, res);
  if (!user) return;

  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  // The shared UserRole is the same literal union as Prisma's generated enum
  // type, so this needs no cast where it reaches the where-clause.
  let roleFilter: UserRole | null = null;
  if (typeof req.query.role === "string") {
    const parsed = userRoleSchema.safeParse(req.query.role);
    if (!parsed.success) return apiError(res, "bad_request", "Invalid role filter.", 400);
    roleFilter = parsed.data;
  }
  let statusFilter: UserStatus | null = null;
  if (typeof req.query.status === "string") {
    const parsed = userStatusSchema.safeParse(req.query.status);
    if (!parsed.success) return apiError(res, "bad_request", "Invalid status filter.", 400);
    statusFilter = parsed.data;
  }
  const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : NaN;
  const limit = Number.isInteger(limitRaw) && limitRaw >= 1 && limitRaw <= 100 ? limitRaw : 50;
  const cursor = typeof req.query.cursor === "string" ? parseId(req.query.cursor) : null;
  if (typeof req.query.cursor === "string" && cursor === null) {
    return apiError(res, "bad_request", "Invalid cursor.", 400);
  }

  const now = new Date();
  // The derived statuses expressed as where-clauses, so filtering happens in
  // the database instead of over an unbounded in-memory array (R84's fix).
  const unactivated = { passwordHash: null, lastLoginAt: null } as const;
  const statusWhere: Record<UserStatus, object> = {
    inactive: { deletedAt: { not: null } },
    active: {
      deletedAt: null,
      OR: [{ passwordHash: { not: null } }, { lastLoginAt: { not: null } }],
    },
    invited: {
      deletedAt: null, ...unactivated,
      invitesReceived: { some: liveInviteWhere(now) },
    },
    pending: {
      deletedAt: null, ...unactivated,
      invitesReceived: { none: liveInviteWhere(now) },
    },
  };

  const where = {
    AND: [
      q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { email: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {},
      roleFilter ? { role: roleFilter } : {},
      statusFilter ? statusWhere[statusFilter] : {},
    ],
  };

  const [rows, total] = await Promise.all([
    db.user.findMany({
      where,
      select: LIST_SELECT,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: limit + 1,
      ...(cursor !== null ? { cursor: { id: cursor }, skip: 1 } : {}),
    }),
    db.user.count({ where }),
  ]);

  const page = rows.slice(0, limit);
  const nextCursor = rows.length > limit ? page[page.length - 1]!.id : null;

  const liveInvites = await db.inviteToken.findMany({
    where: { userId: { in: page.map((r) => r.id) }, ...liveInviteWhere(now) },
    select: { userId: true },
  });
  const invitedIds = new Set(liveInvites.map((i) => i.userId));

  return apiOk(res, {
    users: page.map((row) => toListItem(row, invitedIds.has(row.id))),
    nextCursor,
    total,
  });
});

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

  const now = new Date();
  const hasLiveInvite =
    invite !== null && invite.usedAt === null && invite.expiresAt > now;

  return {
    ...toListItem(row, hasLiveInvite),
    invite: invite
      ? {
          issuedAt: invite.createdAt.toISOString(),
          expiresAt: invite.expiresAt.toISOString(),
          usedAt: invite.usedAt?.toISOString() ?? null,
          invitedByName: invite.invitedBy?.name ?? null,
        }
      : null,
  };
}

usersRouter.get("/:id", async (req, res) => {
  const user = requireSuper(req, res);
  if (!user) return;
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid user id.", 400);

  const detail = await loadUserDetail(id);
  if (!detail) return apiError(res, "not_found", "User not found.", 404);
  return apiOk(res, detail);
});
