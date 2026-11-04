/** The Expo push sender and its fan-out from createNotificationsBulk, with db and fetch mocked. */
const mockDb = {
  deviceToken: { findMany: jest.fn(), deleteMany: jest.fn() },
  notificationPreference: { findMany: jest.fn() },
  notification: { createMany: jest.fn() },
  user: { findMany: jest.fn() },
};
jest.mock("../db/client", () => ({ db: mockDb }));
jest.mock("../lib/email", () => ({ sendNotificationEmail: jest.fn(async () => undefined) }));

import { config } from "../lib/config";
import { createNotificationsBulk } from "../lib/notifications";
import { EXPO_PUSH_URL, sendPushToUsers } from "../lib/push";

const fetchMock = jest.fn();
const settle = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
  jest.resetAllMocks();
  global.fetch = fetchMock as unknown as typeof fetch;
  (config as { enablePush: boolean }).enablePush = true;
  mockDb.deviceToken.deleteMany.mockResolvedValue({ count: 0 });
  fetchMock.mockImplementation(async (_url: string, init: { body: string }) => ({
    ok: true,
    json: async () => ({ data: JSON.parse(init.body).map(() => ({ status: "ok" })) }),
  }));
});

const payload = { title: "Quiz graded", body: "You scored 82.", data: { type: "QUIZ_GRADED", target: { entityType: "quiz" as const, entityId: null } } };

describe("sendPushToUsers", () => {
  it("sends one message per registered device, in batches of 100", async () => {
    mockDb.deviceToken.findMany.mockResolvedValue(
      Array.from({ length: 150 }, (_, i) => ({ token: `ExponentPushToken[${i}]` })),
    );
    await sendPushToUsers([1, 2], payload);

    expect(mockDb.deviceToken.findMany).toHaveBeenCalledWith({ where: { userId: { in: [1, 2] } }, select: { token: true } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(EXPO_PUSH_URL);
    const first = JSON.parse(init.body);
    expect(first).toHaveLength(100);
    expect(first[0]).toMatchObject({ to: "ExponentPushToken[0]", title: "Quiz graded", body: "You scored 82.", data: payload.data });
  });

  it("deletes tokens Expo reports as DeviceNotRegistered", async () => {
    mockDb.deviceToken.findMany.mockResolvedValue([{ token: "a" }, { token: "b" }]);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ status: "ok" }, { status: "error", details: { error: "DeviceNotRegistered" } }] }),
    });
    await sendPushToUsers([1], payload);
    expect(mockDb.deviceToken.deleteMany).toHaveBeenCalledWith({ where: { token: { in: ["b"] } } });
  });

  it("does nothing when push is switched off or no device is registered", async () => {
    (config as { enablePush: boolean }).enablePush = false;
    await sendPushToUsers([1], payload);
    expect(mockDb.deviceToken.findMany).not.toHaveBeenCalled();

    (config as { enablePush: boolean }).enablePush = true;
    mockDb.deviceToken.findMany.mockResolvedValue([]);
    await sendPushToUsers([1], payload);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws on a non-2xx answer so the background runner logs it", async () => {
    mockDb.deviceToken.findMany.mockResolvedValue([{ token: "a" }]);
    fetchMock.mockResolvedValue({ ok: false, status: 503 });
    await expect(sendPushToUsers([1], payload)).rejects.toThrow("503");
  });
});

describe("createNotificationsBulk push fan-out", () => {
  beforeEach(() => {
    mockDb.notification.createMany.mockResolvedValue({ count: 2 });
    mockDb.user.findMany.mockResolvedValue([]);
    mockDb.deviceToken.findMany.mockResolvedValue([{ token: "t" }]);
  });

  it("pushes to everyone except recipients who turned the type off", async () => {
    mockDb.notificationPreference.findMany.mockResolvedValue([{ userId: 2, quizGraded: false }]);
    await createNotificationsBulk([1, 2], { type: "QUIZ_GRADED", title: "Quiz graded", link: "/student/quizzes" });
    await settle();
    expect(mockDb.deviceToken.findMany).toHaveBeenCalledWith({ where: { userId: { in: [1] } }, select: { token: true } });
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body)[0];
    expect(sent.data).toEqual({ type: "QUIZ_GRADED", target: { entityType: "quiz", entityId: null } });
  });

  it("sends neutral text for a mentor follow-up, never the student's name", async () => {
    mockDb.notificationPreference.findMany.mockResolvedValue([]);
    await createNotificationsBulk([1], { type: "MENTOR_FOLLOWUP", title: "Follow-up: Salma Student" });
    await settle();
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body)[0];
    expect(sent.title).toBe("Follow-up requested");
    expect(JSON.stringify(sent)).not.toContain("Salma");
  });
});
