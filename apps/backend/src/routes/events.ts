import { Router } from "express";

import { requireAuth } from "../middleware/require-auth";

/**
 * Domain 15. Mounted at /api/v1/events, a prefix this router owns exclusively,
 * so router-wide auth is permitted (ruling X5).
 */
export const eventsRouter = Router();
eventsRouter.use(requireAuth);
