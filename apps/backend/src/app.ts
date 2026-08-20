import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import morgan from "morgan";

import { config } from "./lib/config";
import { healthRouter } from "./routes/health";
import { authRouter } from "./routes/auth";

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: "*", methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"] }));
  app.use(express.json());
  if (config.nodeEnv !== "test") {
    app.use(morgan("dev"));
  }

  app.use(healthRouter);
  app.use("/api/v1/auth", authRouter);

  return app;
}
