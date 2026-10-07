import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import morgan from "morgan";

import { config } from "./lib/config";
import { healthRouter } from "./routes/health";
import { authRouter } from "./routes/auth";
import { assignmentsRouter } from "./routes/assignments";
import { groupsRouter } from "./routes/groups";
import { meRouter } from "./routes/me";
import { usersRouter } from "./routes/users";
import { seasonsRouter } from "./routes/seasons";
import { sessionsRouter } from "./routes/sessions";
import { studentsRouter } from "./routes/students";
import { submissionsRouter } from "./routes/submissions";
import { quizzesRouter } from "./routes/quizzes";
import { seasonEngagementRouter, studentEngagementRouter } from "./routes/engagement";
import { myNotesRouter, notesRouter, studentNotesRouter } from "./routes/notes";
import { notificationsRouter } from "./routes/notifications";
import { eventsRouter } from "./routes/events";
import { forumRouter } from "./routes/forum";
import { videoQuizRouter } from "./routes/video-quiz";
import { docsRouter } from "./routes/docs";
import { reportsRouter } from "./routes/reports";
import { importsRouter, seasonImportsRouter } from "./routes/imports";
import { reportExportsRouter, seasonExportsRouter } from "./routes/exports";
import { notFoundHandler } from "./middleware/not-found";
import { errorHandler } from "./middleware/error-handler";

export function createApp(): Express {
  const app = express();

  // Number of proxy hops (load balancer, etc.) in front of the app. Needed so
  // express-rate-limit reads the real client IP from X-Forwarded-For instead
  // of bucketing every request behind the proxy together.
  app.set("trust proxy", config.trustProxy);

  app.use(helmet());
  // PUT belongs here: PUT /api/v1/submissions/by-assignment/:assignmentId is
  // the idempotent create-or-fetch a student's submission screen calls. It was
  // added to the router without this list being updated, so a browser client
  // would have had its preflight refused for an endpoint that exists.
  app.use(
    cors({
      origin: config.mobileAppOrigin,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    }),
  );
  // The import routes parse their own bodies with a larger, explicit limit
  // (routes/imports.ts -> importJsonParser). body-parser skips a body that is
  // already parsed but NOT one that already failed, so these must run before
  // the global 100 KB parser can reject a legal 256 KB paste. seasonImportsRouter
  // defines only POST /:id/imports/groups/* and carries no router-level
  // middleware, so every other /api/v1/seasons/* request falls through.
  app.use("/api/v1/imports", importsRouter);
  app.use("/api/v1/seasons", seasonImportsRouter);
  app.use(express.json());
  if (config.nodeEnv !== "test") {
    app.use(morgan("dev"));
  }

  app.use(healthRouter);

  // Mounted before the API routers so /api/docs cannot be shadowed, and behind
  // a flag so a production deploy can withhold the surface description without
  // a code change. Serves no user data and needs no auth.
  if (config.enableApiDocs) {
    app.use("/api", docsRouter);
  }

  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/me", meRouter);
  app.use("/api/v1/notifications", notificationsRouter);
  app.use("/api/v1/users", usersRouter);
  // forum + video-quiz: mounted at the version root because their paths span
  // two parents each. They carry no router-level middleware (per-route
  // requireAuth, ruling X5), so a request that matches none of their routes
  // falls straight through to the prefixed routers and the catch-all 404.
  app.use("/api/v1", forumRouter);
  app.use("/api/v1", videoQuizRouter);
  app.use("/api/v1/events", eventsRouter);
  app.use("/api/v1/seasons", seasonsRouter);
  app.use("/api/v1/groups", groupsRouter);
  app.use("/api/v1/sessions", sessionsRouter);
  app.use("/api/v1/assignments", assignmentsRouter);
  app.use("/api/v1/submissions", submissionsRouter);
  app.use("/api/v1/quizzes", quizzesRouter);
  app.use("/api/v1/students", studentsRouter);
  // Notes mount three ways on purpose - see the comment in routes/notes.ts.
  // These sit after the domain routers whose prefixes they share: Express
  // falls through unmatched paths, and /students/:id/notes cannot be matched
  // by studentsRouter's /:id.
  app.use("/api/v1/notes", notesRouter);
  app.use("/api/v1/students", studentNotesRouter);
  app.use("/api/v1/me", myNotesRouter);
  // Same fall-through mounting as the notes routers: /students/:id/engagement
  // and /seasons/:id/engagement cannot be matched by those domains' /:id
  // routes, and keeping this domain's arithmetic in one file keeps its single
  // definition single (ruling C4).
  app.use("/api/v1/students", studentEngagementRouter);
  app.use("/api/v1/seasons", seasonEngagementRouter);
  app.use("/api/v1/reports", reportsRouter);
  // Mounted alongside the reports router so /reports/engagement/export sits
  // beside /reports/engagement. Express tries reportsRouter first; it defines
  // no /engagement/export, so the request falls through.
  app.use("/api/v1/reports", reportExportsRouter);
  // Fall-through mounting after seasonsRouter: that router's /:id, /:id/groups,
  // /:id/sessions and /:id/assignments cannot match /:id/exports/*, and keeping
  // this domain's routes in this domain's file stops seasons.ts accumulating a
  // fourth unrelated concern.
  app.use("/api/v1/seasons", seasonExportsRouter);

  // Must be last: 404 catches anything unmatched above, the error handler
  // catches anything thrown (including JSON parse failures from express.json()).
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
