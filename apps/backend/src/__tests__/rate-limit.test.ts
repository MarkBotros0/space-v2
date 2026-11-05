const mockDb = { $queryRaw: jest.fn(), $executeRaw: jest.fn() };
jest.mock("../db/client", () => ({ db: mockDb }));

import express, { type RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import request from "supertest";

import { config } from "../lib/config";
import { makeLimiter, rateLimitHandler } from "../lib/rate-limit";

function appWith(limiter: RequestHandler) {
  const app = express();
  app.get("/probe", limiter, (_req, res) => {
    res.json({ data: { ok: true } });
  });
  return app;
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe("rateLimitHandler", () => {
  it("answers 429 inside the { error: { code, message } } envelope, not express-rate-limit's plain text", async () => {
    const app = appWith(rateLimit({ windowMs: 60_000, limit: 1, handler: rateLimitHandler }));

    expect((await request(app).get("/probe")).status).toBe(200);
    const limited = await request(app).get("/probe");
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({
      error: { code: "too_many_requests", message: "Too many requests. Please try again later." },
    });
  });
});

describe("makeLimiter", () => {
  it("uses the memory store under NODE_ENV=test, so the suites keep per-process counters", () => {
    expect(config.rateLimitStore).toBe("memory");
  });

  it("limits with the envelope and the draft-7 RateLimit headers", async () => {
    const app = appWith(makeLimiter({ name: "probe", windowMs: 60_000, limit: 1 }));

    const first = await request(app).get("/probe");
    expect(first.status).toBe(200);
    expect(first.headers["ratelimit"]).toMatch(/limit=1, remaining=0/);
    expect(first.headers["x-ratelimit-limit"]).toBeUndefined();

    const second = await request(app).get("/probe");
    expect(second.status).toBe(429);
    expect(second.body.error.code).toBe("too_many_requests");
    expect(mockDb.$queryRaw).not.toHaveBeenCalled();
  });

  it("honours a custom keyGenerator", async () => {
    const app = appWith(
      makeLimiter({
        name: "probe-keyed",
        windowMs: 60_000,
        limit: 1,
        keyGenerator: (req) => String(req.headers["x-user"]),
      }),
    );
    expect((await request(app).get("/probe").set("x-user", "a")).status).toBe(200);
    expect((await request(app).get("/probe").set("x-user", "b")).status).toBe(200);
    expect((await request(app).get("/probe").set("x-user", "a")).status).toBe(429);
  });

  it("counts through Postgres with the limiter's prefix when the store is postgres", async () => {
    const resetAt = new Date(Date.now() + 60_000);
    mockDb.$queryRaw
      .mockResolvedValueOnce([{ hits: 1, resetAt }])
      .mockResolvedValueOnce([{ hits: 2, resetAt }]);
    const app = appWith(
      makeLimiter({
        name: "probe-pg",
        windowMs: 60_000,
        limit: 1,
        store: "postgres",
        keyGenerator: () => "client",
      }),
    );

    expect((await request(app).get("/probe")).status).toBe(200);
    const limited = await request(app).get("/probe");
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("too_many_requests");
    expect((mockDb.$queryRaw.mock.calls[0] as unknown[]).slice(1)).toEqual([
      "probe-pg:client",
      60_000,
    ]);
  });

  it("lets the request through and logs when the store fails", async () => {
    mockDb.$queryRaw.mockRejectedValue(new Error("database unreachable"));
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    const app = appWith(
      makeLimiter({
        name: "probe-down",
        windowMs: 60_000,
        limit: 1,
        store: "postgres",
        keyGenerator: () => "c",
      }),
    );

    const res = await request(app).get("/probe");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { ok: true } });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
