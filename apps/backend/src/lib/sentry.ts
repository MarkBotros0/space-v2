import * as Sentry from "@sentry/node";
import type { Breadcrumb, ErrorEvent } from "@sentry/node";
import { waitUntil } from "@vercel/functions";

import { config } from "./config";

/**
 * Sentry error reporting. Off unless SENTRY_DSN is set: `initSentry` returns
 * without calling `Sentry.init`, and `reportError` returns before touching
 * the SDK, so an unconfigured deploy behaves exactly as it did before Sentry.
 *
 * Only 5xx and background failures are reported, and only from our own code
 * (middleware/error-handler.ts, lib/background.ts). The SDK's automatic
 * Express capture is switched off: it runs before our terminal handler and
 * would report a thrown ForbiddenError (which carries no status) as a 500.
 */

interface SentryOptions {
  dsn: string | undefined;
  environment: string;
  release: string | undefined;
  tracesSampleRate: number;
}

/** Long enough to send a handful of events, short enough not to hold a
 * serverless instance noticeably past its response. */
const FLUSH_TIMEOUT_MS = 2000;

/** What the SDK may attach on its own. */
const DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpBodies: [],
  httpHeaders: { request: { deny: ["authorization", "cookie", "x-api-key"] }, response: false },
} satisfies NonNullable<Sentry.NodeOptions["dataCollection"]>;

let enabled = false;

/** True once `initSentry` has initialised the SDK with a DSN. */
export function sentryEnabled(): boolean {
  return enabled;
}

/** Initialise Sentry if, and only if, a DSN is configured. Returns whether it did. */
export function initSentry(
  options: SentryOptions = {
    dsn: config.sentryDsn,
    environment: config.sentryEnvironment,
    release: config.sentryRelease,
    tracesSampleRate: config.sentryTracesSampleRate,
  },
): boolean {
  if (!options.dsn) return false;
  Sentry.init({
    dsn: options.dsn,
    environment: options.environment,
    release: options.release,
    tracesSampleRate: options.tracesSampleRate,
    // SDK v11's replacement for `sendDefaultPii: false`: no user details,
    // cookies, request/response bodies or credential headers are collected.
    // scrubEvent below strips them again in case an integration adds any.
    dataCollection: DATA_COLLECTION,
    integrations: [Sentry.expressIntegration({ shouldHandleError: false })],
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  });
  enabled = true;
  return true;
}

/**
 * Report an error and make sure it leaves before a serverless instance is
 * frozen. A no-op while Sentry is off. Never throws: reporting must not turn
 * into a second failure on the error path.
 */
export function reportError(err: unknown, tags?: Record<string, string>): void {
  if (!enabled) return;
  try {
    Sentry.captureException(err, tags ? { tags } : undefined);
    waitUntil(Sentry.flush(FLUSH_TIMEOUT_MS).catch(() => false));
  } catch (reportFailure) {
    console.error("[sentry] report failed:", reportFailure);
  }
}

/** Header names whose values are credentials. Compared lower-case. */
const SECRET_HEADERS = new Set(["authorization", "cookie", "set-cookie", "x-api-key"]);

/** Body/query keys whose values are secrets anywhere in the API. */
const SECRET_KEY = /password|token|secret|authorization|cookie/i;

/** Routes whose whole request body is dropped: login, refresh, password reset,
 * invite acceptance and password change all carry a password or a token. */
const SENSITIVE_BODY_PATH = /\/auth\/|\/password|\/invites?\b|\/accept/i;

const REDACTED = "[redacted]";

function redactKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, inner]) => [
        key,
        SECRET_KEY.test(key) ? REDACTED : redactKeys(inner),
      ]),
    );
  }
  return value;
}

function scrubHeaders(
  headers: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!headers) return headers;
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => !SECRET_HEADERS.has(name.toLowerCase())),
  );
}

/** `beforeSend`: strip credentials and auth-route bodies from an event. */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const request = event.request;
  if (request) {
    request.headers = scrubHeaders(request.headers);
    delete request.cookies;
    if (request.url && SENSITIVE_BODY_PATH.test(request.url)) {
      delete request.data;
    } else if (request.data !== undefined) {
      request.data = redactKeys(request.data);
    }
    if (request.query_string && typeof request.query_string === "object") {
      request.query_string = redactKeys(request.query_string) as typeof request.query_string;
    }
  }
  if (event.user) {
    // Only the numeric id, never an email, name or IP.
    event.user = event.user.id !== undefined ? { id: event.user.id } : {};
  }
  event.breadcrumbs = event.breadcrumbs?.map(scrubBreadcrumb);
  return event;
}

/** `beforeBreadcrumb`: the same scrubbing for breadcrumb data. */
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  if (!breadcrumb.data) return breadcrumb;
  const data = redactKeys(breadcrumb.data) as Record<string, unknown>;
  if (data.headers && typeof data.headers === "object") {
    data.headers = scrubHeaders(data.headers as Record<string, string>);
  }
  return { ...breadcrumb, data };
}
