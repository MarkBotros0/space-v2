import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.string().default("development"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment: ${parsed.error.message}`);
}

export const config = {
  databaseUrl: parsed.data.DATABASE_URL,
  authSecret: parsed.data.AUTH_SECRET,
  port: parsed.data.PORT,
  nodeEnv: parsed.data.NODE_ENV,
} as const;
