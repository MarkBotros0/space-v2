/**
 * POST /students against a mocked database: the invite is minted with the
 * student, mailed after commit, and an undelivered one is withdrawn so the
 * account reads "pending" — the same send-first rule POST /users follows, with
 * the same `inviteSent` in the response.
 */
const mockDb = {
  user: { findUnique: jest.fn() },
  season: { findFirst: jest.fn() },
  inviteToken: { create: jest.fn(), updateMany: jest.fn() },
  $transaction: jest.fn(),
};
const mockIsEmailConfigured = jest.fn();
const mockSendInviteEmail = jest.fn();
const mockCreateStudentRows = jest.fn();
jest.mock("../db/client", () => ({ db: mockDb }));
jest.mock("../lib/email", () => ({
  isEmailConfigured: () => mockIsEmailConfigured(),
  sendInviteEmail: (...a: unknown[]) => mockSendInviteEmail(...a),
}));
jest.mock("../lib/queries/students", () => ({
  ...jest.requireActual("../lib/queries/students"),
  createStudentRows: (...a: unknown[]) => mockCreateStudentRows(...a),
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

let error: jest.SpyInstance;

beforeEach(() => {
  jest.resetAllMocks();
  error = jest.spyOn(console, "error").mockImplementation(() => undefined);
  mockDb.$transaction.mockImplementation((fn: (tx: typeof mockDb) => unknown) => fn(mockDb));
  mockDb.user.findUnique.mockResolvedValue(null);
  mockDb.inviteToken.create.mockResolvedValue({ id: 50 });
  mockDb.inviteToken.updateMany.mockResolvedValue({ count: 1 });
  mockCreateStudentRows.mockResolvedValue([{ id: 70, email: "new@jpc.test" }]);
  mockIsEmailConfigured.mockReturnValue(true);
  mockSendInviteEmail.mockResolvedValue(undefined);
});

afterEach(() => error.mockRestore());

const create = () =>
  request(app)
    .post("/api/v1/students")
    .set({ authorization: `Bearer ${token}` })
    .send({ name: "New Student", email: "new@jpc.test" });

describe("POST /students — the invite", () => {
  it("mints one code, mails it, and reports inviteSent:true", async () => {
    const res = await create();
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ id: 70, email: "new@jpc.test", inviteSent: true });
    expect(mockDb.inviteToken.create).toHaveBeenCalledTimes(1);
    const raw = mockSendInviteEmail.mock.calls[0][1] as string;
    expect(mockDb.inviteToken.create.mock.calls[0][0].data.token).toBe(hashToken(raw));
    // A brand-new account has no older invite, and a delivered one stays live.
    expect(mockDb.inviteToken.updateMany).not.toHaveBeenCalled();
    expect(JSON.stringify(res.body)).not.toContain(raw);
  });

  it("still creates the student when the mail fails, and withdraws the undelivered code", async () => {
    mockSendInviteEmail.mockRejectedValue(new Error("SMTP down"));
    const res = await create();
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ id: 70, email: "new@jpc.test", inviteSent: false });
    const raw = mockSendInviteEmail.mock.calls[0][1] as string;
    expect(mockDb.inviteToken.updateMany).toHaveBeenCalledWith({
      where: { token: hashToken(raw), usedAt: null },
      data: { expiresAt: expect.any(Date) },
    });
  });

  it("with no mail transport, creates the student, sends nothing, withdraws the code", async () => {
    mockIsEmailConfigured.mockReturnValue(false);
    const res = await create();
    expect(res.status).toBe(201);
    expect(res.body.data.inviteSent).toBe(false);
    expect(mockSendInviteEmail).not.toHaveBeenCalled();
    expect(mockDb.inviteToken.updateMany).toHaveBeenCalledTimes(1);
  });
});
