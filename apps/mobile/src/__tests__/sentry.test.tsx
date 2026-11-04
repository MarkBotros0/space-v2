import * as Sentry from "@sentry/react-native";
import type { ErrorEvent } from "@sentry/react-native";

import { ScreenErrorBoundary } from "../design/layout/error-boundary";
import { initSentry } from "../lib/sentry";
import type * as SentryModule from "../lib/sentry";
import type * as SessionStoreModule from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeScopes, makeUser } from "./helpers/session";

// @sentry/react-native is mocked globally in jest.setup.ts.
const mocked = Sentry as jest.Mocked<typeof Sentry>;
const DSN = "https://key@o1.ingest.sentry.io/1";

/** lib/sentry keeps an "enabled" flag; each test loads a fresh copy (and a
 * fresh session store bound to that copy). */
function load(): {
  sentry: typeof SentryModule;
  store: typeof SessionStoreModule;
} {
  let mods!: ReturnType<typeof load>;
  jest.isolateModules(() => {
    mods = {
      sentry: require("../lib/sentry"),
      store: require("../store/session"),
    };
  });
  return mods;
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.EXPO_PUBLIC_SENTRY_DSN;
});

describe("initSentry", () => {
  it("does not initialise without a DSN", () => {
    const { sentry } = load();
    expect(sentry.initSentry()).toBe(false);
    expect(sentry.initSentry(null)).toBe(false);
    expect(mocked.init).not.toHaveBeenCalled();
    expect(sentry.sentryEnabled()).toBe(false);
  });

  it("leaves the root layout unwrapped and reports nothing while off", () => {
    const { sentry } = load();
    const Root = () => null;
    expect(sentry.wrapRoot(Root)).toBe(Root);
    sentry.reportError(new Error("x"));
    expect(mocked.wrap).not.toHaveBeenCalled();
    expect(mocked.captureException).not.toHaveBeenCalled();
    expect(mocked.setUser).not.toHaveBeenCalled();
  });

  it("initialises from EXPO_PUBLIC_SENTRY_DSN without PII", () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = DSN;
    const { sentry } = load();
    expect(sentry.initSentry()).toBe(true);
    expect(mocked.init).toHaveBeenCalledTimes(1);
    expect(mocked.init.mock.calls[0]?.[0]).toMatchObject({
      dsn: DSN,
      environment: "development",
      sendDefaultPii: false,
    });
    const Root = () => null;
    sentry.wrapRoot(Root);
    expect(mocked.wrap).toHaveBeenCalledWith(Root);
  });

  it("sets the user to id and role only on sign-in, and clears it on sign-out", () => {
    const { sentry, store } = load();
    sentry.initSentry(DSN);
    store.useSessionStore.getState().setSession(makeUser("ADMIN", { id: 42 }), makeScopes());
    expect(mocked.setUser).toHaveBeenLastCalledWith({ id: "42" });
    expect(mocked.setTag).toHaveBeenLastCalledWith("role", "ADMIN");

    store.useSessionStore.getState().clear();
    expect(mocked.setUser).toHaveBeenLastCalledWith(null);
  });
});

// Rendered with the suite's own module instances: an isolated copy would
// bring a second React. "Off" runs first, then this file's lib/sentry is
// switched on for the second test.
describe("ScreenErrorBoundary", () => {
  const error = new Error("render blew up");
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("reports nothing when Sentry is off", () => {
    renderWithProviders(<ScreenErrorBoundary error={error} retry={jest.fn()} />);
    expect(mocked.captureException).not.toHaveBeenCalled();
  });

  it("reports the caught render error when Sentry is on", () => {
    initSentry(DSN);
    renderWithProviders(<ScreenErrorBoundary error={error} retry={jest.fn()} />);
    expect(mocked.captureException).toHaveBeenCalledTimes(1);
    expect(mocked.captureException).toHaveBeenCalledWith(error);
  });
});

describe("scrubbing", () => {
  const { sentry } = load();

  it("drops the Authorization header, tokens and user details from events", () => {
    const event = sentry.scrubEvent({
      type: undefined,
      message: "failed at spacev2://reset-password?token=abc123",
      request: {
        url: "https://api/x?token=abc123&a=1",
        headers: { Authorization: "Bearer t", Accept: "json" },
        data: { password: "p", name: "n" },
      },
      user: { id: "7", email: "a@b.c", username: "Ann" },
    } as ErrorEvent);
    expect(event.message).toBe("failed at spacev2://reset-password?token=[redacted]");
    expect(event.request?.url).toBe("https://api/x?token=[redacted]&a=1");
    expect(event.request?.headers).toEqual({ Accept: "json" });
    expect(event.request?.data).toEqual({ password: "[redacted]", name: "n" });
    expect(event.user).toEqual({ id: "7" });
  });

  it("scrubs breadcrumb data", () => {
    const crumb = sentry.scrubBreadcrumb({
      category: "xhr",
      data: {
        url: "https://api/auth/refresh?refreshToken=r",
        request_headers: { authorization: "Bearer t" },
        status_code: 200,
      },
    });
    expect(crumb.data).toEqual({
      url: "https://api/auth/refresh?refreshToken=[redacted]",
      request_headers: {},
      status_code: 200,
    });
  });
});
