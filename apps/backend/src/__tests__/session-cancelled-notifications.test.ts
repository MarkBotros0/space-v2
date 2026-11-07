// SESSION_CANCELLED with the database mocked: recipients are gathered before
// the delete and told after it commits, once per delete.

// Pin the zone: the titles are exact Cairo wall-clock strings.
jest.mock("../lib/config", () => ({ config: { orgTimezone: "Africa/Cairo" } }));

const mockDb = {
  session: { findUnique: jest.fn(), findMany: jest.fn(), deleteMany: jest.fn() },
  seasonEnrollment: { findMany: jest.fn() },
  groupLeader: { findMany: jest.fn() },
  attendance: { count: jest.fn(), deleteMany: jest.fn() },
  sessionVideoProgress: { count: jest.fn(), deleteMany: jest.fn() },
  $transaction: jest.fn(),
};
jest.mock("../db/client", () => ({ db: mockDb }));

const mockNotify = jest.fn();
jest.mock("../lib/notifications", () => ({
  createNotificationsBulk: (...a: unknown[]) => mockNotify(...a),
}));

import type { Request, Response } from "express";

import type { SessionUser } from "../lib/auth/tokens";
import { parseNotificationLink } from "../lib/notification-target";
import {
  prepareSessionCancelledNotice,
  sendSessionCancelledNotice,
} from "../lib/session-notifications";
import { deleteSession } from "../routes/sessions/schedule";

const now = new Date("2099-02-20T00:00:00.000Z");
// 18:00Z is 8:00 PM in Cairo (UTC+2 in March).
const week1 = { title: "Week 1", startsAt: new Date("2099-03-01T18:00:00.000Z") };
const week2 = { title: "Week 1", startsAt: new Date("2099-03-08T18:00:00.000Z") };
const renamed = { title: "Field trip", startsAt: new Date("2099-03-15T18:00:00.000Z") };

beforeEach(() => {
  jest.resetAllMocks();
  mockDb.seasonEnrollment.findMany.mockResolvedValue([{ studentUserId: 11 }, { studentUserId: 12 }]);
  mockDb.groupLeader.findMany.mockResolvedValue([{ userId: 40 }, { userId: 41 }, { userId: 40 }]);
  mockNotify.mockResolvedValue({ written: 4, suppressed: 0 });
});

describe("prepareSessionCancelledNotice", () => {
  it("gathers the season's ACTIVE students and its group leaders, deduplicated", async () => {
    mockDb.session.findMany.mockResolvedValue([week1]);
    const notice = await prepareSessionCancelledNotice(7, [5], now);

    expect(mockDb.session.findMany).toHaveBeenCalledWith({
      where: { id: { in: [5] }, startsAt: { gt: now } },
      orderBy: { startsAt: "asc" },
      select: { title: true, startsAt: true },
    });
    expect(mockDb.seasonEnrollment.findMany).toHaveBeenCalledWith({
      where: { seasonId: 7, status: "ACTIVE", season: { status: "ACTIVE" }, studentUser: { deletedAt: null } },
      select: { studentUserId: true },
    });
    expect(mockDb.groupLeader.findMany).toHaveBeenCalledWith({
      where: { group: { seasonId: 7, season: { status: "ACTIVE" } }, user: { deletedAt: null } },
      select: { userId: true },
    });
    expect(notice).toEqual({
      recipientIds: [11, 12, 40, 41],
      title: "Cancelled: Week 1 on Mar 1, 2099, 8:00 PM",
    });
  });

  it("sends one notice for a series, listing every date", async () => {
    mockDb.session.findMany.mockResolvedValue([week1, week2, renamed]);
    const notice = await prepareSessionCancelledNotice(7, [5, 6, 7], now);

    expect(notice?.title).toBe("Cancelled: Week 1 on Mar 1, 2099, 8:00 PM and 2 more");
    expect(notice?.body).toBe(
      "3 sessions cancelled: Mar 1, 2099, 8:00 PM; Mar 8, 2099, 8:00 PM; Field trip, Mar 15, 2099, 8:00 PM.",
    );
  });

  it("says nothing when every deleted session is already in the past", async () => {
    mockDb.session.findMany.mockResolvedValue([]);
    expect(await prepareSessionCancelledNotice(7, [5], now)).toBeNull();
    expect(mockDb.seasonEnrollment.findMany).not.toHaveBeenCalled();
  });

  it("yields null instead of throwing into the delete", async () => {
    mockDb.session.findMany.mockRejectedValue(new Error("db down"));
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(prepareSessionCancelledNotice(7, [5], now)).resolves.toBeNull();
    spy.mockRestore();
  });
});

describe("sendSessionCancelledNotice", () => {
  it("writes SESSION_CANCELLED with the calendar link", async () => {
    await sendSessionCancelledNotice({ recipientIds: [11, 40], title: "Cancelled: Week 1 on …" });
    expect(mockNotify).toHaveBeenCalledWith([11, 40], {
      type: "SESSION_CANCELLED",
      title: "Cancelled: Week 1 on …",
      body: undefined,
      link: "/student/calendar",
    });
    expect(parseNotificationLink("/student/calendar")).toEqual({ entityType: "calendar", entityId: null });
  });

  it("does nothing for no notice, and never rejects", async () => {
    await sendSessionCancelledNotice(null);
    expect(mockNotify).not.toHaveBeenCalled();

    mockNotify.mockRejectedValue(new Error("db down"));
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(sendSessionCancelledNotice({ recipientIds: [1], title: "t" })).resolves.toBeUndefined();
    spy.mockRestore();
  });
});

describe("DELETE /sessions/:id", () => {
  const admin: SessionUser = {
    userId: 1, role: "ADMIN", seasonAdminIds: [7], groupLeaderIds: [],
    activeSeasonId: 7, graduationYear: null,
  };
  const fakeRes = () => {
    const res = { status: jest.fn(), json: jest.fn() };
    res.status.mockReturnValue(res);
    res.json.mockReturnValue(res);
    return res;
  };
  const deleteReq = (body: unknown) =>
    ({ user: admin, params: { id: "5" }, query: {}, body }) as unknown as Request;
  const order: string[] = [];

  beforeEach(() => {
    order.length = 0;
    mockDb.session.findUnique.mockResolvedValue({
      id: 5, seasonId: 7, recurrenceGroupId: null, startsAt: new Date(Date.now() + 86_400_000),
    });
    mockDb.attendance.count.mockResolvedValue(0);
    mockDb.sessionVideoProgress.count.mockResolvedValue(0);
    mockDb.session.findMany.mockImplementation(async () => {
      order.push("gather");
      return [week1];
    });
    mockDb.$transaction.mockImplementation(async () => {
      order.push("delete");
      return [{ count: 0 }, { count: 0 }, { count: 1 }];
    });
    mockNotify.mockImplementation(async () => {
      order.push("notify");
      return { written: 4, suppressed: 0 };
    });
  });

  it("gathers before the delete and notifies after it commits", async () => {
    const res = fakeRes();
    await deleteSession(deleteReq({}), res as unknown as Response);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(order).toEqual(["gather", "delete", "notify"]);
    expect(mockNotify).toHaveBeenCalledWith(
      [11, 12, 40, 41],
      expect.objectContaining({ type: "SESSION_CANCELLED", link: "/student/calendar" }),
    );
  });

  it("notifies nobody when the delete is refused", async () => {
    mockDb.attendance.count.mockResolvedValue(3);
    const res = fakeRes();
    await deleteSession(deleteReq({}), res as unknown as Response);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("notifies nobody when the transaction fails", async () => {
    mockDb.$transaction.mockRejectedValue(new Error("deadlock"));
    await expect(deleteSession(deleteReq({}), fakeRes() as unknown as Response)).rejects.toThrow("deadlock");
    expect(mockNotify).not.toHaveBeenCalled();
  });
});
