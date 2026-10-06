import request from "supertest";

// The mailer is stubbed for two reasons: a staging .env with GMAIL_* set would
// otherwise send real SMTP to @jpc.test addresses on every run, and the stub
// is how this suite proves the raw code reaches the mailer and nothing else.
// Lazy wrapper: jest.mock is hoisted above this const, so the factory must not
// read mockSendInviteEmail until the function is actually called.
const mockSendInviteEmail = jest.fn().mockResolvedValue(undefined);
jest.mock("../../lib/email", () => ({
  ...jest.requireActual("../../lib/email"),
  sendInviteEmail: (...args: unknown[]) => mockSendInviteEmail(...args),
}));

import { createApp } from "../../app";
import { db } from "../../db/client";
import { hashToken } from "../../lib/auth/tokens";
import { issueInvite } from "../../lib/invites";
import {
  cleanupTestData,
  createTestUser,
  createUnactivatedTestUser,
  login,
  testEmail,
} from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

let superToken: string;
let superUser: { id: number; email: string };

beforeAll(async () => {
  await cleanupTestData();
  superUser = await createTestUser("super", "SUPER");
  superToken = await login(app, superUser.email);
});

afterAll(async () => {
  await cleanupTestData();
});

describe("POST /api/v1/users — creation issues credentials to no one (D2)", () => {
  it("creates with a NULL passwordHash and a hashed invite in one transaction", async () => {
    const email = testEmail("created");
    const res = await request(app)
      .post("/api/v1/users")
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "Created Person", email, role: "STUDENT" });
    expect(res.status).toBe(201);

    const row = await db.user.findUnique({
      where: { id: res.body.data.userId },
      select: { passwordHash: true },
    });
    // The load-bearing negative: NO default password, ever. The column is
    // nullable (schema.prisma:107) and null is the whole activation model.
    expect(row?.passwordHash).toBeNull();

    const invite = await db.inviteToken.findFirst({
      where: { userId: res.body.data.userId },
      select: { token: true, usedAt: true },
    });
    expect(invite).not.toBeNull();
    // Digest at rest: 64 lowercase hex chars, not a 32-char raw code.
    expect(invite?.token).toMatch(/^[0-9a-f]{64}$/);
    expect(invite?.usedAt).toBeNull();

    // And the response carried no credential of any kind.
    expect(JSON.stringify(res.body)).not.toContain("token");

    // The raw code went to the mailer — and is the code whose digest is stored.
    const calls = mockSendInviteEmail.mock.calls as [string, string, Date][];
    const call = calls[calls.length - 1]!;
    expect(call[0]).toBe(email);
    expect(hashToken(call[1])).toBe(invite?.token);
    expect(JSON.stringify(res.body)).not.toContain(call[1]);
  });

  it("a user created without accepting cannot log in — null hash means invalid_credentials", async () => {
    const email = testEmail("no-login");
    await request(app)
      .post("/api/v1/users")
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "No Login", email, role: "STUDENT" });

    // v1 would have accepted ChangeMe123! here (R41/R44). Nothing works now.
    const attempt = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password: "ChangeMe123!" });
    expect(attempt.status).toBe(401);
    expect(attempt.body.error.code).toBe("invalid_credentials");
  });

  it("refuses a duplicate email with 409 email_taken, not a Prisma error (R39)", async () => {
    const email = testEmail("dupe");
    await request(app)
      .post("/api/v1/users")
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "First", email, role: "STUDENT" });
    const clash = await request(app)
      .post("/api/v1/users")
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "Second", email, role: "STUDENT" });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe("email_taken");
  });
});

describe("POST /api/v1/users/:id/invite", () => {
  it("returns metadata only and expires the previous live invite (D5 rec 2)", async () => {
    const target = await createUnactivatedTestUser("reinvite", "STUDENT");

    const first = await request(app)
      .post(`/api/v1/users/${target.id}/invite`)
      .set("authorization", `Bearer ${superToken}`);
    expect(first.status).toBe(200);
    expect(Object.keys(first.body.data).sort()).toEqual([
      "expiresAt", "invitedByName", "issuedAt", "usedAt",
    ]);

    const second = await request(app)
      .post(`/api/v1/users/${target.id}/invite`)
      .set("authorization", `Bearer ${superToken}`);
    expect(second.status).toBe(200);

    const live = await db.inviteToken.count({
      where: { userId: target.id, usedAt: null, expiresAt: { gt: new Date() } },
    });
    expect(live).toBe(1);
  });

  it("explicitly refuses an activated target — no silent drop (R16 diverged)", async () => {
    const active = await createTestUser("already-active", "STUDENT");
    const res = await request(app)
      .post(`/api/v1/users/${active.id}/invite`)
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("already_activated");
  });
});

describe("POST /api/v1/auth/accept-invite", () => {
  it("activates the account: sets a cost-12 hash, consumes the token, login works", async () => {
    const target = await createUnactivatedTestUser("acceptor", "STUDENT");
    // The raw code exists only inside the issuing process — obtain it the way
    // the route does, via the library, then walk the anonymous HTTP path.
    const { raw } = await issueInvite(db, target.id, superUser.id);

    const res = await request(app)
      .post("/api/v1/auth/accept-invite")
      .send({ token: raw, password: "brand-new-password" });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ ok: true });

    const row = await db.user.findUnique({
      where: { id: target.id },
      select: { passwordHash: true },
    });
    expect(row?.passwordHash).toMatch(/^\$2[aby]\$12\$/); // bcrypt, cost 12 (D8)

    const loginRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: target.email, password: "brand-new-password" });
    expect(loginRes.status).toBe(200);
  });

  it("is single-use — the same token a second time is refused", async () => {
    const target = await createUnactivatedTestUser("once", "STUDENT");
    const { raw } = await issueInvite(db, target.id, superUser.id);
    await request(app)
      .post("/api/v1/auth/accept-invite")
      .send({ token: raw, password: "brand-new-password" });

    const again = await request(app)
      .post("/api/v1/auth/accept-invite")
      .send({ token: raw, password: "other-password-1" });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe("invalid_invite");
  });

  it("refuses expired, unknown, and already-activated indistinguishably (R27's oracle closed)", async () => {
    // Expired: mint, then force the expiry into the past.
    const expiredTarget = await createUnactivatedTestUser("expired", "STUDENT");
    const expired = await issueInvite(db, expiredTarget.id, superUser.id);
    await db.inviteToken.updateMany({
      where: { token: hashToken(expired.raw) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    // Already-activated target: a valid invite must not become a password
    // reset for a live account (R31 — D4 rec 2: an invite is an activation).
    const activeTarget = await createTestUser("active-target", "STUDENT");
    const hijack = await issueInvite(db, activeTarget.id, superUser.id);

    const bodies = [];
    for (const token of [expired.raw, "definitely-not-a-real-token-aaaa", hijack.raw]) {
      const res = await request(app)
        .post("/api/v1/auth/accept-invite")
        .send({ token, password: "brand-new-password" });
      expect(res.status).toBe(400);
      bodies.push(res.body);
    }
    // One opaque code, byte-identical bodies — no existence oracle.
    expect(bodies[1]).toEqual(bodies[0]);
    expect(bodies[2]).toEqual(bodies[0]);
  });

  it("stores only the digest — the raw code never touches the database", async () => {
    const target = await createUnactivatedTestUser("digest", "STUDENT");
    const { raw } = await issueInvite(db, target.id, superUser.id);
    const row = await db.inviteToken.findFirst({
      where: { userId: target.id },
      orderBy: { createdAt: "desc" },
      select: { token: true },
    });
    expect(row?.token).not.toBe(raw);
    expect(row?.token).toBe(hashToken(raw));
  });
});
