import { randomUUID } from "node:crypto";

import express from "express";
import request from "supertest";

import { db } from "../../db/client";
import { makeLimiter } from "../../lib/rate-limit";
import { TEST_PREFIX } from "./fixtures";

// The suite otherwise runs every limiter on the memory store (jest.setup.ts).
// This file proves the Postgres store end to end against the live table: a
// limiter whose name is unique to this run, so its rows collide with nothing,
// and an afterAll that deletes exactly those rows. Needs migration
// 20261105130000_rate_limit_store applied to the database under test.
jest.setTimeout(60000);

const name = `${TEST_PREFIX}rl-${randomUUID()}`;

afterAll(async () => {
  await db.$executeRaw`DELETE FROM "RateLimitHit" WHERE "key" LIKE ${`${name}:%`}`;
  await db.$disconnect();
});

describe("makeLimiter with the Postgres store", () => {
  it("counts in RateLimitHit, answers 429 past the limit, and keeps buckets per key", async () => {
    const app = express();
    app.get(
      "/probe",
      makeLimiter({
        name,
        windowMs: 60_000,
        limit: 2,
        store: "postgres",
        keyGenerator: (req) => String(req.headers["x-client"]),
      }),
      (_req, res) => {
        res.json({ data: { ok: true } });
      },
    );

    const hit = (client: string) => request(app).get("/probe").set("x-client", client);

    // Concurrent first hits from one client: the upsert is atomic, so both
    // are counted and the row ends at exactly 2.
    const [a1, a2] = await Promise.all([hit("a"), hit("a")]);
    expect([a1.status, a2.status]).toEqual([200, 200]);

    const a3 = await hit("a");
    expect(a3.status).toBe(429);
    expect(a3.body.error.code).toBe("too_many_requests");

    expect((await hit("b")).status).toBe(200);

    const rows = await db.rateLimitHit.findMany({
      where: { key: { startsWith: `${name}:` } },
      orderBy: { key: "asc" },
    });
    expect(rows.map((r) => [r.key, r.hits])).toEqual([
      [`${name}:a`, 3],
      [`${name}:b`, 1],
    ]);
    expect(rows[0]?.resetAt.getTime() ?? 0).toBeGreaterThan(Date.now());
  });
});
