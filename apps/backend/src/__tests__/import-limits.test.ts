// apps/backend/src/__tests__/import-limits.test.ts
import express from "express";
import request from "supertest";

import { errorHandler } from "../middleware/error-handler";

describe("body limits", () => {
  it("maps an over-limit JSON body to 413 payload_too_large, not 500", async () => {
    const app = express();
    app.post("/x", express.json({ limit: "1kb" }), (_req, res) => {
      res.json({ data: {} });
    });
    app.use(errorHandler);
    const res = await request(app)
      .post("/x")
      .set("content-type", "application/json")
      .send(JSON.stringify({ text: "x".repeat(4096) }));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("payload_too_large");
  });
});
