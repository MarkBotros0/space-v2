/**
 * Sentry bootstrap. Imported first by both entrypoints (src/server.ts and
 * api/index.js) so the SDK is set up before Express and the routes load, as
 * Sentry's Node setup requires. Does nothing while SENTRY_DSN is unset.
 */
import { initSentry } from "./lib/sentry";

initSentry();
