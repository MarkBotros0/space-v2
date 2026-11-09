import { Router, type NextFunction, type Request, type Response } from "express";
// Relative, not "@space/shared" — the rootDir emit trap (see routes/auth.ts).
import { devSwitchRequestSchema } from "../../../../packages/shared/src/index";

import { db } from "../db/client";
import { apiError, apiOk } from "../lib/api-response";
import { deriveRoles, usersWithRole } from "../lib/auth/scopes";
import { issueSession } from "../lib/auth/tokens";
import { config } from "../lib/config";
import { makeLimiter } from "../lib/rate-limit";

/**
 * Dev user switcher — v1 parity (jpc-space `dev-switch` provider +
 * DevUserSwitcher). Signs in as any active user with NO password, so testers
 * can hop between roles. Exists only when DEV_USER_SWITCHER=1; otherwise every
 * route here is the same 404 as an unknown path, so a production client can't
 * tell the feature exists.
 */
export const devRouter = Router();

function switcherOn(_req: Request, res: Response, next: NextFunction) {
  if (!config.devUserSwitcher) {
    return apiError(res, "not_found", "Not found.", 404);
  }
  return next();
}

const devLimiter = makeLimiter({ name: "dev-switch", limit: 120 });

devRouter.use(switcherOn);

const ROLE_ORDER = ["SUPER", "ADMIN", "LEADER", "MENTOR", "STUDENT"] as const;
const PER_ROLE = 25;

/**
 * Active users, up to 25 per derived role, optionally filtered by name or email.
 * Someone who matches two lists (admin and leader) appears once, under the role
 * they'd sign in as.
 */
devRouter.get("/users", devLimiter, async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
  const search = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { email: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};
  const perRole = await Promise.all(
    ROLE_ORDER.map(async (role) => {
      const rows = await db.user.findMany({
        where: { deletedAt: null, ...usersWithRole(role), ...search },
        select: { id: true, email: true, name: true, role: true },
        orderBy: { email: "asc" },
        take: PER_ROLE,
      });
      const derived = await deriveRoles(rows);
      return rows.filter((r) => derived.get(r.id) === role).map((r) => ({ ...r, role }));
    }),
  );
  return apiOk(res, { users: perRole.flat() });
});

/** Same response as POST /auth/login, for the chosen user. */
devRouter.post("/switch", devLimiter, async (req, res) => {
  const parsed = devSwitchRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "A user id is required.", 400);

  const target = await db.user.findUnique({
    where: { id: parsed.data.userId },
    select: { id: true, name: true, email: true, deletedAt: true },
  });
  if (!target || target.deletedAt) return apiError(res, "not_found", "User not found.", 404);

  const issued = await issueSession(target.id, req.get("user-agent"));
  if (!issued) return apiError(res, "not_found", "User not found.", 404);
  await db.user.update({ where: { id: target.id }, data: { lastLoginAt: new Date() } });

  return apiOk(res, {
    ...issued.session,
    user: { id: target.id, name: target.name, email: target.email, role: issued.user.role },
  });
});
