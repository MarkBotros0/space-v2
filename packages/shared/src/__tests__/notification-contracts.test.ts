// packages/shared/src/__tests__/notification-contracts.test.ts
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  DEVICE_PLATFORM_TO_DB,
  NOTIFICATION_PREFERENCE_KEYS,
  NOTIFICATION_PREFERENCE_KEY_BY_TYPE,
  PUSH_NOTIFICATION_TYPES,
  deviceRegistrationSchema,
  markReadRequestSchema,
  notificationListQuerySchema,
  notificationPreferencesSchema,
  notificationSchema,
  notificationTypeSchema,
  shouldPush,
} from "../index";

describe("notificationTypeSchema", () => {
  it("mirrors the six values in prisma/schema.prisma:63-70", () => {
    expect(notificationTypeSchema.options).toEqual([
      "ASSIGNMENT_CREATED",
      "SUBMISSION_REVIEWED",
      "SESSION_RESCHEDULED",
      "LOW_ATTENDANCE_FLAG",
      "MENTOR_FOLLOWUP",
      "QUIZ_GRADED",
    ]);
  });
});

describe("notificationPreferencesSchema", () => {
  it("carries one key per notification type — all six, derived from the enum", () => {
    // v1 lost quizGraded precisely by hand-writing five of six field names
    // (spec R56, R57). The shape is derived here, and this is the runtime
    // half of that guarantee; the `satisfies` in the source is the compile half.
    expect(Object.keys(notificationPreferencesSchema.shape).sort()).toEqual(
      notificationTypeSchema.options
        .map((t) => NOTIFICATION_PREFERENCE_KEY_BY_TYPE[t])
        .sort(),
    );
    expect(NOTIFICATION_PREFERENCE_KEYS).toHaveLength(6);
    expect(NOTIFICATION_PREFERENCE_KEYS).toContain("quizGraded");
  });

  it("defaults every key to true — a user with no row is opted in (R6, R58)", () => {
    expect(DEFAULT_NOTIFICATION_PREFERENCES).toEqual({
      assignmentCreated: true,
      submissionReviewed: true,
      sessionRescheduled: true,
      lowAttendanceFlag: true,
      mentorFollowup: true,
      quizGraded: true,
    });
  });

  it("refuses a partial body — PUT carries all six keys", () => {
    expect(notificationPreferencesSchema.safeParse({ assignmentCreated: false }).success).toBe(
      false,
    );
    expect(notificationPreferencesSchema.safeParse(DEFAULT_NOTIFICATION_PREFERENCES).success).toBe(
      true,
    );
  });
});

describe("markReadRequestSchema", () => {
  it("accepts either ids or all: true, never both, never a userId", () => {
    expect(markReadRequestSchema.safeParse({ ids: [1, 2, 3] }).success).toBe(true);
    expect(markReadRequestSchema.safeParse({ all: true }).success).toBe(true);
    expect(markReadRequestSchema.safeParse({ ids: [1], all: true }).success).toBe(false);
    // Accepting a recipient id from a client is how this domain's one safe
    // property (everything is self-service — spec §4) would be lost.
    expect(markReadRequestSchema.safeParse({ ids: [1], userId: 2 }).success).toBe(false);
    expect(markReadRequestSchema.safeParse({ ids: [] }).success).toBe(false);
    expect(markReadRequestSchema.safeParse({ all: false }).success).toBe(false);
  });

  it("bounds the id batch", () => {
    expect(markReadRequestSchema.safeParse({ ids: Array.from({ length: 201 }, (_, i) => i + 1) }).success).toBe(
      false,
    );
  });
});

describe("notificationListQuerySchema", () => {
  it("coerces query strings and defaults to a 20-row page", () => {
    expect(notificationListQuerySchema.parse({})).toEqual({ limit: 20, unreadOnly: false });
    expect(notificationListQuerySchema.parse({ cursor: "41", limit: "50", unreadOnly: "true" })).toEqual({
      cursor: 41,
      limit: 50,
      unreadOnly: true,
    });
  });

  it("caps the page at 50", () => {
    expect(notificationListQuerySchema.safeParse({ limit: "500" }).success).toBe(false);
  });
});

describe("notificationSchema", () => {
  it("carries the raw v1 link and the parsed target side by side (D1)", () => {
    const parsed = notificationSchema.parse({
      id: 7,
      type: "SUBMISSION_REVIEWED",
      title: "Essay one was reviewed",
      body: null,
      link: "/student/assignments/41",
      target: { entityType: "assignment", entityId: 41 },
      readAt: null,
      createdAt: "2026-08-24T10:00:00.000Z",
    });
    expect(parsed.target).toEqual({ entityType: "assignment", entityId: 41 });
  });

  it("allows a null target for a link shape nothing recognises", () => {
    expect(
      notificationSchema.safeParse({
        id: 7,
        type: "QUIZ_GRADED",
        title: "t",
        body: null,
        link: "/super/somewhere-new",
        target: null,
        readAt: null,
        createdAt: "2026-08-24T10:00:00.000Z",
      }).success,
    ).toBe(true);
  });
});

describe("push policy", () => {
  it("pushes only the three types the recipient is actively waiting on", () => {
    expect([...PUSH_NOTIFICATION_TYPES].sort()).toEqual([
      "QUIZ_GRADED",
      "SESSION_RESCHEDULED",
      "SUBMISSION_REVIEWED",
    ]);
    expect(shouldPush("SESSION_RESCHEDULED")).toBe(true);
    // The highest-volume fan-out in the system (spec D5 item 2).
    expect(shouldPush("ASSIGNMENT_CREATED")).toBe(false);
    // Can burst (04 R87, no dedupe) and is deferred until 04's D7/D12 settle.
    expect(shouldPush("LOW_ATTENDANCE_FLAG")).toBe(false);
    // Names a student flagged for pastoral follow-up — never on a lock screen (R64).
    expect(shouldPush("MENTOR_FOLLOWUP")).toBe(false);
  });
});

describe("deviceRegistrationSchema", () => {
  it("takes a token and a platform, and no user id", () => {
    expect(deviceRegistrationSchema.safeParse({ token: "ExponentPushToken[x]", platform: "ios" }).success).toBe(
      true,
    );
    expect(
      deviceRegistrationSchema.safeParse({ token: "t", platform: "ios", userId: 3 }).success,
    ).toBe(false);
    expect(deviceRegistrationSchema.safeParse({ token: "t", platform: "web" }).success).toBe(false);
  });

  it("maps the lowercase wire platform to Plan 18 M10's DevicePlatform enum", () => {
    expect(DEVICE_PLATFORM_TO_DB).toEqual({ ios: "IOS", android: "ANDROID" });
  });
});
