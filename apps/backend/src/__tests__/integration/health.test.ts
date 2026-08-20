import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";

jest.setTimeout(15000);

afterAll(async () => {
  await db.$disconnect();
});

describe("GET /health", () => {
  it("reports ok and reaches the database", async () => {
    const res = await request(createApp()).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("ok");
    expect(res.body.data.database).toBe("up");
  });
});
