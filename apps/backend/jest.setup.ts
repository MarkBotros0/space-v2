import path from "node:path";

import dotenv from "dotenv";

// Load apps/backend/.env first (same file `src/lib/config.ts` loads via
// `import "dotenv/config"`), so a real local .env still wins when present.
dotenv.config({ path: path.resolve(__dirname, ".env") });

// `src/lib/config.ts` throws at module load if these are missing, which
// breaks the unit suite on a clean checkout with no .env (e.g. CI). The unit
// suite never touches the database or signs tokens that need to match a real
// secret, so these placeholders only need to satisfy Zod's `.min(1)` checks —
// they must never override a real value that's already set.
process.env.DATABASE_URL ||= "postgresql://user:pass@localhost:5432/db";
process.env.AUTH_SECRET ||= "unit-test-placeholder-secret";

// Uploads default OFF in deployment (see ENABLE_UPLOADS in src/lib/config.ts)
// while file handling moves to a CMS, but the upload endpoint still exists and
// still needs its coverage. Forced rather than `||=` so the suite does not
// depend on whatever a developer happens to have in .env. The disabled path is
// covered separately by src/__tests__/upload-guard.test.ts, which overrides
// config directly.
process.env.ENABLE_UPLOADS = "true";
