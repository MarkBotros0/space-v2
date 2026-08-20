import { Router } from "express";

import { db } from "../db/client";
import { apiOk, apiError } from "../lib/api-response";

export const healthRouter = Router();

healthRouter.get("/health", async (_req, res) => {
  try {
    await db.$queryRaw`SELECT 1`;
    return apiOk(res, { status: "ok", database: "up" });
  } catch {
    return apiError(res, "database_unavailable", "Database is not reachable.", 503);
  }
});
