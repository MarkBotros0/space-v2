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
import { seasonsRouter } from "./routes/seasons";
import { sessionsRouter } from "./routes/sessions";
import { submissionsRouter } from "./routes/submissions";
import { docsRouter } from "./routes/docs";
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
  app.use("/api/v1/seasons", seasonsRouter);
  app.use("/api/v1/groups", groupsRouter);
  app.use("/api/v1/sessions", sessionsRouter);
  app.use("/api/v1/assignments", assignmentsRouter);
  app.use("/api/v1/submissions", submissionsRouter);

  // Must be last: 404 catches anything unmatched above, the error handler
  // catches anything thrown (including JSON parse failures from express.json()).
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
