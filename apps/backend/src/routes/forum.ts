import { Router } from "express";

/**
 * Domain 14. Mounted at /api/v1 because the thread hangs off an assignment
 * (`/assignments/:id/forum*`) while a comment is addressed on its own
 * (`/forum/comments/:commentId`). Per-route `requireAuth` only (ruling X5) —
 * see video-quiz.ts for why.
 */
export const forumRouter = Router();
