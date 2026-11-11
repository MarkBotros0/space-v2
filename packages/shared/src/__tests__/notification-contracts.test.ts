// packages/shared/src/__tests__/notification-contracts.test.ts
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  DEVICE_PLATFORM_TO_DB,
  NOTIFICATION_PREFERENCE_KEY_BY_TYPE,
  PUSH_NOTIFICATION_TYPES,
  deviceRegistrationSchema,
  markReadRequestSchema,
  notificationListQuerySchema,
  notificationPreferencesSchema,
  notificationSchema,
  notificationTypeSchema,
  pushContent,
  shouldPush,
} from "../index";

describe("notificationTypeSchema", () => {
  it("mirrors the eleven values of NotificationType in prisma/schema.prisma", () => {
    expect(notificationTypeSchema.options).toEqual([
      "ASSIGNMENT_CREATED",
      "SUBMISSION_REVIEWED",
      "SESSION_RESCHEDULED",
      "LOW_ATTENDANCE_FLAG",
      "MENTOR_FOLLOWUP",
      "QUIZ_GRADED",
      "QUIZ_PUBLISHED",
      "SUBMISSION_RECEIVED",
      "SESSION_CANCELLED",
      "ANNOUNCEMENT",
      "ASSIGNMENT_REMINDER",
    ]);
  });
});

describe("notificationPreferencesSchema", () => {
  it("carries one key per preference column — ten, derived from the enum", () => {
    // v1 lost quizGraded precisely by hand-writing five of six field names
    // (spec R56, R57). The shape is derived here, and this is the runtime
    // half of that guarantee; the `satisfies` in the source is the compile half.
    expect(Object.keys(notificationPreferencesSchema.shape).sort()).toEqual(
      [...new Set(notificationTypeSchema.options.map((t) => NOTIFICATION_PREFERENCE_KEY_BY_TYPE[t]))].sort(),
    );
    expect(Object.values(NOTIFICATION_PREFERENCE_KEY_BY_TYPE)).toHaveLength(11);
    expect(new Set(Object.values(NOTIFICATION_PREFERENCE_KEY_BY_TYPE)).size).toBe(10);
    expect(Object.values(NOTIFICATION_PREFERENCE_KEY_BY_TYPE)).toContain("quizGraded");
  });

  it("turns the assignment reminder off with the assignments setting (no column of its own)", () => {
    expect(NOTIFICATION_PREFERENCE_KEY_BY_TYPE.ASSIGNMENT_REMINDER).toBe("assignmentCreated");
  });

  it("maps each of the three new types to its own column", () => {
    expect(NOTIFICATION_PREFERENCE_KEY_BY_TYPE.QUIZ_PUBLISHED).toBe("quizPublished");
    expect(NOTIFICATION_PREFERENCE_KEY_BY_TYPE.SUBMISSION_RECEIVED).toBe("submissionReceived");
    expect(NOTIFICATION_PREFERENCE_KEY_BY_TYPE.SESSION_CANCELLED).toBe("sessionCancelled");
  });

  it("defaults every key to true — a user with no row is opted in (R6, R58)", () => {
    expect(DEFAULT_NOTIFICATION_PREFERENCES).toEqual({
      assignmentCreated: true,
      submissionReviewed: true,
      sessionRescheduled: true,
      lowAttendanceFlag: true,
      mentorFollowup: true,
      quizGraded: true,
      quizPublished: true,
      submissionReceived: true,
      sessionCancelled: true,
      announcement: true,
    });
  });

  it("refuses a partial body — PUT carries every key", () => {
    expect(notificationPreferencesSchema.safeParse({ assignmentCreated: false }).success).toBe(false);
    expect(notificationPreferencesSchema.safeParse(DEFAULT_NOTIFICATION_PREFERENCES).success).toBe(true);
    // The six keys an older client sends are no longer a full body.
    const added = ["quizPublished", "submissionReceived", "sessionCancelled"];
    const six = Object.fromEntries(
      Object.entries(DEFAULT_NOTIFICATION_PREFERENCES).filter(([k]) => !added.includes(k)),
    );
    expect(notificationPreferencesSchema.safeParse(six).success).toBe(false);
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
    expect(markReadRequestSchema.safeParse({ ids: Array.from({ length: 201 }, (_, i) => i + 1) }).success).toBe(false);
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

  it("addresses a submission by its publicId, every other entity by a numeric id", () => {
    const base = {
      id: 8,
      type: "SUBMISSION_RECEIVED",
      title: "Salma submitted Essay one",
      body: null,
      link: "/leader/submissions/Ab3dE5gH9k",
      readAt: null,
      createdAt: "2026-11-04T10:00:00.000Z",
    };
    expect(
      notificationSchema.parse({ ...base, target: { entityType: "submission", entityId: "Ab3dE5gH9k" } }).target,
    ).toEqual({ entityType: "submission", entityId: "Ab3dE5gH9k" });
    expect(notificationSchema.safeParse({ ...base, target: { entityType: "submission", entityId: 41 } }).success).toBe(
      false,
    );
    expect(
      notificationSchema.safeParse({ ...base, target: { entityType: "submission", entityId: null } }).success,
    ).toBe(false);
    expect(
      notificationSchema.safeParse({ ...base, target: { entityType: "assignment", entityId: "41" } }).success,
    ).toBe(false);
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
  it("pushes every notification type", () => {
    expect([...PUSH_NOTIFICATION_TYPES].sort()).toEqual([
      "ANNOUNCEMENT",
      "ASSIGNMENT_CREATED",
      "ASSIGNMENT_REMINDER",
      "LOW_ATTENDANCE_FLAG",
      "MENTOR_FOLLOWUP",
      "QUIZ_GRADED",
      "QUIZ_PUBLISHED",
      "SESSION_CANCELLED",
      "SESSION_RESCHEDULED",
      "SUBMISSION_RECEIVED",
      "SUBMISSION_REVIEWED",
    ]);
    expect(shouldPush("ASSIGNMENT_CREATED")).toBe(true);
    expect(shouldPush("QUIZ_PUBLISHED")).toBe(true);
    expect(shouldPush("SUBMISSION_RECEIVED")).toBe(true);
    expect(shouldPush("SESSION_CANCELLED")).toBe(true);
  });

  it("never puts a follow-up's student name on a lock screen (R64)", () => {
    const shown = pushContent("MENTOR_FOLLOWUP", "Follow-up: Salma Student", "Check in this week");
    expect(shown.title).not.toContain("Salma");
    expect(shown.body ?? "").not.toContain("Salma");
  });

  it("keeps the in-app text for the new types", () => {
    expect(pushContent("SESSION_CANCELLED", "Cancelled: Week 3", null)).toEqual({
      title: "Cancelled: Week 3",
      body: null,
    });
  });

  it("keeps the in-app text for every other type", () => {
    expect(pushContent("QUIZ_GRADED", "Quiz graded", "You scored 82.")).toEqual({
      title: "Quiz graded",
      body: "You scored 82.",
    });
  });
});

describe("deviceRegistrationSchema", () => {
  it("takes a token and a platform, and no user id", () => {
    expect(deviceRegistrationSchema.safeParse({ token: "ExponentPushToken[x]", platform: "ios" }).success).toBe(true);
    expect(deviceRegistrationSchema.safeParse({ token: "t", platform: "ios", userId: 3 }).success).toBe(false);
    expect(deviceRegistrationSchema.safeParse({ token: "t", platform: "web" }).success).toBe(false);
  });

  it("maps the lowercase wire platform to Plan 18 M10's DevicePlatform enum", () => {
    expect(DEVICE_PLATFORM_TO_DB).toEqual({ ios: "IOS", android: "ANDROID" });
  });
});
