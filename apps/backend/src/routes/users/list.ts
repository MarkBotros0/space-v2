import type { Request, Response } from "express";
import type { UserRole, UserStatus } from "@space/shared";

import { db } from "../../db/client";
import { apiOk, apiError } from "../../lib/api-response";
import { liveInviteWhere } from "../../lib/invites";
import { parseId } from "../../lib/parse-id";
// Relative, not "@space/shared" — same emit trap routes/auth.ts documents.
import { userRoleSchema, userStatusSchema } from "../../../../../packages/shared/src/index";
import { requireSuper } from "./super-only";
import { LIST_SELECT, toListItem } from "./views";

export async function listUsers(req: Request, res: Response) {
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
}
