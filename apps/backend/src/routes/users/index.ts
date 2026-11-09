import { Router } from "express";

import { requireAuth } from "../../middleware/require-auth";
import { createUser, deactivateUser, getUser, reactivateUser, updateUser } from "./accounts";
import { bulkInviteLimiter, countPendingInvites, resendInvite, sendPendingInvites } from "./invites";
import { listUsers } from "./list";

/**
 * Users (spec 11): account administration — list, detail, role edits,
 * deactivation, creation-with-invite and invite re-sends. Every route is
 * SUPER-only (requireRole(req, res, canManageUsers)). This file is the route table, in
 * registration order; handlers live beside it.
 */
export const usersRouter = Router();
// Allowed by ruling X5: this router is mounted on /api/v1/users, a prefix it
// owns outright, so no other router's unknown paths can be turned into 401s.
usersRouter.use(requireAuth);

usersRouter.get("/", listUsers);
// The /invites/pending literals sit before /:id so "invites" is never read as an id.
usersRouter.get("/invites/pending", countPendingInvites);
usersRouter.post("/invites/pending", bulkInviteLimiter, sendPendingInvites);
usersRouter.get("/:id", getUser);
usersRouter.patch("/:id", updateUser);
usersRouter.post("/:id/deactivate", deactivateUser);
usersRouter.post("/:id/reactivate", reactivateUser);
usersRouter.post("/", createUser);
usersRouter.post("/:id/invite", resendInvite);
