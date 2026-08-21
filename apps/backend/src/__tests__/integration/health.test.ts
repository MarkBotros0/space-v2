import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";

// 60s, not the Jest default: the shared Neon staging database autosuspends, so
// the first query after idle costs ~18s and this suite's beforeAll performs
// several sequential writes.
jest.setTimeout(60000);

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
