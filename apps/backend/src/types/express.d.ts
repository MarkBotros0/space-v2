import type { SessionUser } from "../lib/auth/tokens";

// requireAuth assigns req.user. It stays optional here because Express has no
// way to express "this property exists only downstream of that middleware" —
// route handlers call requireUser(req) to narrow it to a non-null SessionUser.
declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

export {};
