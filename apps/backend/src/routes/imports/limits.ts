import express from "express";

import { config } from "../../lib/config";
// The one 429 handler (ruling X4: Plan 9 extracted it; no copies anywhere).
import { makeLimiter } from "../../lib/rate-limit";

/**
 * Spec D18/R84: neither importer is rate-limited in v1, where the
 * server-action transport makes that hard to notice. As HTTP endpoints taking
 * a 256 KB paste and a 2000-row commit, both want one.
 *
 * A factory, and the limits come from config (defaults 30 / 10 per 15 min):
 * the integration suite commits ~22 times from one IP, so jest.setup.ts lifts
 * both limits under test, and the 429 behaviour itself is proven by a unit
 * test that builds `importLimiter("import-test", 1)` directly (import-limits.test.ts).
 */
export function importLimiter(name: string, limit: number) {
  return makeLimiter({ name, limit });
}
export const previewLimiter = importLimiter("import-preview", config.importPreviewRateLimit);
export const commitLimiter = importLimiter("import-commit", config.importCommitRateLimit);

/**
 * This router's own JSON parser, with an explicit limit.
 *
 * The global `express.json()` in app.ts keeps body-parser's 100 KB default,
 * which a legal 256 KB paste — and a 2000-row commit that resubmits every cell
 * — both exceed; the overflow would surface as an unmapped `entity.too.large`
 * and a 500. These routers are therefore mounted in app.ts BEFORE the global
 * parser, and every POST lists `importJsonParser` itself, AFTER its limiter so
 * a throttled request is refused before its body is read. Nothing else in the
 * API gets the larger limit.
 */
export const importJsonParser = express.json({ limit: config.importBodyLimit });
