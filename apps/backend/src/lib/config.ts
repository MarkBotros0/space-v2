import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.string().default("development"),
  // IANA zone every wall-clock derivation resolves against (ruling C2): the
  // text of a reschedule notice, where the next weekly occurrence lands, any
  // day bucketing. Never the host's zone. The organisation is Cairo-based.
  ORG_TIMEZONE: z.string().default("Africa/Cairo"),
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
  // Email is optional and carries only invites and password resets. When
  // GMAIL_USER/GMAIL_APP_PASSWORD are unset, neither sends.
  GMAIL_USER: z.string().optional(),
  GMAIL_APP_PASSWORD: z.string().optional(),
  // Where the emails send someone without the app (owner, 2026-11-07). Unset
  // until the app is published (the store pages don't exist yet); the emails
  // show a store's button only once its URL is set.
  APP_STORE_URL: z.string().url().optional(),
  PLAY_STORE_URL: z.string().url().optional(),
  // "local" writes to LOCAL_UPLOADS_DIR; the only driver until the CMS one lands.
  STORAGE_DRIVER: z.enum(["local"]).default("local"),
  LOCAL_UPLOADS_DIR: z.string().default("./uploads"),
  // Hard ceiling on a single upload. multer buffers the whole file in memory
  // before the per-assignment maxFileSizeMb check can run, so this bounds what
  // one request can allocate. 25 MB.
  // Invite acceptance window. 168h = 7 days, deliberately longer than v1's 72h
  // default: the invite is delivered to email and typed into a phone, and v1's
  // TTL never mattered because no invite was ever acceptable (spec 11 D1).
  INVITE_TOKEN_TTL_HOURS: z.coerce.number().int().positive().default(168),
  MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(25 * 1024 * 1024),
  // Accept file uploads on POST /api/v1/submissions/:publicId/files.
  //
  // Defaults OFF. Uploads currently land on the local filesystem, which costs
  // the server disk and memory (multer buffers each file whole) and does not
  // survive a redeploy on an ephemeral host. File and image handling is moving
  // to a CMS; until that driver exists, the endpoint rejects with 503
  // `uploads_disabled` before reading the body. Reads and deletes of files
  // already recorded are unaffected.
  ENABLE_UPLOADS: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  // Serve the OpenAPI document and Swagger UI at /api/docs. Defaults on: the
  // surface is not secret and the docs are how the mobile app is built against
  // it. Set to "false" in a deployment that would rather not publish it.
  ENABLE_API_DOCS: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  // URL scheme the mobile app registers (apps/mobile/app.json "scheme").
  // Password-reset emails link to <scheme>://reset-password?token=… (Plan 10
  // Decision 10). A custom-scheme link is never fetched over HTTP, so the
  // token never reaches a proxy log, a CDN log or a Referer header.
  MOBILE_APP_SCHEME: z
    .string()
    .regex(/^[a-z][a-z0-9+.-]*$/, "must be a bare URL scheme, e.g. spacev2")
    .default("spacev2"),
  // Body limit for the import routes only (routes/imports/limits.ts). The global
  // parser keeps body-parser's 100 KB default; a 256 KB paste and a 2000-row
  // commit resubmitting every cell need more. Any body-parser size string.
  IMPORT_BODY_LIMIT: z.string().default("2mb"),
  // Import rate limits per 15 minutes (spec D18). Configurable so the
  // integration suite, which commits ~22 times from one IP, can lift them.
  IMPORT_PREVIEW_RATE_LIMIT: z.coerce.number().int().positive().default(30),
  IMPORT_COMMIT_RATE_LIMIT: z.coerce.number().int().positive().default(10),
  // Where every express-rate-limit limiter keeps its counters
  // (lib/rate-limit). "postgres" shares them through the RateLimitHit table,
  // which a serverless deploy needs: each Vercel instance has its own memory,
  // so "memory" there lets a client make the limit once per instance. Unset
  // means "postgres", except under NODE_ENV=test, where it means "memory" so
  // the unit suite (database mocked) and the integration suite keep
  // per-process counters.
  RATE_LIMIT_STORE: z.enum(["postgres", "memory"]).optional(),
  // Push through Expo's push service (lib/push.ts). On by default: it only
  // sends to devices that registered a token, so a fresh deploy sends nothing.
  // "false" stops every push without touching in-app rows or email.
  ENABLE_PUSH: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  // Optional Expo access token. Required only if "enhanced push security" is
  // turned on for the project in Expo; then every send must carry it.
  EXPO_ACCESS_TOKEN: z.string().optional(),
  // The secret Vercel Cron sends as `Authorization: Bearer …` to the daily
  // follow-up reminder (owner, 2026-11-07). Unset: that endpoint is a 404 and
  // no reminder is ever sent.
  CRON_SECRET: z.string().min(16).optional(),
  // Request-driven scheduler (lib/scheduler): "off" stops any request from starting a sweep.
  SCHEDULER_TICK: z.enum(["on", "off"]).default("on"),
  // Sentry error reporting (lib/sentry.ts). Entirely off while SENTRY_DSN is
  // unset: nothing initialises and nothing is sent.
  SENTRY_DSN: z.string().optional(),
  // Tags each event. Unset falls back to NODE_ENV.
  SENTRY_ENVIRONMENT: z.string().optional(),
  // Share of requests traced for performance, 0..1. Defaults to 0: errors
  // only, no tracing quota spent.
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0),
  // Release the events belong to. Unset falls back to the commit Vercel
  // injects (VERCEL_GIT_COMMIT_SHA), so each deploy groups its own errors.
  SENTRY_RELEASE: z.string().optional(),
  VERCEL_GIT_COMMIT_SHA: z.string().optional(),
  // Google sign-in (POST /api/v1/auth/google). Comma-separated OAuth client
  // IDs whose ID tokens are accepted (the token's `aud`): the Web client the
  // Android app requests tokens for, and the iOS client. Unset: the endpoint
  // is a 404 and nobody signs in with Google. Client IDs are not secrets.
  GOOGLE_CLIENT_IDS: z
    .string()
    .optional()
    .transform((v) =>
      (v ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    )
    .pipe(
      z.array(z.string().regex(/^[A-Za-z0-9-]+\.apps\.googleusercontent\.com$/, "must be Google OAuth client IDs")),
    ),
  // Dev user switcher (v1 parity: jpc-space's DEV_USER_SWITCHER). "1" turns on
  // /api/v1/dev/*, which signs the caller in as ANY active user with no
  // password. Testing aid only — never set it on a backend with real people's
  // data. Off (404 on every /dev route) unless exactly "1".
  DEV_USER_SWITCHER: z.string().optional(),
});

/**
 * An environment variable set to the empty string means "not configured", not
 * "configured as empty".
 *
 * Hosting platforms materialise a declared-but-unset variable as `""` rather
 * than omitting it. Zod's `.default()` and `.optional()` only fire on
 * `undefined`, so without this every key with a perfectly good default —
 * PORT, STORAGE_DRIVER, MAX_UPLOAD_BYTES, ENABLE_API_DOCS — fails validation
 * on a host that does that, and the resulting error buries the two keys that
 * genuinely have to be set (DATABASE_URL, AUTH_SECRET) among five that do not.
 *
 * Stripping empties first means the error names only what a human must
 * actually go and fix.
 */
const presentEnv = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== ""));

const parsed = envSchema.safeParse(presentEnv);
if (!parsed.success) {
  throw new Error(`Invalid environment: ${parsed.error.message}`);
}

export const config = {
  databaseUrl: parsed.data.DATABASE_URL,
  authSecret: parsed.data.AUTH_SECRET,
  port: parsed.data.PORT,
  nodeEnv: parsed.data.NODE_ENV,
  orgTimezone: parsed.data.ORG_TIMEZONE,
  trustProxy: parsed.data.TRUST_PROXY,
  mobileAppOrigin: parsed.data.MOBILE_APP_ORIGIN,
  gmailUser: parsed.data.GMAIL_USER,
  gmailAppPassword: parsed.data.GMAIL_APP_PASSWORD,
  appStoreUrl: parsed.data.APP_STORE_URL,
  playStoreUrl: parsed.data.PLAY_STORE_URL,
  storageDriver: parsed.data.STORAGE_DRIVER,
  localUploadsDir: parsed.data.LOCAL_UPLOADS_DIR,
  maxUploadBytes: parsed.data.MAX_UPLOAD_BYTES,
  enableUploads: parsed.data.ENABLE_UPLOADS,
  inviteTokenTtlHours: parsed.data.INVITE_TOKEN_TTL_HOURS,
  enableApiDocs: parsed.data.ENABLE_API_DOCS,
  mobileAppScheme: parsed.data.MOBILE_APP_SCHEME,
  devUserSwitcher: parsed.data.DEV_USER_SWITCHER === "1",
  googleClientIds: parsed.data.GOOGLE_CLIENT_IDS as readonly string[],
  importBodyLimit: parsed.data.IMPORT_BODY_LIMIT,
  importPreviewRateLimit: parsed.data.IMPORT_PREVIEW_RATE_LIMIT,
  importCommitRateLimit: parsed.data.IMPORT_COMMIT_RATE_LIMIT,
  rateLimitStore: parsed.data.RATE_LIMIT_STORE ?? (parsed.data.NODE_ENV === "test" ? "memory" : "postgres"),
  enablePush: parsed.data.ENABLE_PUSH,
  expoAccessToken: parsed.data.EXPO_ACCESS_TOKEN,
  cronSecret: parsed.data.CRON_SECRET,
  schedulerTick: parsed.data.SCHEDULER_TICK === "on",
  sentryDsn: parsed.data.SENTRY_DSN,
  sentryEnvironment: parsed.data.SENTRY_ENVIRONMENT ?? parsed.data.NODE_ENV,
  sentryTracesSampleRate: parsed.data.SENTRY_TRACES_SAMPLE_RATE,
  sentryRelease: parsed.data.SENTRY_RELEASE ?? parsed.data.VERCEL_GIT_COMMIT_SHA,
} as const;
