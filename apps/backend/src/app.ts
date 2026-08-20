import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import morgan from "morgan";

import { config } from "./lib/config";
import { healthRouter } from "./routes/health";

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: "*", methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"] }));
  app.use(express.json());
  if (config.nodeEnv !== "test") {
    app.use(morgan("dev"));
  }

  app.use(healthRouter);

  return app;
}
