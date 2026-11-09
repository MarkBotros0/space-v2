import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestUser, login } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

beforeAll(async () => {
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("GET /api/v1/me — the two spec-flagged fixes", () => {
  it("returns user: null for a soft-deleted row (spec 11 §7's live inconsistency)", async () => {
    const ghost = await createTestUser("ghost", "STUDENT");
    const ghostToken = await login(app, ghost.email);
    await db.user.update({ where: { id: ghost.id }, data: { deletedAt: new Date() } });

    const res = await request(app).get("/api/v1/me").set("authorization", `Bearer ${ghostToken}`);
    expect(res.status).toBe(200);
    // packages/shared/src/auth.ts:53 documented this and me.ts didn't do it.
    expect(res.body.data.user).toBeNull();
  });

  it("carries hasPassword so the settings screen can branch before submitting (R27)", async () => {
    const withPw = await createTestUser("has-pw", "STUDENT");
    const token = await login(app, withPw.email);
    const res = await request(app).get("/api/v1/me").set("authorization", `Bearer ${token}`);
    expect(res.body.data.user.hasPassword).toBe(true);
  });
});

describe("PATCH /api/v1/me", () => {
  it("updates the caller's own name — trimmed — and returns the row (spec 18 R21/R23)", async () => {
    const u = await createTestUser("rename", "STUDENT");
    const token = await login(app, u.email);
    const res = await request(app)
      .patch("/api/v1/me")
      .set("authorization", `Bearer ${token}`)
      .send({ name: "  Renamed Person  " });
    expect(res.status).toBe(200);
    expect(res.body.data.user.name).toBe("Renamed Person");
  });

  it("refuses a body-supplied subject id — self-scope by construction (spec 18 §4)", async () => {
    const u = await createTestUser("no-subject", "STUDENT");
    const token = await login(app, u.email);
    const res = await request(app)
      .patch("/api/v1/me")
      .set("authorization", `Bearer ${token}`)
      .send({ name: "Fine Name", userId: 1 });
    expect(res.status).toBe(400);
  });
});
