import { randomUUID } from "node:crypto";

import bcrypt from "bcryptjs";
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";

jest.setTimeout(15000);

// This suite runs against the shared live staging database (see README), so
// two things matter: never collide with a concurrent/previous run, and never
// leave a known-password account behind if afterAll doesn't get to run (CI
// timeout, interrupt, etc). A unique email per run handles the first; a
// startsWith/endsWith-scoped cleanup — both before creating and after —
// handles the second without ever touching a row outside this pattern.
const EMAIL_PREFIX = "space-v2-test-";
const EMAIL_SUFFIX = "@jpc.test";
const EMAIL = `${EMAIL_PREFIX}${randomUUID()}${EMAIL_SUFFIX}`;
const PASSWORD = "correct-horse-battery";

const testAccountFilter = { email: { startsWith: EMAIL_PREFIX, endsWith: EMAIL_SUFFIX } } as const;

let userId: number;

beforeAll(async () => {
  // Self-heal: remove any stragglers from an interrupted previous run before
  // creating this run's account. RefreshToken has onDelete: Cascade on its
  // user relation, so this also clears any orphaned refresh tokens.
  await db.user.deleteMany({ where: testAccountFilter });

  const user = await db.user.create({
    data: {
      email: EMAIL,
      name: "Test User",
      role: "STUDENT",
      passwordHash: await bcrypt.hash(PASSWORD, 10),
    },
  });
  userId = user.id;
});

afterAll(async () => {
  await db.refreshToken.deleteMany({ where: { userId } });
  await db.user.deleteMany({ where: { id: userId } });
  await db.$disconnect();
});

describe("POST /api/v1/auth/login", () => {
  it("returns a session and user for valid credentials", async () => {
    const res = await request(createApp())
      .post("/api/v1/auth/login")
      .send({ email: EMAIL, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.expiresIn).toBe(900);
    expect(res.body.data.refreshToken).toEqual(expect.any(String));
    expect(res.body.data.user).toEqual({
      id: userId,
      name: "Test User",
      email: EMAIL,
      role: "STUDENT",
    });
  });

  it("returns invalid_credentials for a wrong password", async () => {
    const res = await request(createApp())
      .post("/api/v1/auth/login")
      .send({ email: EMAIL, password: "wrong" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("invalid_credentials");
  });

  it("returns bad_request for a malformed body", async () => {
    const res = await request(createApp())
      .post("/api/v1/auth/login")
      .send({ email: "not-an-email", password: "" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
  });
});

describe("POST /api/v1/auth/refresh", () => {
  it("rotates a valid refresh token", async () => {
    const login = await request(createApp())
      .post("/api/v1/auth/login")
      .send({ email: EMAIL, password: PASSWORD });
    const first = login.body.data.refreshToken;

    const res = await request(createApp())
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: first });

    expect(res.status).toBe(200);
    expect(res.body.data.refreshToken).not.toBe(first);
  });

  it("rejects reuse of an already-rotated token", async () => {
    const login = await request(createApp())
      .post("/api/v1/auth/login")
      .send({ email: EMAIL, password: PASSWORD });
    const first = login.body.data.refreshToken;

    await request(createApp()).post("/api/v1/auth/refresh").send({ refreshToken: first });
    const reuse = await request(createApp())
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: first });

    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe("invalid_token");
  });
});
