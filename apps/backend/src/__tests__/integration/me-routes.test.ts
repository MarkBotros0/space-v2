import { randomUUID } from "node:crypto";

import bcrypt from "bcryptjs";
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";

jest.setTimeout(60000);

// Runs against the shared live staging database. Same discipline as
// auth-routes.test.ts: a unique email per run, and every cleanup scoped to the
// space-v2-test- prefix so a row outside this suite can never be touched.
const EMAIL_PREFIX = "space-v2-test-";
const EMAIL_SUFFIX = "@jpc.test";
const EMAIL = `${EMAIL_PREFIX}${randomUUID()}${EMAIL_SUFFIX}`;
const PASSWORD = "correct-horse-battery";

const testAccountFilter = { email: { startsWith: EMAIL_PREFIX, endsWith: EMAIL_SUFFIX } } as const;

const app = createApp();
let userId: number;
let accessToken: string;
let refreshToken: string;

beforeAll(async () => {
  await db.user.deleteMany({ where: testAccountFilter });
  const user = await db.user.create({
    data: {
      email: EMAIL,
      name: "Me Route Test User",
      role: "STUDENT",
      passwordHash: await bcrypt.hash(PASSWORD, 10),
    },
  });
  userId = user.id;

  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: EMAIL, password: PASSWORD });
  accessToken = login.body.data.accessToken;
  refreshToken = login.body.data.refreshToken;
});

afterAll(async () => {
  await db.refreshToken.deleteMany({ where: { userId } });
  await db.user.deleteMany({ where: { id: userId } });
  await db.$disconnect();
});

describe("GET /api/v1/me", () => {
  it("returns the user record and scopes for a valid token", async () => {
    const res = await request(app).get("/api/v1/me").set("authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user).toEqual({
      id: userId,
      name: "Me Route Test User",
      email: EMAIL,
      role: "STUDENT",
      avatarPath: null,
    });
    expect(res.body.data.scopes).toEqual({
      seasonAdminIds: [],
      groupLeaderIds: [],
      activeSeasonId: null,
    });
  });

  it("returns 401 when the Authorization header is missing", async () => {
    const res = await request(app).get("/api/v1/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
  });

  it("returns 401 when the scheme is not Bearer", async () => {
    const res = await request(app).get("/api/v1/me").set("authorization", `Basic ${accessToken}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
  });

  it("returns 401 for a malformed token", async () => {
    const res = await request(app).get("/api/v1/me").set("authorization", "Bearer not-a-jwt");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
  });
});

describe("POST /api/v1/auth/logout", () => {
  it("revokes the refresh token so it can no longer be rotated", async () => {
    const logout = await request(app).post("/api/v1/auth/logout").send({ refreshToken });
    expect(logout.status).toBe(200);
    expect(logout.body.data).toEqual({ ok: true });

    const refresh = await request(app).post("/api/v1/auth/refresh").send({ refreshToken });
    expect(refresh.status).toBe(401);
    expect(refresh.body.error.code).toBe("invalid_token");
  });

  it("returns 400 when refreshToken is missing", async () => {
    const res = await request(app).post("/api/v1/auth/logout").send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
  });

  it("returns 200 for an unknown token (revocation is idempotent)", async () => {
    const res = await request(app)
      .post("/api/v1/auth/logout")
      .send({ refreshToken: "no-such-token" });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ ok: true });
  });
});
