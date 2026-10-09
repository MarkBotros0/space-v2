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

  it("creates the row on first write and leaves quizGraded untouched (v1 R56, R57)", async () => {
    const res = await request(app)
      .put("/api/v1/me/notification-preferences")
      .set("authorization", `Bearer ${prefsToken}`)
      .send({ ...allTrue, assignmentCreated: false, quizGraded: false });

    expect(res.status).toBe(200);
    expect(res.body.data.preferences.assignmentCreated).toBe(false);
    // v1's action takes five fields (settings-actions.ts:58-73); quizGraded is
    // not settable, so the sent `false` is stripped and the default stays.
    expect(res.body.data.preferences.quizGraded).toBe(true);

    const row = await db.notificationPreference.findUnique({ where: { userId: prefsUserId } });
    expect(row?.quizGraded).toBe(true);
  });

  it("accepts v1's five keys without quizGraded", async () => {
    const { quizGraded: _omit, ...five } = allTrue;
    const res = await request(app)
      .put("/api/v1/me/notification-preferences")
      .set("authorization", `Bearer ${prefsToken}`)
      .send({ ...five, mentorFollowup: false });

    expect(res.status).toBe(200);
    expect(res.body.data.preferences).toEqual({ ...allTrue, mentorFollowup: false });
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

  it("refuses a partial body — PUT replaces all five", async () => {
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
