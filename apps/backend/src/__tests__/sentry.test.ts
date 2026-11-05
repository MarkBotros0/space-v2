import type { ErrorEvent } from "@sentry/node";
import express from "express";
import request from "supertest";

import { ForbiddenError } from "../lib/auth/errors";
import { initSentry } from "../lib/sentry";
import type * as SentryModule from "../lib/sentry";
import { errorHandler } from "../middleware/error-handler";

const mockInit = jest.fn();
const mockCapture = jest.fn();
const mockFlush = jest.fn(() => Promise.resolve(true));

jest.mock("@sentry/node", () => ({
  init: (...args: unknown[]) => mockInit(...args),
  captureException: (...args: unknown[]) => mockCapture(...args),
  flush: () => mockFlush(),
  expressIntegration: (options: unknown) => ({ name: "Express", options }),
}));

const mockWaitUntil = jest.fn();
jest.mock("@vercel/functions", () => ({
  waitUntil: (p: Promise<unknown>) => mockWaitUntil(p),
}));

/** lib/sentry keeps an "enabled" flag, so these tests each get a fresh module. */
function loadSentry(): typeof SentryModule {
  let mod!: typeof SentryModule;
  jest.isolateModules(() => {
    mod = require("../lib/sentry");
  });
  return mod;
}

const DSN = "https://k@o1.ingest.sentry.io/1";
const options = { environment: "test", release: undefined, tracesSampleRate: 0 };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("initSentry", () => {
  it("does not initialise without a DSN", () => {
    const sentry = loadSentry();
    expect(sentry.initSentry({ ...options, dsn: undefined })).toBe(false);
    expect(mockInit).not.toHaveBeenCalled();
    expect(sentry.sentryEnabled()).toBe(false);
  });

  it("does not initialise with the default (DSN-less) config", () => {
    // jest.setup.ts sets no SENTRY_DSN, so config.sentryDsn is undefined.
    const sentry = loadSentry();
    expect(sentry.initSentry()).toBe(false);
    expect(mockInit).not.toHaveBeenCalled();
  });

  it("initialises with a DSN, without PII and without auto Express capture", () => {
    const sentry = loadSentry();
    expect(sentry.initSentry({ ...options, dsn: DSN })).toBe(true);
    expect(mockInit).toHaveBeenCalledTimes(1);
    const init = mockInit.mock.calls[0][0];
    expect(init).toMatchObject({
      dsn: DSN,
      environment: "test",
      tracesSampleRate: 0,
      dataCollection: expect.objectContaining({ userInfo: false, cookies: false, httpBodies: [] }),
    });
    expect(init.integrations).toEqual([{ name: "Express", options: { shouldHandleError: false } }]);
    expect(sentry.sentryEnabled()).toBe(true);
  });
});

describe("reportError", () => {
  it("is a no-op while Sentry is off", () => {
    loadSentry().reportError(new Error("x"));
    expect(mockCapture).not.toHaveBeenCalled();
    expect(mockFlush).not.toHaveBeenCalled();
  });

  it("captures and registers a flush with waitUntil when on", () => {
    const sentry = loadSentry();
    sentry.initSentry({ ...options, dsn: DSN });
    const err = new Error("boom");
    sentry.reportError(err, { background: "push" });
    expect(mockCapture).toHaveBeenCalledWith(err, { tags: { background: "push" } });
    expect(mockFlush).toHaveBeenCalled();
    expect(mockWaitUntil).toHaveBeenCalled();
  });
});

describe("scrubEvent", () => {
  const { scrubEvent, scrubBreadcrumb } = loadSentry();

  it("drops credential headers, cookies and auth-route bodies", () => {
    const event = scrubEvent({
      type: undefined,
      request: {
        url: "https://api.example/api/v1/auth/login",
        headers: { Authorization: "Bearer abc", cookie: "a=b", "user-agent": "x" },
        cookies: { a: "b" },
        data: { email: "a@b.c", password: "hunter2" },
      },
      user: { id: "7", email: "a@b.c", username: "Ann", ip_address: "1.2.3.4" },
    } as ErrorEvent);
    expect(event.request?.headers).toEqual({ "user-agent": "x" });
    expect(event.request?.cookies).toBeUndefined();
    expect(event.request?.data).toBeUndefined();
    expect(event.user).toEqual({ id: "7" });
  });

  it("redacts secret keys in other bodies and in breadcrumbs", () => {
    const event = scrubEvent({
      type: undefined,
      request: { url: "https://api.example/api/v1/groups", data: { name: "G", token: "t" } },
      breadcrumbs: [{ data: { headers: { authorization: "Bearer x" }, refreshToken: "r" } }],
    } as ErrorEvent);
    expect(event.request?.data).toEqual({ name: "G", token: "[redacted]" });
    expect(event.breadcrumbs?.[0]?.data).toEqual({ headers: {}, refreshToken: "[redacted]" });
    expect(scrubBreadcrumb({ data: { status_code: 500 } }).data).toEqual({ status_code: 500 });
  });
});

describe("errorHandler", () => {
  function appThrowing(err: Error): express.Express {
    const app = express();
    app.get("/boom", () => {
      throw err;
    });
    app.use(errorHandler);
    return app;
  }

  it("reports nothing while Sentry is off", async () => {
    const res = await request(appThrowing(new Error("db down"))).get("/boom");
    expect(res.status).toBe(500);
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("keeps the internal_error envelope and reports a 500 when enabled", async () => {
    // Enables the lib/sentry instance errorHandler imported (not an isolated one).
    initSentry({ ...options, dsn: DSN });
    const err = new Error("db down");

    const res = await request(appThrowing(err)).get("/boom");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: "internal_error", message: "An unexpected error occurred." },
    });
    expect(JSON.stringify(res.body)).not.toContain("db down");
    expect(mockCapture).toHaveBeenCalledWith(err, { tags: { route: "GET /boom" } });
  });

  it("does not report a 4xx", async () => {
    const res = await request(appThrowing(new ForbiddenError())).get("/boom");
    expect(res.status).toBe(403);
    expect(mockCapture).not.toHaveBeenCalled();
  });
});
