import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestUser, login } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

let prefsUserId: number;
let prefsToken: string;
let otherUserId: number;

beforeAll(async () => {
  await cleanupTestData();
  const prefsUser = await createTestUser("prefs", "STUDENT");
  const other = await createTestUser("prefs-other", "STUDENT");
  prefsUserId = prefsUser.id;
  otherUserId = other.id;
  prefsToken = await login(app, prefsUser.email);
});

afterAll(async () => {
  await db.notificationPreference.deleteMany({ where: { userId: { in: [prefsUserId, otherUserId] } } });
  await cleanupTestData();
  await db.$disconnect();
});

describe("notification preferences", () => {
  const allTrue = {
    assignmentCreated: true,
    submissionReviewed: true,
    sessionRescheduled: true,
    lowAttendanceFlag: true,
    mentorFollowup: true,
    quizGraded: true,
  };

  afterEach(async () => {
    await db.notificationPreference.deleteMany({ where: { userId: prefsUserId } });
  });

  it("returns all six keys, all true, when the user has no row (R6, R58, R59)", async () => {
    const res = await request(app)
      .get("/api/v1/me/notification-preferences")
      .set("authorization", `Bearer ${prefsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.preferences).toEqual(allTrue);
  });

  it("creates the row on first write and returns what was stored", async () => {
    const res = await request(app)
      .put("/api/v1/me/notification-preferences")
      .set("authorization", `Bearer ${prefsToken}`)
      .send({ ...allTrue, assignmentCreated: false, quizGraded: false });

    expect(res.status).toBe(200);
    expect(res.body.data.preferences.assignmentCreated).toBe(false);
    // v1 could not turn this one off from any surface: its input type declared
    // five fields and the form rendered five toggles, so the column kept its
    // default forever (R56, R57).
    expect(res.body.data.preferences.quizGraded).toBe(false);

    const row = await db.notificationPreference.findUnique({ where: { userId: prefsUserId } });
    expect(row?.quizGraded).toBe(false);
  });

  it("updates the existing row rather than creating a second", async () => {
    await request(app)
      .put("/api/v1/me/notification-preferences")
      .set("authorization", `Bearer ${prefsToken}`)
      .send({ ...allTrue, mentorFollowup: false });
    await request(app)
      .put("/api/v1/me/notification-preferences")
      .set("authorization", `Bearer ${prefsToken}`)
      .send(allTrue);

    const rows = await db.notificationPreference.findMany({ where: { userId: prefsUserId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.mentorFollowup).toBe(true);
  });

  it("refuses a partial body — PUT replaces all six", async () => {
    const res = await request(app)
      .put("/api/v1/me/notification-preferences")
      .set("authorization", `Bearer ${prefsToken}`)
      .send({ assignmentCreated: false });

    expect(res.status).toBe(400);
  });

  it("never lets a caller write someone else's preferences", async () => {
    // The target is not an input at all (R54) — a userId in the body is
    // ignored by the schema and the row written is the token's.
    const res = await request(app)
      .put("/api/v1/me/notification-preferences")
      .set("authorization", `Bearer ${prefsToken}`)
      .send({ ...allTrue, userId: otherUserId, assignmentCreated: false });

    expect(res.status).toBe(200);
    expect(await db.notificationPreference.findUnique({ where: { userId: otherUserId } })).toBeNull();
  });

  it("refuses an anonymous caller", async () => {
    expect((await request(app).get("/api/v1/me/notification-preferences")).status).toBe(401);
  });
});

describe("POST /api/v1/me/devices", () => {
  it("answers 503 push_unavailable — there is no table to write to yet", async () => {
    // The schema is frozen while v1 runs (ruling C1) and there is no
    // DeviceToken model, so registration cannot be honoured. 503 rather than
    // 404 or 501: the endpoint exists and the caller is entitled to it, the
    // capability is switched off — the same shape as uploads_disabled.
    const res = await request(app)
      .post("/api/v1/me/devices")
      .set("authorization", `Bearer ${prefsToken}`)
      .send({ token: "ExponentPushToken[space-v2-test]", platform: "ios" });

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("push_unavailable");
  });

  it("validates the body before answering, so the contract is exercised now", async () => {
    const res = await request(app)
      .post("/api/v1/me/devices")
      .set("authorization", `Bearer ${prefsToken}`)
      .send({ token: "t", platform: "web" });

    expect(res.status).toBe(400);
  });

  it("refuses an anonymous caller", async () => {
    const res = await request(app)
      .post("/api/v1/me/devices")
      .send({ token: "t", platform: "ios" });
    expect(res.status).toBe(401);
  });
});
