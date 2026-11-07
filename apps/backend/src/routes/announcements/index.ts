import { Router } from "express";

import { requireAuth } from "../../middleware/require-auth";
import { listTargets } from "./targets";
import { createPost, deletePost, updatePost } from "./write";
import { getOne, listFeed, markRead, unreadSummary } from "./read";

/** News. Mounted at /api/v1/announcements, a prefix this router owns exclusively. */
export const announcementsRouter = Router();
announcementsRouter.use(requireAuth);

// Registration order matters: /unread and /targets before /:id.
announcementsRouter.get("/", listFeed);
announcementsRouter.get("/unread", unreadSummary);
announcementsRouter.get("/targets", listTargets);
announcementsRouter.post("/", createPost);
announcementsRouter.get("/:id", getOne);
announcementsRouter.post("/:id/read", markRead);
announcementsRouter.patch("/:id", updatePost);
announcementsRouter.delete("/:id", deletePost);
