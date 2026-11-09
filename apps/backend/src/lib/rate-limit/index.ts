import rateLimit, {
  MemoryStore,
  type Options as RateLimitOptions,
  type RateLimitRequestHandler,
  type Store,
} from "express-rate-limit";

import { config } from "../config";
import { rateLimitHandler } from "./handler";
import { PostgresStore } from "./postgres-store";
import { MS_PER_MINUTE } from "../org-time";

export { rateLimitHandler } from "./handler";
export { PostgresStore } from "./postgres-store";

type RateLimitStoreKind = "postgres" | "memory";

interface LimiterSpec {
  /**
   * Unique per limiter: it becomes the store's key prefix (`auth:<ip>`), so
   * two limiters keyed on the same IP or user id never share a bucket.
   */
  name: string;
  /** Defaults to RATE_LIMIT_WINDOW_MS. */
  windowMs?: number;
  limit: number;
  /** Defaults to express-rate-limit's IP key (req.ip, see TRUST_PROXY). */
  keyGenerator?: RateLimitOptions["keyGenerator"];
  /** Overrides RATE_LIMIT_STORE; for tests that need a specific store. */
  store?: RateLimitStoreKind;
}

function storeFor(kind: RateLimitStoreKind, name: string): Store {
  return kind === "postgres" ? new PostgresStore(name) : new MemoryStore();
}

/**
 * Every limiter in the backend, built one way: the store chosen by
 * RATE_LIMIT_STORE (shared Postgres counters by default), the
 * too_many_requests envelope, and the IETF draft-7 `RateLimit` /
 * `RateLimit-Policy` headers instead of the legacy `X-RateLimit-*` set.
 *
 * passOnStoreError: if the database is unreachable the store throws, and
 * express-rate-limit logs the error and lets the request through. Refusing
 * every login because the counter table is down would turn a database blip
 * into a total outage; a request that gets through un-counted is the cheaper
 * failure.
 */
/** The window every limiter uses unless it names its own. */
export const RATE_LIMIT_WINDOW_MS = 15 * MS_PER_MINUTE;

export function makeLimiter(spec: LimiterSpec): RateLimitRequestHandler {
  return rateLimit({
    windowMs: spec.windowMs ?? RATE_LIMIT_WINDOW_MS,
    limit: spec.limit,
    handler: rateLimitHandler,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    passOnStoreError: true,
    store: storeFor(spec.store ?? config.rateLimitStore, spec.name),
    ...(spec.keyGenerator ? { keyGenerator: spec.keyGenerator } : {}),
  });
}
