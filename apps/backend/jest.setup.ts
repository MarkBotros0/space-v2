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
