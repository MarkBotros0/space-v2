/**
 * GET/PATCH /me's account-level contact fields (phone, dateOfBirth, address —
 * every role) and PATCH /me/profile's student fields, against a mocked
 * database.
 */
const mockDb = {
  user: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  studentProfile: { upsert: jest.fn() },
  $transaction: jest.fn(),
};
jest.mock("../db/client", () => ({ db: mockDb }));
jest.mock("../lib/auth/session-validity", () => ({ isAccessTokenInvalidated: async () => false }));

import request from "supertest";

import { createApp } from "../app";
import { signAccessToken } from "../lib/auth/tokens";

const app = createApp();
let leaderToken: string;
let studentToken: string;

beforeAll(async () => {
  ({ token: leaderToken } = await signAccessToken({
    userId: 7, role: "LEADER", seasonAdminIds: [], groupLeaderIds: [4],
    activeSeasonId: null, graduationYear: 2020,
  }));
  ({ token: studentToken } = await signAccessToken({
    userId: 9, role: "STUDENT", seasonAdminIds: [], groupLeaderIds: [],
    activeSeasonId: 3, graduationYear: null,
  }));
});

const row = (over: Record<string, unknown> = {}) => ({
  id: 7, name: "Lee Leader", email: "lee@jpc.test", role: "LEADER", avatarPath: null,
  phone: "+20 100", dateOfBirth: new Date("1999-12-31T00:00:00.000Z"), address: "1 Nile St, Cairo",
  passwordHash: "$2a$hash", deletedAt: null,
  ...over,
});

beforeEach(() => {
  jest.resetAllMocks();
  mockDb.user.findUnique.mockResolvedValue(row());
  mockDb.user.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    const defined = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    return row(defined);
  });
  mockDb.$transaction.mockImplementation(async (cb: (tx: typeof mockDb) => unknown) => cb(mockDb));
  mockDb.studentProfile.upsert.mockResolvedValue({});
});

const patchMe = (body: unknown, token = leaderToken) =>
  request(app).patch("/api/v1/me").set("authorization", `Bearer ${token}`).send(body as object);

describe("GET /api/v1/me", () => {
  it("returns the contact fields for a staff user, the birthday as a calendar day", async () => {
    const res = await request(app).get("/api/v1/me").set("authorization", `Bearer ${leaderToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user).toEqual({
      id: 7, name: "Lee Leader", email: "lee@jpc.test", role: "LEADER", avatarPath: null,
      phone: "+20 100", dateOfBirth: "1999-12-31", address: "1 Nile St, Cairo", hasPassword: true,
    });
    expect(JSON.stringify(res.body)).not.toContain("$2a$hash");
  });
});

describe("PATCH /api/v1/me", () => {
  it("updates only the keys sent (partial), trimmed, birthday at UTC midnight", async () => {
    const res = await patchMe({ phone: "  +20 122  ", dateOfBirth: "2001-04-05" });
    expect(res.status).toBe(200);
    const { data } = mockDb.user.update.mock.calls[0][0];
    expect(data).toEqual({
      name: undefined,
      phone: "+20 122",
      dateOfBirth: new Date("2001-04-05T00:00:00.000Z"),
      address: undefined,
    });
    expect(mockDb.user.update.mock.calls[0][0].where).toEqual({ id: 7 });
    expect(res.body.data.user).toMatchObject({ phone: "+20 122", dateOfBirth: "2001-04-05" });
  });

  it("still takes a name on its own", async () => {
    const res = await patchMe({ name: "  Lee L  " });
    expect(res.status).toBe(200);
    expect(mockDb.user.update.mock.calls[0][0].data).toMatchObject({ name: "Lee L" });
  });

  it("clears with null or an empty string", async () => {
    const res = await patchMe({ phone: "", address: null, dateOfBirth: "" });
    expect(res.status).toBe(200);
    expect(mockDb.user.update.mock.calls[0][0].data).toEqual({
      name: undefined, phone: null, dateOfBirth: null, address: null,
    });
  });

  it("accepts an address up to 300 characters and refuses a longer one", async () => {
    expect((await patchMe({ address: "a".repeat(300) })).status).toBe(200);
    const res = await patchMe({ address: "a".repeat(301) });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
  });

  it("refuses a phone over 60 characters", async () => {
    expect((await patchMe({ phone: "1".repeat(61) })).status).toBe(400);
  });

  it("refuses a date of birth that is not a real YYYY-MM-DD day", async () => {
    for (const bad of ["2001-02-30", "05/04/2001", "2001-04-05T00:00:00Z", 20010405]) {
      expect((await patchMe({ dateOfBirth: bad })).status).toBe(400);
    }
  });

  it("refuses an empty body, an unknown key and a smuggled subject id", async () => {
    for (const body of [{}, { gifts: "x" }, { phone: "1", userId: 8 }, { name: null }]) {
      const res = await patchMe(body);
      expect(res.status).toBe(400);
    }
    expect(mockDb.user.update).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/v1/me/profile", () => {
  const patchProfile = (body: unknown) =>
    request(app).patch("/api/v1/me/profile").set("authorization", `Bearer ${studentToken}`).send(body as object);

  beforeEach(() => {
    mockDb.user.findFirst.mockResolvedValue({
      name: "Sam", email: "sam@jpc.test", avatarPath: null, graduationYear: null,
      phone: "+20 1", dateOfBirth: new Date("2002-07-09T00:00:00.000Z"),
      studentProfile: {
        university: "Cairo", faculty: "Engineering", universityGraduationYear: 2028,
        activeSeason: null,
      },
    });
  });

  it("writes phone/dateOfBirth to User and the academic fields to StudentProfile", async () => {
    const res = await patchProfile({
      phone: "+20 2", dateOfBirth: "2002-07-09", faculty: "Medicine", universityGraduationYear: 2031,
    });
    expect(res.status).toBe(200);
    expect(mockDb.user.update).toHaveBeenCalledWith({
      where: { id: 9 },
      data: { phone: "+20 2", dateOfBirth: new Date("2002-07-09T00:00:00.000Z") },
    });
    const upsert = mockDb.studentProfile.upsert.mock.calls[0][0];
    expect(upsert.update).toEqual({ university: undefined, faculty: "Medicine", universityGraduationYear: 2031 });
    expect(res.body.data.profile).toEqual({
      name: "Sam", email: "sam@jpc.test", avatarPath: null, graduationYear: null, activeSeasonTitle: null,
      university: "Cairo", faculty: "Engineering", universityGraduationYear: 2028,
      phone: "+20 1", dateOfBirth: "2002-07-09",
    });
  });

  it("refuses the dropped fields by name", async () => {
    for (const key of ["year", "gifts", "spiritualBackground", "address"]) {
      const res = await patchProfile({ [key]: "x" });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("forbidden_field");
    }
  });

  it("refuses a graduation year outside 1950-2100 or not a whole number", async () => {
    for (const bad of [1949, 2101, 2030.5, "2030"]) {
      expect((await patchProfile({ universityGraduationYear: bad })).status).toBe(400);
    }
  });
});
