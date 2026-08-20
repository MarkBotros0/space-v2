import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.string().default("development"),
  // Number of proxy hops (e.g. a load balancer) in front of the app. Passed
  // straight to Express's `trust proxy` setting, which controls how `req.ip`
  // is derived and therefore how express-rate-limit buckets clients. Defaults
  // to 0 (no proxy trusted) so an unconfigured deploy fails closed rather than
  // trusting a spoofable X-Forwarded-For header.
  TRUST_PROXY: z.coerce.number().int().nonnegative().default(0),
  // Origin allowed to call the API via CORS. Defaults to "*" to match the app
  // this backend was ported from; set to the mobile app's actual origin in
  // any environment where that matters.
  MOBILE_APP_ORIGIN: z.string().default("*"),
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
  trustProxy: parsed.data.TRUST_PROXY,
  mobileAppOrigin: parsed.data.MOBILE_APP_ORIGIN,
} as const;
