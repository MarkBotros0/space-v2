/** POST/DELETE /me/devices against a mocked database. */
const mockDb = {
  deviceToken: { upsert: jest.fn(), deleteMany: jest.fn() },
};
jest.mock("../db/client", () => ({ db: mockDb }));

import request from "supertest";

import { createApp } from "../app";
import { signAccessToken } from "../lib/auth/tokens";

const app = createApp();
let token: string;

beforeAll(async () => {
  ({ token } = await signAccessToken({
    userId: 7, role: "STUDENT", seasonAdminIds: [], groupLeaderIds: [],
    activeSeasonId: 3, graduationYear: null,
  }));
});

beforeEach(() => {
  jest.resetAllMocks();
  mockDb.deviceToken.upsert.mockResolvedValue({});
  mockDb.deviceToken.deleteMany.mockResolvedValue({ count: 1 });
});

const auth = () => ({ authorization: `Bearer ${token}` });
const pushToken = "ExponentPushToken[abc]";

describe("POST /api/v1/me/devices", () => {
  it("upserts the token onto the caller, so a handed-over phone moves to them", async () => {
    const res = await request(app).post("/api/v1/me/devices").set(auth()).send({ token: pushToken, platform: "android" });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ registered: true });
    expect(mockDb.deviceToken.upsert).toHaveBeenCalledWith({
      where: { token: pushToken },
      update: { userId: 7, platform: "ANDROID", lastSeenAt: expect.any(Date) },
      create: { userId: 7, token: pushToken, platform: "ANDROID" },
    });
  });

  it("rejects an unknown platform or extra keys", async () => {
    for (const body of [{ token: pushToken, platform: "web" }, { token: pushToken, platform: "ios", userId: 1 }]) {
      const res = await request(app).post("/api/v1/me/devices").set(auth()).send(body);
      expect(res.status).toBe(400);
    }
    expect(mockDb.deviceToken.upsert).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/v1/me/devices", () => {
  it("deletes only the caller's own row for that token", async () => {
    const res = await request(app).delete("/api/v1/me/devices").set(auth()).send({ token: pushToken });
    expect(res.status).toBe(200);
    expect(mockDb.deviceToken.deleteMany).toHaveBeenCalledWith({ where: { token: pushToken, userId: 7 } });
  });

  it("refuses an anonymous caller", async () => {
    const res = await request(app).delete("/api/v1/me/devices").send({ token: pushToken });
    expect(res.status).toBe(401);
  });
});
