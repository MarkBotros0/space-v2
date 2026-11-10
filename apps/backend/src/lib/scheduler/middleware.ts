import type { RequestHandler } from "express";

import { runInBackground } from "../background";
import { config } from "../config";
import { MS_PER_MINUTE } from "../org-time";
import { maybeRunScheduler } from "./index";

let lastTry = 0;

export function resetTickForTests(): void {
  lastTry = 0;
}

/**
 * Lets any request start the scheduler sweep. The response goes first (`next()`
 * is called before anything else); the sweep runs in the background, at most
 * once a minute per instance, and the database lease keeps instances apart.
 */
export function schedulerTick(): RequestHandler {
  return (_req, _res, next) => {
    next();
    if (!config.schedulerTick) return;
    const nowMs = Date.now();
    if (nowMs - lastTry < MS_PER_MINUTE) return;
    lastTry = nowMs;
    runInBackground("scheduler", maybeRunScheduler());
  };
}
