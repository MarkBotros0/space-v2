import express from "express";
import rateLimit from "express-rate-limit";
import request from "supertest";

import { rateLimitHandler } from "../lib/rate-limit";

describe("rateLimitHandler", () => {
  it("answers 429 inside the { error: { code, message } } envelope, not express-rate-limit's plain text", async () => {
    const app = express();
    app.get("/probe", rateLimit({ windowMs: 60_000, limit: 1, handler: rateLimitHandler }), (_req, res) => {
      res.json({ data: { ok: true } });
    });

    expect((await request(app).get("/probe")).status).toBe(200);
    const limited = await request(app).get("/probe");
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({
      error: { code: "too_many_requests", message: "Too many requests. Please try again later." },
    });
  });
});
