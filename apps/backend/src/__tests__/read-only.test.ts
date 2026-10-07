// apps/backend/src/__tests__/read-only.test.ts
/**
 * READ_ONLY=true — the cutover freeze (Plan 18 R5 → R15).
 *
 * Unit test, no database: the guard sits in front of the body parsers and
 * every router, so a refused write never reaches Prisma. If this file ever
 * needs a live database, the guard has drifted behind a DB call.
 */
jest.mock("../lib/config", () => {
  const actual: { config: Record<string, unknown> } = jest.requireActual("../lib/config");
  return { config: { ...actual.config, readOnly: true } };
});

import request from "supertest";

import { createApp } from "../app";

const app = createApp();

describe("read-only mode", () => {
  it("refuses a write with 503 read_only, before the body is parsed", async () => {
    // Malformed JSON would be a 400 bad_request if express.json() ran first.
    const res = await request(app)
      .post("/api/v1/me/password")
      .set("content-type", "application/json")
      .send("{not json");
    expect(res.status).toBe(503);
    expect(res.headers["retry-after"]).toBe("600");
    expect(res.body).toEqual({
      error: {
        code: "read_only",
        message: "JPC Space is in read-only maintenance. Please try again shortly.",
      },
    });
  });

  it.each(["put", "patch", "delete"] as const)("refuses %s too", async (method) => {
    const res = await request(app)[method]("/api/v1/submissions/abcdefghij");
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("read_only");
  });

  it("refuses before authentication — an anonymous write gets 503, not 401", async () => {
    const res = await request(app).post("/api/v1/sessions/check-in").send({ token: "x" });
    expect(res.status).toBe(503);
  });

  it("serves reads: an unknown GET still reaches the 404 handler", async () => {
    const res = await request(app).get("/api/v1/definitely-not-a-route");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });

  it.each(["/api/v1/auth/login", "/api/v1/auth/refresh", "/api/v1/auth/logout"])(
    "lets %s through (session bookkeeping only) — it fails on its own validation",
    async (path) => {
      const res = await request(app).post(path).send({});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("bad_request");
    },
  );

  it("does not let a look-alike path through", async () => {
    const res = await request(app).post("/api/v1/auth/login/extra").send({});
    expect(res.status).toBe(503);
  });
});
