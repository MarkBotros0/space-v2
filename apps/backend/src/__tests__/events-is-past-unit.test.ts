/**
 * `isPast` on every event the API returns: `(endDayKey ?? dayKey) < today` on
 * the organisation clock, the exact complement of the `upcoming` filter. The
 * device never compares dates (D23/R75).
 */
const mockDb = {
  jpcEvent: { findMany: jest.fn(), count: jest.fn() },
};
jest.mock("../db/client", () => ({ db: mockDb }));
jest.mock("../lib/auth/session-validity", () => ({ isAccessTokenInvalidated: async () => false }));

import request from "supertest";

import { createApp } from "../app";
import { config } from "../lib/config";
import { signAccessToken } from "../lib/auth/tokens";

const app = createApp();

const signToken = async () =>
  (
    await signAccessToken({
      userId: 1,
      role: "SUPER",
      seasonAdminIds: [],
      groupLeaderIds: [],
      activeSeasonId: null,
      graduationYear: null,
    })
  ).token;

afterEach(() => jest.useRealTimers());

const row = (iso: string, endIso: string | null = null) => ({
  id: 1,
  title: "E",
  date: new Date(iso),
  endDate: endIso ? new Date(endIso) : null,
  url: null,
  visibility: "ALL",
  seasonId: null,
  season: null,
});

const NOW = "2099-03-10T12:00:00.000Z";

async function isPastOf(r: ReturnType<typeof row>, now = NOW): Promise<boolean> {
  // Sign at the faked instant, or the token is already expired when verified.
  jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "setTimeout", "setInterval"], now: new Date(now) });
  const token = await signToken();
  mockDb.jpcEvent.findMany.mockResolvedValue([r]);
  mockDb.jpcEvent.count.mockResolvedValue(1);
  const res = await request(app)
    .get("/api/v1/events")
    .set({ authorization: `Bearer ${token}` });
  expect(res.status).toBe(200);
  return res.body.data.events[0].isPast;
}

describe("events isPast", () => {
  it("is past: started yesterday, no end", async () => {
    expect(await isPastOf(row("2099-03-09T10:00:00.000Z"))).toBe(true);
  });
  it("is not past: started yesterday, ends today", async () => {
    expect(await isPastOf(row("2099-03-09T10:00:00.000Z", "2099-03-10T08:00:00.000Z"))).toBe(false);
  });
  it("is not past: a timed event earlier today (day granularity)", async () => {
    expect(await isPastOf(row("2099-03-10T05:00:00.000Z"))).toBe(false);
  });
  it("is not past: an event tomorrow", async () => {
    expect(await isPastOf(row("2099-03-11T10:00:00.000Z"))).toBe(false);
  });
  it("flips at org-timezone midnight, not UTC midnight", async () => {
    expect(config.orgTimezone).toBe("Africa/Cairo");
    // 22:30Z on the 10th is already the 11th in Cairo (UTC+2): the 10th is past.
    const event = row("2099-03-10T10:00:00.000Z");
    expect(await isPastOf(event, "2099-03-10T22:30:00.000Z")).toBe(true);
    // 21:30Z on the 10th is still the 10th in Cairo: not past.
    expect(await isPastOf(event, "2099-03-10T21:30:00.000Z")).toBe(false);
  });
});
