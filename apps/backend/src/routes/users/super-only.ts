import type { Request, Response } from "express";

import type { SessionUser } from "../../lib/auth/tokens";
import { canManageUsers } from "../../lib/rbac";
import { requireUser } from "../../middleware/require-auth";
import { forbidden } from "../respond";

/** Every route in this file is SUPER-only (spec 11 §4 — canManageUsers). */
export function requireSuper(req: Request, res: Response): SessionUser | null {
  const user = requireUser(req);
  if (!canManageUsers(user)) {
    forbidden(res);
    return null;
  }
  return user;
}
