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
