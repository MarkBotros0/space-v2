// apps/backend/src/__tests__/integration/auth-google-routes.test.ts
/**
 * POST /api/v1/auth/google against the database. Google's signature checks
 * are covered by google-token.test.ts; here the verifier is stubbed so the
 * test decides which identity Google "confirmed".
 */
import { randomUUID } from "node:crypto";

import request from "supertest";

const mockVerify = jest.fn();
jest.mock("../../lib/auth/google", () => {
  const actual: Record<string, unknown> = jest.requireActual("../../lib/auth/google");
  return { ...actual, verifyGoogleIdToken: (...a: unknown[]) => mockVerify(...a) };
});
const mockGoogleClientIds = { value: ["web.apps.googleusercontent.com"] as readonly string[] };
jest.mock("../../lib/config", () => {
  const actual: { config: Record<string, unknown> } = jest.requireActual("../../lib/config");
  return {
    config: new Proxy(actual.config, {
      get: (target, key) =>
        key === "googleClientIds" ? mockGoogleClientIds.value : target[key as string],
    }),
  };
});

import { createApp } from "../../app";
import { db } from "../../db/client";

jest.setTimeout(60000);

const EMAIL_PREFIX = "space-v2-google-";
const EMAIL_SUFFIX = "@jpc.test";
const run = randomUUID();
const ACTIVE = `${EMAIL_PREFIX}${run}-a${EMAIL_SUFFIX}`;
const INVITED = `${EMAIL_PREFIX}${run}-i${EMAIL_SUFFIX}`;
const DELETED = `${EMAIL_PREFIX}${run}-d${EMAIL_SUFFIX}`;
const testAccounts = { email: { startsWith: EMAIL_PREFIX, endsWith: EMAIL_SUFFIX } } as const;

const ids: Record<string, number> = {};

beforeAll(async () => {
  await db.user.deleteMany({ where: testAccounts });
  for (const [key, email, extra] of [
    [
      "active",
      ACTIVE,
      { passwordHash: "$2a$04$notarealhashnotarealhashnotarealhashnotarealhashnot" },
    ],
    ["invited", INVITED, { passwordHash: null }],
    ["deleted", DELETED, { passwordHash: null, deletedAt: new Date() }],
  ] as const) {
    const user = await db.user.create({
      data: { email, name: `Google ${key}`, role: "STUDENT", ...extra },
    });
    ids[key] = user.id;
  }
});

afterAll(async () => {
  await db.refreshToken.deleteMany({ where: { userId: { in: Object.values(ids) } } });
  await db.user.deleteMany({ where: testAccounts });
  await db.$disconnect();
});

beforeEach(() => {
  mockVerify.mockReset();
  mockGoogleClientIds.value = ["web.apps.googleusercontent.com"];
});

const post = (body: unknown) =>
  request(createApp())
    .post("/api/v1/auth/google")
    .send(body as object);

describe("POST /api/v1/auth/google", () => {
  it("signs in the account Google's verified address belongs to", async () => {
    mockVerify.mockResolvedValue({ sub: "g-1", email: ACTIVE });
    const res = await post({ idToken: "token" });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      accessToken: expect.any(String),
      expiresIn: 900,
      refreshToken: expect.any(String),
      user: { id: ids.active, name: "Google active", email: ACTIVE, role: "STUDENT" },
    });
    expect(mockVerify).toHaveBeenCalledWith("token", ["web.apps.googleusercontent.com"]);
  });

  it("matches the address whatever its case", async () => {
    mockVerify.mockResolvedValue({ sub: "g-1", email: ACTIVE.toUpperCase() });
    const res = await post({ idToken: "token" });
    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe(ids.active);
  });

  it("lets someone invited but not set up sign in, which marks the account active", async () => {
    mockVerify.mockResolvedValue({ sub: "g-2", email: INVITED });
    const res = await post({ idToken: "token" });
    expect(res.status).toBe(200);
    const row = await db.user.findUniqueOrThrow({ where: { id: ids.invited } });
    expect(row.lastLoginAt).not.toBeNull();
    expect(row.passwordHash).toBeNull();
  });

  it("never creates an account for an unknown address", async () => {
    const stranger = `${EMAIL_PREFIX}${run}-x${EMAIL_SUFFIX}`;
    mockVerify.mockResolvedValue({ sub: "g-3", email: stranger });
    const res = await post({ idToken: "token" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("no_account");
    // Owner 2026-11-09: the next step, never "you aren't invited".
    expect(res.body.error.message).toMatch(/invite code/);
    expect(res.body.error.message).not.toMatch(/not invited|isn't invited|no .*account/i);
    await expect(db.user.findUnique({ where: { email: stranger } })).resolves.toBeNull();
  });

  it("refuses a deactivated account", async () => {
    mockVerify.mockResolvedValue({ sub: "g-4", email: DELETED });
    const res = await post({ idToken: "token" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("no_account");
  });

  it("refuses a token Google didn't confirm with 400, never 401", async () => {
    mockVerify.mockResolvedValue(null);
    const res = await post({ idToken: "token" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_google_token");
  });

  it("refuses a body without a token", async () => {
    const res = await post({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it("is a 404 while no Google client ID is configured", async () => {
    mockGoogleClientIds.value = [];
    const res = await post({ idToken: "token" });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
    expect(mockVerify).not.toHaveBeenCalled();
  });
});
