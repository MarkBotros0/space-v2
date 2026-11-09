import { Router } from "express";

import { requireAuth } from "../../middleware/require-auth";
import { listTargets } from "./targets";
import { createPost, deletePost, updatePost } from "./write";
import { closePoll, listVoters, reopenPoll } from "./poll-manage";
import { castVote } from "./poll-vote";
import { getOne, listFeed, markRead, unreadSummary } from "./read";

/** Announcements. Mounted at /api/v1/announcements, a prefix this router owns exclusively. */
export const announcementsRouter = Router();
announcementsRouter.use(requireAuth);

// Registration order matters: /unread, /targets and /:id/poll/* before /:id.
announcementsRouter.get("/", listFeed);
announcementsRouter.get("/unread", unreadSummary);
announcementsRouter.get("/targets", listTargets);
announcementsRouter.post("/", createPost);
announcementsRouter.put("/:id/poll/vote", castVote);
announcementsRouter.post("/:id/poll/close", closePoll);
announcementsRouter.post("/:id/poll/reopen", reopenPoll);
announcementsRouter.get("/:id/poll/voters", listVoters);
announcementsRouter.get("/:id", getOne);
announcementsRouter.post("/:id/read", markRead);
announcementsRouter.patch("/:id", updatePost);
announcementsRouter.delete("/:id", deletePost);
