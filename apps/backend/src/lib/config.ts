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
  // Email is optional. When GMAIL_USER/GMAIL_APP_PASSWORD are unset,
  // sendNotificationEmail becomes a no-op and in-app notifications still land.
  GMAIL_USER: z.string().optional(),
  GMAIL_APP_PASSWORD: z.string().optional(),
  // Base URL used to turn a notification's relative link into one a recipient
  // can click in an email. Unset means the email omits the button.
  AUTH_URL: z.string().optional(),
  // "local" writes to LOCAL_UPLOADS_DIR; "s3" is stubbed and throws on use.
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  LOCAL_UPLOADS_DIR: z.string().default("./uploads"),
  // Hard ceiling on a single upload. multer buffers the whole file in memory
  // before the per-assignment maxFileSizeMb check can run, so this bounds what
  // one request can allocate. 25 MB.
  // Invite acceptance window. 168h = 7 days, deliberately longer than v1's 72h
  // default: the invite is delivered to email and typed into a phone, and v1's
  // TTL never mattered because no invite was ever acceptable (spec 11 D1).
  INVITE_TOKEN_TTL_HOURS: z.coerce.number().int().positive().default(168),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(25 * 1024 * 1024),
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
  // Cutover freeze (Plan 18, R5 -> R15). When "true", every non-GET/HEAD/OPTIONS
  // request is refused with 503 read_only before its body is read, except the
  // three auth endpoints that only write session bookkeeping. Defaults OFF.
  // Hosting applies an env change only on a new deployment - flipping it is a
  // redeploy, and the runbook says so.
  READ_ONLY: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  // URL scheme the mobile app registers (apps/mobile/app.json "scheme").
  // Password-reset emails link to <scheme>://reset-password?token=… (Plan 10
  // Decision 10). A custom-scheme link is never fetched over HTTP, so the
  // token never reaches a proxy log, a CDN log or a Referer header.
  MOBILE_APP_SCHEME: z
    .string()
    .regex(/^[a-z][a-z0-9+.-]*$/, "must be a bare URL scheme, e.g. spacev2")
    .default("spacev2"),
  // Body limit for the import routes only (routes/imports.ts). The global
  // parser keeps body-parser's 100 KB default; a 256 KB paste and a 2000-row
  // commit resubmitting every cell need more. Any body-parser size string.
  IMPORT_BODY_LIMIT: z.string().default("2mb"),
  // Import rate limits per 15 minutes (spec D18). Configurable so the
  // integration suite, which commits ~22 times from one IP, can lift them.
  IMPORT_PREVIEW_RATE_LIMIT: z.coerce.number().int().positive().default(30),
  IMPORT_COMMIT_RATE_LIMIT: z.coerce.number().int().positive().default(10),
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
const presentEnv = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => value !== ""),
);

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
  authUrl: parsed.data.AUTH_URL,
  storageDriver: parsed.data.STORAGE_DRIVER,
  localUploadsDir: parsed.data.LOCAL_UPLOADS_DIR,
  maxUploadBytes: parsed.data.MAX_UPLOAD_BYTES,
  enableUploads: parsed.data.ENABLE_UPLOADS,
  inviteTokenTtlHours: parsed.data.INVITE_TOKEN_TTL_HOURS,
  enableApiDocs: parsed.data.ENABLE_API_DOCS,
  readOnly: parsed.data.READ_ONLY,
  mobileAppScheme: parsed.data.MOBILE_APP_SCHEME,
  importBodyLimit: parsed.data.IMPORT_BODY_LIMIT,
  importPreviewRateLimit: parsed.data.IMPORT_PREVIEW_RATE_LIMIT,
  importCommitRateLimit: parsed.data.IMPORT_COMMIT_RATE_LIMIT,
} as const;
