import * as Sentry from "@sentry/react-native";
import type { Breadcrumb, ErrorEvent } from "@sentry/react-native";
import type { ComponentType } from "react";

import { useSessionStore } from "../store/session";
import { sentryDsn, sentryEnvironment } from "./app-config";

/**
 * Crash and error reporting. Completely off unless the build sets
 * EXPO_PUBLIC_SENTRY_DSN: `initSentry` never calls `Sentry.init`, `wrapRoot`
 * returns the layout untouched, and every other export returns before
 * touching the SDK.
 *
 * Release and dist are left to the SDK: it reads them from the native app
 * (bundle id, version, build number), which is what the build-time
 * source-map upload tags its maps with. Setting them by hand stops the two
 * matching (docs.sentry.io, React Native "Releases").
 *
 * Privacy: no email, name or IP ever goes out. The user is the numeric id and
 * the role, nothing else; tokens and the Authorization header are scrubbed
 * from events and breadcrumbs.
 */

let enabled = false;

export function sentryEnabled(): boolean {
  return enabled;
}

/** Initialise Sentry if, and only if, a DSN is configured. Returns whether it did. */
export function initSentry(
  dsn: string | null = sentryDsn(),
  environment: string = sentryEnvironment(),
): boolean {
  if (!dsn || enabled) return enabled;
  Sentry.init({
    dsn,
    environment,
    sendDefaultPii: false,
    // Errors only; no performance tracing quota spent.
    tracesSampleRate: 0,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  });
  enabled = true;
  syncSentryUser();
  return true;
}

/** `Sentry.wrap` the root layout when Sentry is on; the layout itself when off. */
export function wrapRoot<P extends Record<string, unknown>>(
  Root: ComponentType<P>,
): ComponentType<P> {
  // Text extraction would read a touched row's visible text (a student's name,
  // a note body) into the breadcrumb; scrubBreadcrumb drops what is left.
  return enabled
    ? Sentry.wrap(Root, { touchEventBoundaryProps: { extractTextFromChildren: false } })
    : Root;
}

/** Report a caught error. A no-op while Sentry is off. */
export function reportError(err: unknown): void {
  if (!enabled) return;
  Sentry.captureException(err);
}

let unsubscribeUser: (() => void) | null = null;

/**
 * Keep Sentry's user in step with the session store: set on sign-in and boot
 * restore, cleared on sign-out and on a forced sign-out after a failed
 * refresh. Subscribing to the store, rather than calling from each hook,
 * catches every path that changes the user.
 */
function syncSentryUser(): void {
  unsubscribeUser?.();
  let current: number | null = null;
  const apply = (user: { id: number; role: string } | null) => {
    const next = user?.id ?? null;
    if (next === current) return;
    current = next;
    if (user) {
      Sentry.setUser({ id: String(user.id) });
      Sentry.setTag("role", user.role);
    } else {
      Sentry.setUser(null);
      Sentry.setTag("role", undefined);
    }
  };
  apply(useSessionStore.getState().user);
  unsubscribeUser = useSessionStore.subscribe((state) => apply(state.user));
}

const SECRET_KEY = /password|token|secret|authorization|cookie/i;
const SECRET_HEADERS = new Set(["authorization", "cookie", "set-cookie"]);
/** `token=…` in a URL or message: reset-password and invite deep links carry one. */
const TOKEN_IN_TEXT = /((?:token|code|refreshToken|accessToken)=)[^&#\s]+/gi;
const REDACTED = "[redacted]";
const TOUCH_MESSAGE = "Touch event";

function scrubText<T>(value: T): T {
  return (typeof value === "string" ? value.replace(TOKEN_IN_TEXT, `$1${REDACTED}`) : value) as T;
}

function scrubValue(value: unknown): unknown {
  if (typeof value === "string") return scrubText(value);
  if (Array.isArray(value)) return value.map(scrubValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !SECRET_HEADERS.has(key.toLowerCase()))
        .map(([key, inner]) => [key, SECRET_KEY.test(key) ? REDACTED : scrubValue(inner)]),
    );
  }
  return value;
}

/** `beforeSend`: strip credentials, tokens and any user detail beyond the id. */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    const { headers, data, url, query_string } = event.request;
    event.request = {
      ...event.request,
      url: scrubText(url),
      headers: headers ? (scrubValue(headers) as Record<string, string>) : headers,
      data: data === undefined ? data : scrubValue(data),
      query_string: scrubValue(query_string) as typeof query_string,
      cookies: undefined,
    };
  }
  if (event.user) event.user = event.user.id !== undefined ? { id: event.user.id } : {};
  if (event.message) event.message = scrubText(event.message);
  event.breadcrumbs = event.breadcrumbs?.map(scrubBreadcrumb);
  return event;
}

/** `beforeBreadcrumb`: the same for breadcrumbs (fetch/xhr URLs, navigation params). */
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  // A touch breadcrumb names the touched element from its accessibility label
  // or text (a ListRow's title, subtitle and chip: a student's name, a note
  // body). Keep that a touch happened and nothing about what was touched.
  if (breadcrumb.category === "touch") {
    const { data: _data, ...rest } = breadcrumb;
    return { ...rest, message: TOUCH_MESSAGE };
  }
  return {
    ...breadcrumb,
    message: scrubText(breadcrumb.message),
    data: breadcrumb.data ? (scrubValue(breadcrumb.data) as Breadcrumb["data"]) : breadcrumb.data,
  };
}
