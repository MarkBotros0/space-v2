/**
 * Users admin writes against a mocked database: invite delivery (send first,
 * expire after), the create response's inviteSent, case-insensitive email
 * uniqueness, the admin-seasons field on the detail, and the audit lines.
 */
const mockDb = {
  user: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  inviteToken: { create: jest.fn(), updateMany: jest.fn(), findFirst: jest.fn() },
  seasonAdmin: { findMany: jest.fn(), findFirst: jest.fn(), deleteMany: jest.fn() },
  groupLeader: { findMany: jest.fn(), findFirst: jest.fn(), deleteMany: jest.fn() },
  seasonEnrollment: { findMany: jest.fn(), findFirst: jest.fn() },
  studentProfile: { upsert: jest.fn(), updateMany: jest.fn() },
  refreshToken: { updateMany: jest.fn() },
  $transaction: jest.fn(),
  $queryRaw: jest.fn(),
};
const mockIsEmailConfigured = jest.fn();
const mockSendInviteEmail = jest.fn();
jest.mock("../db/client", () => ({ db: mockDb }));
// requireAuth's Plan 18 M13 check is mocked out so it never consumes one of
// the user.findUnique values queued below; invalidateSessions is observed.
const mockInvalidateSessions = jest.fn();
jest.mock("../lib/auth/session-validity", () => ({
  isAccessTokenInvalidated: async () => false,
  invalidateSessions: (...a: unknown[]) => mockInvalidateSessions(...a),
}));
jest.mock("../lib/email", () => ({
  isEmailConfigured: () => mockIsEmailConfigured(),
  sendInviteEmail: (...a: unknown[]) => mockSendInviteEmail(...a),
}));

import request from "supertest";

import { createApp } from "../app";
import { hashToken, signAccessToken } from "../lib/auth/tokens";

const app = createApp();
let token: string;

beforeAll(async () => {
  ({ token } = await signAccessToken({
    userId: 1, role: "SUPER", seasonAdminIds: [], groupLeaderIds: [],
    activeSeasonId: null, graduationYear: null,
  }));
});

const pendingTarget = { email: "p@jpc.test", passwordHash: null, lastLoginAt: null, deletedAt: null };
const listRow = {
  id: 7, name: "Pat", email: "p@jpc.test", role: "ADMIN", graduationYear: 2015,
  lastLoginAt: null, deletedAt: null, passwordHash: null,
};

let info: jest.SpyInstance;
let error: jest.SpyInstance;

beforeEach(() => {
  jest.resetAllMocks();
  mockDb.seasonAdmin.findMany.mockResolvedValue([]);
  mockDb.groupLeader.findMany.mockResolvedValue([]);
  mockDb.seasonEnrollment.findMany.mockResolvedValue([]);
  info = jest.spyOn(console, "info").mockImplementation(() => undefined);
  error = jest.spyOn(console, "error").mockImplementation(() => undefined);
  mockDb.$transaction.mockImplementation((arg: unknown) =>
    typeof arg === "function" ? (arg as (tx: typeof mockDb) => unknown)(mockDb) : Promise.all(arg as unknown[]),
  );
  mockDb.inviteToken.create.mockResolvedValue({ id: 50 });
  mockDb.inviteToken.updateMany.mockResolvedValue({ count: 1 });
  mockDb.inviteToken.findFirst.mockResolvedValue(null);
  mockDb.seasonAdmin.findMany.mockResolvedValue([]);
  mockDb.refreshToken.updateMany.mockResolvedValue({ count: 0 });
  mockDb.user.update.mockResolvedValue({});
  mockDb.studentProfile.updateMany.mockResolvedValue({ count: 0 });
  mockIsEmailConfigured.mockReturnValue(true);
  mockSendInviteEmail.mockResolvedValue(undefined);
});

afterEach(() => {
  info.mockRestore();
  error.mockRestore();
});

const auth = () => ({ authorization: `Bearer ${token}` });

describe("POST /users/:id/invite — never leaves the person without a working code", () => {
  beforeEach(() => {
    mockDb.user.findUnique.mockImplementation(({ select }: { select: Record<string, boolean> }) =>
      Promise.resolve(select.passwordHash ? pendingTarget : listRow),
    );
  });

  it("answers 503 email_not_configured and mints nothing when mail is off", async () => {
    mockIsEmailConfigured.mockReturnValue(false);
    const res = await request(app).post("/api/v1/users/7/invite").set(auth());
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("email_not_configured");
    expect(mockDb.inviteToken.create).not.toHaveBeenCalled();
    expect(mockDb.inviteToken.updateMany).not.toHaveBeenCalled();
  });

  it("on a failed send answers 502 and withdraws only the new code — the old one stays live", async () => {
    mockSendInviteEmail.mockRejectedValue(new Error("SMTP down"));
    const res = await request(app).post("/api/v1/users/7/invite").set(auth());
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("email_send_failed");

    const raw = mockSendInviteEmail.mock.calls[0][1] as string;
    expect(mockDb.inviteToken.updateMany).toHaveBeenCalledTimes(1);
    expect(mockDb.inviteToken.updateMany.mock.calls[0][0].where).toEqual({ token: hashToken(raw), usedAt: null });
  });

  it("expires the older live invites only after the mail went", async () => {
    const res = await request(app).post("/api/v1/users/7/invite").set(auth());
    expect(res.status).toBe(200);
    expect(mockDb.inviteToken.updateMany).toHaveBeenCalledTimes(1);
    const { where } = mockDb.inviteToken.updateMany.mock.calls[0][0];
    expect(where).toMatchObject({ userId: 7, id: { lt: 50 }, usedAt: null });
    const sendOrder = mockSendInviteEmail.mock.invocationCallOrder[0]!;
    const expireOrder = mockDb.inviteToken.updateMany.mock.invocationCallOrder[0]!;
    expect(sendOrder).toBeLessThan(expireOrder);
  });
});

describe("POST /users", () => {
  const body = { name: "New Person", email: "  New.Person@JPC.test ", role: "STUDENT" };

  beforeEach(() => {
    mockDb.$queryRaw.mockResolvedValue([]);
    mockDb.user.create.mockResolvedValue({ id: 60 });
  });

  it("refuses an address that differs from an existing one only by case (importer lookup)", async () => {
    mockDb.$queryRaw.mockResolvedValue([{ id: 3, email: "new.person@jpc.test", role: "STUDENT", deletedAt: null }]);
    const res = await request(app).post("/api/v1/users").set(auth()).send(body);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("email_taken");
    // The lookup is lower(email) = ANY(keys): the key is normalised.
    expect(mockDb.$queryRaw.mock.calls[0]).toContainEqual(["new.person@jpc.test"]);
    expect(mockDb.user.create).not.toHaveBeenCalled();
  });

  it("stores the address trimmed and lower-cased, and audits the create", async () => {
    const res = await request(app).post("/api/v1/users").set(auth()).send(body);
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ userId: 60, inviteSent: true });
    expect(mockDb.user.create.mock.calls[0][0].data.email).toBe("new.person@jpc.test");
    expect(info).toHaveBeenCalledWith("[audit] user.create actor=1 subject=60");
  });

  it("still creates the account when the mail fails, says inviteSent:false, and withdraws the code", async () => {
    mockSendInviteEmail.mockRejectedValue(new Error("SMTP down"));
    const res = await request(app).post("/api/v1/users").set(auth()).send(body);
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ userId: 60, inviteSent: false });
    const raw = mockSendInviteEmail.mock.calls[0][1] as string;
    // issueInvite's prior-expiry, then the withdrawal of the undelivered code.
    expect(mockDb.inviteToken.updateMany).toHaveBeenLastCalledWith({
      where: { token: hashToken(raw), usedAt: null },
      data: { expiresAt: expect.any(Date) },
    });
  });

  it("with no mail transport, creates the account and reports inviteSent:false", async () => {
    mockIsEmailConfigured.mockReturnValue(false);
    const res = await request(app).post("/api/v1/users").set(auth()).send(body);
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ userId: 60, inviteSent: false });
    expect(mockSendInviteEmail).not.toHaveBeenCalled();
  });
});

describe("account changes leave an audit line", () => {
  it("role change", async () => {
    mockDb.user.findUnique.mockResolvedValue({ ...listRow, role: "STUDENT" });
    const res = await request(app)
      .patch("/api/v1/users/7")
      .set(auth())
      .send({ name: "Pat", role: "MENTOR", graduationYear: 2015 });
    expect(res.status).toBe(200);
    expect(mockDb.seasonAdmin.deleteMany).not.toHaveBeenCalled();
    expect(mockDb.groupLeader.deleteMany).not.toHaveBeenCalled();
    expect(mockDb.user.update.mock.calls[0][0].data.role).toBe("MENTOR");
    expect(info).toHaveBeenCalledWith("[audit] user.role_change actor=1 subject=7");
    // Plan 18 M13: the changed user's live access tokens end now, in the
    // same transaction as the refresh revocation.
    expect(mockInvalidateSessions).toHaveBeenCalledWith(mockDb, 7);
  });

  it("no line for a rename alone, sending no role", async () => {
    mockDb.user.findUnique.mockResolvedValue({ ...listRow, role: "ADMIN" });
    mockDb.seasonAdmin.findMany.mockResolvedValue([{ userId: 7, seasonId: 4, season: { status: "ACTIVE" } }]);
    const res = await request(app).patch("/api/v1/users/7").set(auth()).send({ name: "Pat B", graduationYear: 2015 });
    expect(res.status).toBe(200);
    expect(mockDb.user.update.mock.calls[0][0].data).not.toHaveProperty("role");
    expect(info).not.toHaveBeenCalled();
    expect(mockInvalidateSessions).not.toHaveBeenCalled();
  });

  it("deactivate and reactivate", async () => {
    mockDb.user.findUnique.mockResolvedValue({ id: 7, role: "ADMIN" });
    expect((await request(app).post("/api/v1/users/7/deactivate").set(auth())).status).toBe(200);
    expect((await request(app).post("/api/v1/users/7/reactivate").set(auth())).status).toBe(200);
    expect(info).toHaveBeenCalledWith("[audit] user.deactivate actor=1 subject=7");
    expect(info).toHaveBeenCalledWith("[audit] user.reactivate actor=1 subject=7");
    // Deactivation ends live access tokens (Plan 18 M13); reactivation does not need to.
    expect(mockInvalidateSessions).toHaveBeenCalledTimes(1);
    expect(mockInvalidateSessions).toHaveBeenCalledWith(mockDb, 7);
  });
});

describe("GET /users/:id", () => {
  it("names the seasons the user administers, so a demotion can be confirmed first", async () => {
    mockDb.user.findUnique.mockResolvedValue(listRow);
    mockDb.seasonAdmin.findMany.mockResolvedValue([{ season: { id: 2, code: "gbv-2026", title: "GBV 2026" } }]);
    const res = await request(app).get("/api/v1/users/7").set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.adminSeasons).toEqual([{ id: 2, code: "gbv-2026", title: "GBV 2026" }]);
    expect(mockDb.seasonAdmin.findMany.mock.calls[0][0].where).toEqual({ userId: 7, season: { deletedAt: null } });
  });
});
