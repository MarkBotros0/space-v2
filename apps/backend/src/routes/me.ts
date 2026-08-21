import { Router } from "express";

import { db } from "../db/client";
import { apiOk } from "../lib/api-response";
import { requireAuth, requireUser } from "../middleware/require-auth";

export const meRouter = Router();

meRouter.get("/", requireAuth, async (req, res) => {
  const user = requireUser(req);

  const record = await db.user.findUnique({
    where: { id: user.userId },
    select: { id: true, name: true, email: true, role: true, avatarPath: true },
  });

  apiOk(res, {
    user: record,
    // Scopes come from the token, not the database: they are what this token
    // was minted with, which is what the client's permission checks must agree
    // with until the next refresh.
    scopes: {
      seasonAdminIds: user.seasonAdminIds,
      groupLeaderIds: user.groupLeaderIds,
      activeSeasonId: user.activeSeasonId,
      // The client distinguishes an alumnus from an active student by
      // role === "STUDENT" && graduationYear != null. Without this field it
      // would have to decode the JWT itself to find out.
      graduationYear: user.graduationYear,
    },
  });
});
