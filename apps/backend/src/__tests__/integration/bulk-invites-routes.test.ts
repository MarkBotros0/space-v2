import { randomBytes } from "node:crypto";

import request from "supertest";

const mockSendInviteEmail = jest.fn().mockResolvedValue(undefined);
const mockIsEmailConfigured = jest.fn(() => true);
jest.mock("../../lib/email", () => ({
  ...jest.requireActual("../../lib/email"),
  sendInviteEmail: (...args: unknown[]) => mockSendInviteEmail(...args),
  isEmailConfigured: () => mockIsEmailConfigured(),
}));

// SAFETY — read before editing. The shared staging DB holds REAL
// never-activated users (spec 11 R15: v1's CSV import produces exactly that
// state). An unscoped bulk send from a test would mint invites for real
// people. So every route call in this file runs the REAL library, confined to
// fixture rows: the mock forwards to the actual functions with the fixture
// scope forced on. Never remove this block, and never call the actual
// sendPendingInviteBatch/listPendingInviteUserIds without a scope.
jest.mock("../../lib/invites", () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports -- inline import() type needed inside a hoisted jest.mock factory
  const actual = jest.requireActual<typeof import("../../lib/invites")>("../../lib/invites");
  const fixtureScope = { email: { startsWith: "space-v2-test-", endsWith: "@jpc.test" } };
  return {
    ...actual,
    listPendingInviteUserIds: () => actual.listPendingInviteUserIds(fixtureScope),
    sendPendingInviteBatch: (invitedById: number, options: { batchSize?: number } = {}) =>
      actual.sendPendingInviteBatch(invitedById, { ...options, scope: fixtureScope }),
  };
});

import { createApp } from "../../app";
import { db } from "../../db/client";
import { hashToken } from "../../lib/auth/tokens";
import {
  inviteIfStillPending,
  isV2InviteDigest,
  issueInvite,
  sendPendingInviteBatch,
} from "../../lib/invites";
import {
  cleanupTestData,
  createTestUser,
  createUnactivatedTestUser,
  login,
  testEmail,
} from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

let superUser: { id: number; email: string };
let superToken: string;

beforeEach(async () => {
  await cleanupTestData();
  mockSendInviteEmail.mockReset().mockResolvedValue(undefined);
  mockIsEmailConfigured.mockReset().mockReturnValue(true);
  superUser = await createTestUser("bulk-super", "SUPER");
  superToken = await login(app, superUser.email);
});

afterAll(async () => {
  await cleanupTestData();
});

/**
 * Four pending accounts — one of them holding only a live v1-style PLAINTEXT
 * invite, which v2 can never accept (Plan 9 Decision 4) — plus three that are
 * not pending: one with a live v2 invite, one activated, one deleted.
 */
async function seedPool() {
  const plain = [
    await createUnactivatedTestUser("pending-a", "STUDENT"),
    await createUnactivatedTestUser("pending-b", "STUDENT"),
    await createUnactivatedTestUser("pending-c", "STUDENT"),
  ];
  const v1Holder = await createUnactivatedTestUser("pending-v1", "STUDENT");
  // v1's shape: a 32-char raw code stored as-is (spec 11 R13/R23).
  await db.inviteToken.create({
    data: {
      token: randomBytes(16).toString("hex"),
      userId: v1Holder.id,
      invitedById: superUser.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  const invited = await createUnactivatedTestUser("already-invited", "STUDENT");
  await issueInvite(db, invited.id, superUser.id);
  const active = await createTestUser("active-one", "STUDENT");
  const deleted = await createUnactivatedTestUser("deleted-one", "STUDENT");
  await db.user.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });

  const pending = [...plain, v1Holder].sort((a, b) => a.id - b.id);
  return { pending, invited, active, deleted };
}

describe("GET /api/v1/users/invites/pending", () => {
  it("counts never-activated, undeleted accounts without a live v2 invite — a v1 plaintext invite does not count", async () => {
    await seedPool();
    const res = await request(app)
      .get("/api/v1/users/invites/pending")
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ pending: 4 });
  });

  it("is SUPER-only", async () => {
    const admin = await createTestUser("bulk-admin", "ADMIN");
    const res = await request(app)
      .get("/api/v1/users/invites/pending")
      .set("authorization", `Bearer ${await login(app, admin.email)}`);
    expect(res.status).toBe(403);
  });
});

describe("POST /api/v1/users/invites/pending (Plan 10 Decision 12)", () => {
  it("invites every pending account once, mails each its own code, and reports four counters", async () => {
    const { pending, invited } = await seedPool();
    const before = await db.inviteToken.findFirst({
      where: { userId: invited.id },
      select: { token: true },
    });

    const res = await request(app)
      .post("/api/v1/users/invites/pending")
      .set("authorization", `Bearer ${superToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ sent: 4, skipped: 0, failed: 0, remaining: 0 });

    const calls = mockSendInviteEmail.mock.calls as [string, string, Date][];
    expect(calls).toHaveLength(4);
    for (const user of pending) {
      const live = await db.inviteToken.findMany({
        where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
        select: { token: true },
      });
      expect(live).toHaveLength(1);
      expect(isV2InviteDigest(live[0]!.token)).toBe(true);
      const call = calls.find((c) => c[0] === user.email);
      expect(call && hashToken(call[1])).toBe(live[0]!.token);
    }
    // The already-invited account was not re-minted.
    const after = await db.inviteToken.findMany({ where: { userId: invited.id }, select: { token: true } });
    expect(after).toEqual([before]);
    // No raw code in the response.
    for (const c of calls) expect(JSON.stringify(res.body)).not.toContain(c[1]);
  });

  it("refuses with 503 and mints nothing when no mail transport is configured", async () => {
    const { pending } = await seedPool();
    mockIsEmailConfigured.mockReturnValue(false);

    const res = await request(app)
      .post("/api/v1/users/invites/pending")
      .set("authorization", `Bearer ${superToken}`);

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("email_not_configured");
    const digests = await db.inviteToken.findMany({
      where: { userId: { in: pending.map((p) => p.id) } },
      select: { token: true },
    });
    expect(digests.filter((d) => isV2InviteDigest(d.token))).toEqual([]);
  });

  it("is SUPER-only", async () => {
    const admin = await createTestUser("bulk-admin-post", "ADMIN");
    const res = await request(app)
      .post("/api/v1/users/invites/pending")
      .set("authorization", `Bearer ${await login(app, admin.email)}`);
    expect(res.status).toBe(403);
  });
});

describe("sendPendingInviteBatch — the bounds (fixture-scoped by the mock above)", () => {
  it("processes at most batchSize per call, oldest id first, and reports what remains", async () => {
    const { pending } = await seedPool();

    const first = await sendPendingInviteBatch(superUser.id, { batchSize: 2 });
    expect(first).toEqual({ sent: 2, skipped: 0, failed: 0, remaining: 2 });
    const firstEmails = (mockSendInviteEmail.mock.calls as [string][]).map((c) => c[0]);
    expect(firstEmails.sort()).toEqual([pending[0]!.email, pending[1]!.email].sort());

    const second = await sendPendingInviteBatch(superUser.id, { batchSize: 2 });
    expect(second).toEqual({ sent: 2, skipped: 0, failed: 0, remaining: 0 });
  });

  it("a mail failure expires the invite just minted, so that person stays pending for the next tap", async () => {
    const { pending } = await seedPool();
    const unlucky = pending[0]!;
    mockSendInviteEmail.mockImplementation(async (email: string) => {
      if (email === unlucky.email) throw new Error("smtp down");
    });

    const result = await sendPendingInviteBatch(superUser.id);
    expect(result).toEqual({ sent: 3, skipped: 0, failed: 1, remaining: 1 });

    const live = await db.inviteToken.count({
      where: { userId: unlucky.id, usedAt: null, expiresAt: { gt: new Date() } },
    });
    expect(live).toBe(0);
  });
});

describe("inviteIfStillPending — the per-user lock and re-check", () => {
  it("mints for a pending account, then refuses the same account on a second call (double-tap safe)", async () => {
    const target = await createUnactivatedTestUser("once-only", "STUDENT");
    const minted = await inviteIfStillPending(target.id, superUser.id);
    expect(minted?.userId).toBe(target.id);
    expect(minted?.email).toBe(target.email);
    expect(await inviteIfStillPending(target.id, superUser.id)).toBeNull();
  });

  it("refuses an activated account and a deleted one", async () => {
    const active = await createTestUser("lock-active", "STUDENT");
    const deleted = await createUnactivatedTestUser("lock-deleted", "STUDENT");
    await db.user.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });
    expect(await inviteIfStillPending(active.id, superUser.id)).toBeNull();
    expect(await inviteIfStillPending(deleted.id, superUser.id)).toBeNull();
  });
});

describe("POST /api/v1/users — creating a SUPER needs confirmSuper (Plan 10 Decision 13)", () => {
  it("refuses role SUPER without the flag and creates nothing", async () => {
    const email = testEmail("new-super-refused");
    const res = await request(app)
      .post("/api/v1/users")
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "New Super", email, role: "SUPER" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("confirm_super_required");
    expect(await db.user.count({ where: { email } })).toBe(0);
  });

  it("creates the SUPER — with no password, invite-first — when the flag is true", async () => {
    const email = testEmail("new-super-confirmed");
    const res = await request(app)
      .post("/api/v1/users")
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "New Super", email, role: "SUPER", confirmSuper: true });
    expect(res.status).toBe(201);
    const row = await db.user.findUnique({ where: { email }, select: { role: true, passwordHash: true } });
    expect(row).toEqual({ role: "SUPER", passwordHash: null });
  });

  it("needs no flag for any other role", async () => {
    const res = await request(app)
      .post("/api/v1/users")
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "Plain Student", email: testEmail("plain-student"), role: "STUDENT" });
    expect(res.status).toBe(201);
  });
});
