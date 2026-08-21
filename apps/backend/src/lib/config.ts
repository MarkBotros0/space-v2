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
  gmailUser: parsed.data.GMAIL_USER,
  gmailAppPassword: parsed.data.GMAIL_APP_PASSWORD,
  authUrl: parsed.data.AUTH_URL,
  storageDriver: parsed.data.STORAGE_DRIVER,
  localUploadsDir: parsed.data.LOCAL_UPLOADS_DIR,
  maxUploadBytes: parsed.data.MAX_UPLOAD_BYTES,
  enableUploads: parsed.data.ENABLE_UPLOADS,
  enableApiDocs: parsed.data.ENABLE_API_DOCS,
} as const;
