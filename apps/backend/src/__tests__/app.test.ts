import request from "supertest";

import { createApp } from "../app";

describe("error handling", () => {
  it("returns the envelope shape for malformed JSON instead of leaking a stack trace", async () => {
    const res = await request(createApp())
      .post("/api/v1/auth/login")
      .set("Content-Type", "application/json")
      .send("{not valid json");

    expect(res.status).toBe(400);
    expect(res.headers["content-type"]).toMatch(/json/);
    expect(res.body).toEqual({ error: { code: "bad_request", message: "Invalid JSON body." } });
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\(.*:\d+:\d+\)/); // no stack frame lines
  });

  it("returns the envelope shape for an unknown path", async () => {
    const res = await request(createApp()).get("/this/route/does/not/exist");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: "not_found", message: "The requested resource was not found." },
    });
  });
});

describe("CORS", () => {
  // The allowlist and the router drifted once already: PUT
  // /submissions/by-assignment/:assignmentId shipped while the list still read
  // GET/POST/PATCH/DELETE/OPTIONS, so a browser client's preflight was refused
  // for an endpoint that existed. Deriving the list from the router is more
  // machinery than it is worth; asserting every verb the API actually uses is
  // enough to catch the next omission.
  it.each(["GET", "POST", "PUT", "PATCH", "DELETE"])(
    "allows %s through the preflight",
    async (method) => {
      const res = await request(createApp())
        .options("/api/v1/health")
        .set("Origin", "http://localhost:8081")
        .set("Access-Control-Request-Method", method);

      expect(res.headers["access-control-allow-methods"]).toContain(method);
    },
  );
});

describe("routers mounted on the shared /api/v1 prefix (ruling X5)", () => {
  it("leaves an unknown /api/v1 path a not_found 404, not a 401", async () => {
    // forumRouter and videoQuizRouter mount at /api/v1. If either ever gains a
    // router-wide `use(requireAuth)`, this anonymous request is refused with
    // 401 before it can reach the catch-all, and the envelope CLAUDE.md
    // promises for unknown paths is gone.
    const res = await request(createApp()).get("/api/v1/space-v2-no-such-route");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });
});
