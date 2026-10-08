import { Router } from "express";
import rateLimit from "express-rate-limit";
// Relative, not "@space/shared" — same emit trap routes/auth.ts documents.
import type { Request, Response } from "express";
import {
  userRoleSchema,
  userStatusSchema,
  updateUserRequestSchema,
  createUserRequestSchema,
  type UserDetail,
  type UserRole,
  type UserStatus,
} from "../../../../packages/shared/src/index";

import { db } from "../db/client";
import { apiOk, apiError } from "../lib/api-response";
import { revokeAllRefreshTokensForUser, type SessionUser } from "../lib/auth/tokens";
import { parseId } from "../lib/parse-id";
import { canManageUsers } from "../lib/rbac";
import { isEmailConfigured, sendInviteEmail } from "../lib/email";
import { issueInvite, liveInviteWhere, listPendingInviteUserIds, sendPendingInviteBatch } from "../lib/invites";
import { rateLimitHandler } from "../lib/rate-limit";
import { isLastActiveSuper, lockActiveSuperIds } from "../lib/super-guard";
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

// Own bucket (Plan 10 Decision 11). With the 20-user batch ceiling this caps
// bulk sending at 600 invites an hour.
const bulkInviteLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 30, handler: rateLimitHandler });

/** How many accounts the bulk button would reach (R87: hidden at zero). */
usersRouter.get("/invites/pending", async (req, res) => {
  const user = requireSuper(req, res);
  if (!user) return;
  const ids = await listPendingInviteUserIds();
  return apiOk(res, { pending: ids.length });
});

/**
 * "Send all pending invites" (v1 sendAllPendingInvitesAction,
 * invite-actions.ts:53-75) as ONE bounded batch per request — Plan 10
 * Decision 12. Refuses outright with no mail transport: minting codes nobody
 * receives would also empty the pending pool, hiding the very accounts that
 * still need an invite.
 */
usersRouter.post("/invites/pending", bulkInviteLimiter, async (req, res) => {
  const user = requireSuper(req, res);
  if (!user) return;
  if (!isEmailConfigured()) {
    return apiError(
      res,
      "email_not_configured",
      "Email isn't configured on this server, so invites can't be delivered.",
      503,
    );
  }
  const result = await sendPendingInviteBatch(user.userId);
  return apiOk(res, result);
});

usersRouter.get("/:id", async (req, res) => {
  const user = requireSuper(req, res);
  if (!user) return;
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid user id.", 400);

  const detail = await loadUserDetail(id);
  if (!detail) return apiError(res, "not_found", "User not found.", 404);
  return apiOk(res, detail);
});

usersRouter.patch("/:id", async (req, res) => {
  const user = requireSuper(req, res);
  if (!user) return;
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid user id.", 400);

  const parsed = updateUserRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(
      res, "bad_request",
      parsed.error.issues[0]?.message ?? "Invalid user body.", 400,
    );
  }
  const body = parsed.data;

  const outcome = await db.$transaction(async (tx) => {
    const target = await tx.user.findUnique({
      where: { id },
      select: { id: true, role: true, deletedAt: true },
    });
    // REG-104: a deactivated account is not an edit target. GET and reactivate
    // still reach it; only this write refuses.
    if (!target || target.deletedAt !== null) {
      return { fail: ["not_found", "User not found.", 404] as const };
    }

    const roleChanged = body.role !== target.role;

    // D7 rec 1: you cannot change your own role — the lockout guard v1's
    // updateUserAction lacked (R50). Renaming yourself stays allowed.
    if (roleChanged && id === user.userId) {
      return {
        fail: ["cannot_change_own_role", "You can't change your own role.", 409] as const,
      };
    }

    // D7 rec 3: SUPER is never a mis-tapped picker item.
    if (roleChanged && body.role === "SUPER" && body.confirmSuper !== true) {
      return {
        fail: [
          "confirm_super_required",
          "Granting SUPER requires explicit confirmation.", 400,
        ] as const,
      };
    }

    // D7 rec 2: never demote the last SUPER. The active SUPER rows are LOCKED
    // (Decision 16), not merely counted — a count alone lets two concurrent
    // demotions both pass under READ COMMITTED.
    if (roleChanged && target.role === "SUPER") {
      const activeSuperIds = await lockActiveSuperIds(tx);
      if (isLastActiveSuper(activeSuperIds, id)) {
        return {
          fail: ["last_super", "This is the only active SUPER account.", 409] as const,
        };
      }
    }

    if (roleChanged) {
      // D3 — fix the write, not the predicate: demotion cascades to the scope
      // tables so loadScopes has nothing to return on the next refresh...
      if (target.role === "ADMIN") {
        await tx.seasonAdmin.deleteMany({ where: { userId: id } });
      }
      if (target.role === "LEADER") {
        await tx.groupLeader.deleteMany({ where: { userId: id } });
      }
      // ...and a promotion to STUDENT finally gets a profile (R46: v1 left
      // promoted users with a null activeSeasonId forever).
      if (body.role === "STUDENT") {
        await tx.studentProfile.upsert({
          where: { userId: id },
          update: {},
          create: { userId: id },
        });
      }
    }

    await tx.user.update({
      where: { id },
      data: { name: body.name, role: body.role, graduationYear: body.graduationYear },
    });

    if (roleChanged) {
      // C7 made real: the claims baked into live tokens cannot outlive the
      // change. Access tokens die within 900s; the refresh path dies now.
      await revokeAllRefreshTokensForUser(tx, id);
    }

    return { fail: null };
  });

  if (outcome.fail) {
    const [code, message, status] = outcome.fail;
    return apiError(res, code, message, status);
  }

  // Through the same builder GET /:id uses, so PATCH returns exactly what GET
  // does — invite panel included.
  const detail = await loadUserDetail(id);
  if (!detail) return apiError(res, "not_found", "User not found.", 404);
  return apiOk(res, detail);
});

usersRouter.post("/:id/deactivate", async (req, res) => {
  const user = requireSuper(req, res);
  if (!user) return;
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid user id.", 400);
  if (id === user.userId) {
    // v1 returned void and the UI couldn't tell the no-op from success (R57,
    // R58). An explicit error is the fix, not a silent return.
    return apiError(res, "cannot_deactivate_self", "You can't deactivate yourself.", 400);
  }

  const deletedAt = new Date();
  // The existence check, the last-SUPER guard and the write share one
  // transaction, and the guard locks the SUPER rows (Decision 16) — an earlier
  // draft counted outside any transaction, so a concurrent demotion could
  // slip between the count and the write.
  const outcome = await db.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id }, select: { role: true } });
    if (!target) return "not_found" as const;
    if (target.role === "SUPER") {
      const activeSuperIds = await lockActiveSuperIds(tx);
      if (isLastActiveSuper(activeSuperIds, id)) return "last_super" as const;
    }
    await tx.user.update({ where: { id }, data: { deletedAt } });
    // D6: deactivation revokes — v1 left the refresh path live for 30 days.
    await revokeAllRefreshTokensForUser(tx, id);
    return "ok" as const;
  });

  if (outcome === "not_found") return apiError(res, "not_found", "User not found.", 404);
  if (outcome === "last_super") {
    return apiError(res, "last_super", "This is the only active SUPER account.", 409);
  }
  return apiOk(res, { deletedAt: deletedAt.toISOString() });
});

usersRouter.post("/:id/reactivate", async (req, res) => {
  const user = requireSuper(req, res);
  if (!user) return;
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid user id.", 400);

  const target = await db.user.findUnique({ where: { id }, select: { id: true } });
  if (!target) return apiError(res, "not_found", "User not found.", 404);

  await db.$transaction([
    db.user.update({ where: { id }, data: { deletedAt: null } }),
    // A student deleted through DELETE /students/:id also carries a profile
    // stamp (v1 parity, R86). Clearing only the user would leave the profile
    // "deleted" to v1's readers — jpc-space/src/app/admin/quizzes/page.tsx:31
    // counts profiles with deletedAt: null. updateMany: non-students have no
    // profile row, and that is fine.
    db.studentProfile.updateMany({ where: { userId: id }, data: { deletedAt: null } }),
  ]);
  return apiOk(res, { deletedAt: null });
});

usersRouter.post("/", async (req, res) => {
  const user = requireSuper(req, res);
  if (!user) return;

  const parsed = createUserRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(
      res, "bad_request",
      parsed.error.issues[0]?.message ?? "Invalid user body.", 400,
    );
  }
  const body = parsed.data;

  // Plan 10 Decision 13 — spec 11 D7 rec 3 on CREATE as Plan 9 has it on
  // PATCH: a SUPER grant can never be a mis-tapped picker item.
  if (body.role === "SUPER" && body.confirmSuper !== true) {
    return apiError(res, "confirm_super_required", "Granting SUPER requires explicit confirmation.", 400);
  }

  // Pre-check for the friendly 409; the @unique constraint stays the real
  // guard, so a lost race is caught below rather than surfacing as a 500.
  const existing = await db.user.findUnique({ where: { email: body.email }, select: { id: true } });
  if (existing) return apiError(res, "email_taken", "Email already in use.", 409);

  let issuedRaw: string;
  let issuedExpiresAt: Date;
  let createdId: number;
  try {
    const result = await db.$transaction(async (tx) => {
      // Spec 11 §7: creation and invitation are ONE operation. passwordHash
      // stays null — the column is nullable and null IS the activation model
      // (R14). No temp password exists to log, display, or share (D2).
      const created = await tx.user.create({
        data: {
          name: body.name,
          email: body.email,
          role: body.role,
          graduationYear: body.graduationYear,
          passwordHash: null,
          ...(body.role === "STUDENT" ? { studentProfile: { create: {} } } : {}),
        },
        select: { id: true },
      });
      const invite = await issueInvite(tx, created.id, user.userId);
      return { id: created.id, raw: invite.raw, expiresAt: invite.expiresAt };
    });
    createdId = result.id;
    issuedRaw = result.raw;
    issuedExpiresAt = result.expiresAt;
  } catch (err) {
    // Unique-violation from the race the pre-check can lose.
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "P2002") {
      return apiError(res, "email_taken", "Email already in use.", 409);
    }
    throw err;
  }

  // Mail AFTER commit, best-effort — v1's behaviour and the right one: a
  // transport failure must not roll back the account (R25). The operator can
  // re-send from the detail screen; the invite row's existence is the truth.
  // The log names the user id and the error — never the code (Decision 2).
  try {
    await sendInviteEmail(body.email, issuedRaw, issuedExpiresAt);
  } catch (err) {
    console.error(
      `[invites] failed to send invite email for user ${createdId}:`,
      err instanceof Error ? err.message : err,
    );
  }

  return apiOk(res, { userId: createdId }, 201);
});

usersRouter.post("/:id/invite", async (req, res) => {
  const user = requireSuper(req, res);
  if (!user) return;
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid user id.", 400);

  const target = await db.user.findUnique({
    where: { id },
    select: { email: true, passwordHash: true, lastLoginAt: true, deletedAt: true },
  });
  if (!target) return apiError(res, "not_found", "User not found.", 404);
  // Explicit refusals where v1 silently dropped (R16): this is an
  // authenticated SUPER pressing a button on one row, and deserves an answer.
  if (target.deletedAt) return apiError(res, "user_deleted", "This account is deactivated.", 409);
  if (target.passwordHash !== null || target.lastLoginAt !== null) {
    return apiError(res, "already_activated", "This account is already activated.", 409);
  }

  const invite = await db.$transaction((tx) => issueInvite(tx, id, user.userId));

  try {
    await sendInviteEmail(target.email, invite.raw, invite.expiresAt);
  } catch (err) {
    // User id and error only — never the code (Decision 2).
    console.error(
      `[invites] failed to send invite email for user ${id}:`,
      err instanceof Error ? err.message : err,
    );
  }

  // The panel the detail screen renders, read back from the row just written
  // (loadUserDetail returns the latest invite, which is this one).
  const detail = await loadUserDetail(id);
  return apiOk(res, detail!.invite);
});
