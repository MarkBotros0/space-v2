import { Router } from "express";

import { meAccountRouter } from "./account";
import { meDashboardRouter } from "./dashboard";
import { meDevicesRouter } from "./devices";
import { meOpenQuizAttemptRouter } from "./open-quiz-attempt";
import { mePreferencesRouter } from "./preferences";
import { meProfileRouter } from "./profile";
import { meSeasonReadsRouter } from "./season-reads";

/** Self-service, mounted at /api/v1/me. The order is the registration order the route inventory pins. */
export const meRouter = Router();
meRouter.use(meDevicesRouter);
meRouter.use(meSeasonReadsRouter);
meRouter.use(meAccountRouter);
meRouter.use(meProfileRouter);
meRouter.use(mePreferencesRouter);
meRouter.use(meDashboardRouter);
meRouter.use(meOpenQuizAttemptRouter);
