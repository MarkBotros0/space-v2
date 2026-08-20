import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import morgan from "morgan";

import { config } from "./lib/config";
import { healthRouter } from "./routes/health";
import { authRouter } from "./routes/auth";
import { notFoundHandler } from "./middleware/not-found";
import { errorHandler } from "./middleware/error-handler";

export function createApp(): Express {
  const app = express();

  // Number of proxy hops (load balancer, etc.) in front of the app. Needed so
  // express-rate-limit reads the real client IP from X-Forwarded-For instead
  // of bucketing every request behind the proxy together.
  app.set("trust proxy", config.trustProxy);

  app.use(helmet());
  app.use(cors({ origin: config.mobileAppOrigin, methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"] }));
  app.use(express.json());
  if (config.nodeEnv !== "test") {
    app.use(morgan("dev"));
  }

  app.use(healthRouter);
  app.use("/api/v1/auth", authRouter);

  // Must be last: 404 catches anything unmatched above, the error handler
  // catches anything thrown (including JSON parse failures from express.json()).
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
