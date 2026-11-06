/**
 * SUPER-only season admin management against a mocked database: the SUPER
 * gate, idempotent add and remove, stale sessions on every real change, and the
 * audit lines. Who may take the seat is pinned in lib/roles's own tests and
 * integration/staff-seats.test.ts.
 */
const mockDb = {
  season: { findFirst: jest.fn() },
  seasonAdmin: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), deleteMany: jest.fn() },
  $transaction: jest.fn(),
};
jest.mock("../db/client", () => ({ db: mockDb }));
const mockMarkSessionsStale = jest.fn();
jest.mock("../lib/auth/session-validity", () => ({
  isAccessTokenInvalidated: async () => false,
  markSessionsStale: (...a: unknown[]) => mockMarkSessionsStale(...a),
}));
const mockRefuseNewSeats = jest.fn();
jest.mock("../lib/roles", () => ({
  lockPeople: async () => undefined,
  refusalStatus: (r: { code: string }) => (r.code === "not_found" ? 404 : 409),
  refuseNewSeats: (...a: unknown[]) => mockRefuseNewSeats(...a),
}));

import request from "supertest";

import { createApp } from "../app";
import { signAccessToken } from "../lib/auth/tokens";

const app = createApp();
let superToken: string;
let adminToken: string;

beforeAll(async () => {
  const base = { groupLeaderIds: [], activeSeasonId: null, graduationYear: 2010 };
  ({ token: superToken } = await signAccessToken({ ...base, userId: 1, role: "SUPER", seasonAdminIds: [] }));
  ({ token: adminToken } = await signAccessToken({ ...base, userId: 2, role: "ADMIN", seasonAdminIds: [4] }));
});

const adminRow = {
  assignedAt: new Date("2026-11-01T10:00:00.000Z"),
  user: { id: 7, name: "Pat", email: "p@jpc.test" },
  assignedBy: { name: "Su" },
};

let info: jest.SpyInstance;

beforeEach(() => {
  jest.resetAllMocks();
  info = jest.spyOn(console, "info").mockImplementation(() => undefined);
  mockDb.$transaction.mockImplementation((fn: (tx: typeof mockDb) => unknown) => fn(mockDb));
  mockDb.season.findFirst.mockResolvedValue({ id: 4, status: "ACTIVE" });
  mockRefuseNewSeats.mockResolvedValue(null);
  mockDb.seasonAdmin.findUnique.mockResolvedValue(null);
  mockDb.seasonAdmin.create.mockResolvedValue({});
  mockDb.seasonAdmin.findMany.mockResolvedValue([adminRow]);
  mockDb.seasonAdmin.deleteMany.mockResolvedValue({ count: 1 });
});

afterEach(() => info.mockRestore());

const asSuper = () => ({ authorization: `Bearer ${superToken}` });
const asAdmin = () => ({ authorization: `Bearer ${adminToken}` });

const expectedList = {
  admins: [
    { userId: 7, name: "Pat", email: "p@jpc.test", assignedAt: "2026-11-01T10:00:00.000Z", assignedByName: "Su" },
  ],
};

describe("SUPER gate", () => {
  it.each([
    ["get", "/api/v1/seasons/4/admins"],
    ["post", "/api/v1/seasons/4/admins"],
    ["delete", "/api/v1/seasons/4/admins/7"],
  ] as const)("%s %s answers 403 to a season admin", async (method, path) => {
    const res = await request(app)[method](path).set(asAdmin()).send({ userId: 7 });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
    expect(mockDb.seasonAdmin.create).not.toHaveBeenCalled();
    expect(mockDb.seasonAdmin.deleteMany).not.toHaveBeenCalled();
  });
});

describe("GET /seasons/:id/admins", () => {
  it("lists the admins with who assigned them", async () => {
    const res = await request(app).get("/api/v1/seasons/4/admins").set(asSuper());
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(expectedList);
    expect(mockDb.seasonAdmin.findMany.mock.calls[0][0].where).toEqual({ seasonId: 4 });
  });

  it("answers 404 for a deleted (or missing) season", async () => {
    mockDb.season.findFirst.mockResolvedValue(null);
    const res = await request(app).get("/api/v1/seasons/4/admins").set(asSuper());
    expect(res.status).toBe(404);
    expect(mockDb.season.findFirst.mock.calls[0][0].where).toEqual({ id: 4, deletedAt: null });
  });

  it("answers 400 for a malformed id", async () => {
    const res = await request(app).get("/api/v1/seasons/abc/admins").set(asSuper());
    expect(res.status).toBe(400);
  });
});

describe("POST /seasons/:id/admins", () => {
  const add = (body: object) => request(app).post("/api/v1/seasons/4/admins").set(asSuper()).send(body);

  it("adds the row, marks the person stale, audits, and answers 201 with the list", async () => {
    const res = await add({ userId: 7 });
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual(expectedList);
    expect(mockDb.seasonAdmin.create).toHaveBeenCalledWith({
      data: { seasonId: 4, userId: 7, assignedById: 1 },
    });
    expect(mockRefuseNewSeats).toHaveBeenCalledWith(mockDb, [7], {
      kind: "admin",
      season: { id: 4, status: "ACTIVE" },
    });
    expect(mockMarkSessionsStale).toHaveBeenCalledWith(mockDb, [7]);
    expect(info).toHaveBeenCalledWith("[audit] season.admin_add actor=1 subject=7 season=4");
  });

  it("is idempotent: an existing admin is a 200 with no check, no write, no stamp and no audit", async () => {
    mockDb.seasonAdmin.findUnique.mockResolvedValue({ userId: 7 });
    const res = await add({ userId: 7 });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(expectedList);
    expect(mockRefuseNewSeats).not.toHaveBeenCalled();
    expect(mockDb.seasonAdmin.create).not.toHaveBeenCalled();
    expect(mockMarkSessionsStale).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
  });

  it("treats a lost insert race (unique violation) as already added", async () => {
    mockDb.$transaction.mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    const res = await add({ userId: 7 });
    expect(res.status).toBe(200);
    expect(info).not.toHaveBeenCalled();
  });

  it("a refusal is a 409 in its own words, with no write, no stamp and no audit", async () => {
    mockRefuseNewSeats.mockResolvedValue({ code: "not_alumnus", message: "Only alumni can serve. Pat hasn't graduated." });
    const res = await add({ userId: 7 });
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({ code: "not_alumnus", message: "Only alumni can serve. Pat hasn't graduated." });
    expect(mockDb.seasonAdmin.create).not.toHaveBeenCalled();
    expect(mockMarkSessionsStale).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown user", async () => {
    mockRefuseNewSeats.mockResolvedValue({ code: "not_found", message: "User not found." });
    const res = await add({ userId: 7 });
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe("User not found.");
  });

  it("answers 404 for a deleted season without touching the user", async () => {
    mockDb.season.findFirst.mockResolvedValue(null);
    const res = await add({ userId: 7 });
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe("Season not found.");
    expect(mockRefuseNewSeats).not.toHaveBeenCalled();
  });

  it.each([{}, { userId: "7" }, { userId: 0 }, { userId: 1.5 }])("answers 400 for body %j", async (body) => {
    const res = await add(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
  });
});

describe("DELETE /seasons/:id/admins/:userId", () => {
  const remove = (path = "/api/v1/seasons/4/admins/7") => request(app).delete(path).set(asSuper());

  it("removes the row, marks the person stale, audits, and answers the list", async () => {
    mockDb.seasonAdmin.findMany.mockResolvedValue([]);
    const res = await remove();
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ admins: [] });
    expect(mockDb.seasonAdmin.deleteMany).toHaveBeenCalledWith({ where: { seasonId: 4, userId: 7 } });
    expect(mockMarkSessionsStale).toHaveBeenCalledWith(mockDb, [7]);
    expect(info).toHaveBeenCalledWith("[audit] season.admin_remove actor=1 subject=7 season=4");
  });

  it("is idempotent: no row means 200, no stamp and no audit", async () => {
    mockDb.seasonAdmin.deleteMany.mockResolvedValue({ count: 0 });
    const res = await remove();
    expect(res.status).toBe(200);
    expect(mockMarkSessionsStale).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
  });

  it("answers 404 for a deleted season", async () => {
    mockDb.season.findFirst.mockResolvedValue(null);
    const res = await remove();
    expect(res.status).toBe(404);
    expect(mockDb.seasonAdmin.deleteMany).not.toHaveBeenCalled();
  });

  it("answers 400 for a malformed user id", async () => {
    const res = await remove("/api/v1/seasons/4/admins/x");
    expect(res.status).toBe(400);
  });
});
