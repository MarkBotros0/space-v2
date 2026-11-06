/** /dev/* — the v1-parity dev user switcher, gated by DEV_USER_SWITCHER=1. */
const mockDb = { user: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() } };
jest.mock("../db/client", () => ({ db: mockDb }));
const mockConfig = { devUserSwitcher: false };
jest.mock("../lib/config", () => {
  const actual = jest.requireActual("../lib/config");
  return { config: new Proxy(actual.config, { get: (t, k) => (k === "devUserSwitcher" ? mockConfig.devUserSwitcher : t[k]) }) };
});
jest.mock("../lib/auth/tokens", () => ({
  ...jest.requireActual("../lib/auth/tokens"),
  issueSession: jest.fn(),
}));

import request from "supertest";

import { createApp } from "../app";
import { issueSession } from "../lib/auth/tokens";

const app = createApp();

beforeEach(() => {
  jest.clearAllMocks();
  mockConfig.devUserSwitcher = false;
});

describe("dev switcher off", () => {
  it("answers 404 on every route, touching nothing", async () => {
    expect((await request(app).get("/api/v1/dev/users")).status).toBe(404);
    expect((await request(app).post("/api/v1/dev/switch").send({ userId: 2 })).status).toBe(404);
    expect(mockDb.user.findMany).not.toHaveBeenCalled();
    expect(issueSession).not.toHaveBeenCalled();
  });
});

describe("dev switcher on", () => {
  beforeEach(() => {
    mockConfig.devUserSwitcher = true;
  });

  it("lists active users per role, filtered by the search", async () => {
    mockDb.user.findMany.mockResolvedValue([]);
    const res = await request(app).get("/api/v1/dev/users?q=ann");
    expect(res.status).toBe(200);
    expect(mockDb.user.findMany).toHaveBeenCalledTimes(5);
    expect(mockDb.user.findMany.mock.calls[0][0].where).toMatchObject({ deletedAt: null, role: "SUPER" });
    expect(mockDb.user.findMany.mock.calls[0][0].where.OR).toHaveLength(2);
  });

  it("signs in as the chosen user with no password", async () => {
    mockDb.user.findUnique.mockResolvedValue({ id: 2, name: "Ann", email: "a@x.test", role: "LEADER", deletedAt: null });
    (issueSession as jest.Mock).mockResolvedValue({
      session: { accessToken: "a", expiresIn: 900, refreshToken: "r" },
      user: {},
    });
    const res = await request(app).post("/api/v1/dev/switch").send({ userId: 2 });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      accessToken: "a", expiresIn: 900, refreshToken: "r",
      user: { id: 2, name: "Ann", email: "a@x.test", role: "LEADER" },
    });
  });

  it("refuses a deactivated user", async () => {
    mockDb.user.findUnique.mockResolvedValue({ id: 2, name: "A", email: "a", role: "STUDENT", deletedAt: new Date() });
    const res = await request(app).post("/api/v1/dev/switch").send({ userId: 2 });
    expect(res.status).toBe(404);
    expect(issueSession).not.toHaveBeenCalled();
  });
});
