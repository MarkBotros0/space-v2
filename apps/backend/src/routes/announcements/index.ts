import { Router } from "express";

import { requireAuth } from "../../middleware/require-auth";
import { getOne, listFeed, markRead, unreadSummary } from "./read";

/** News. Mounted at /api/v1/announcements, a prefix this router owns exclusively. */
export const announcementsRouter = Router();
announcementsRouter.use(requireAuth);

// Registration order matters: /unread before /:id.
announcementsRouter.get("/", listFeed);
announcementsRouter.get("/unread", unreadSummary);
announcementsRouter.get("/:id", getOne);
announcementsRouter.post("/:id/read", markRead);
