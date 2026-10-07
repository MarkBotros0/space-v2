import { NOTIFICATION_LINK_PATTERNS, parseNotificationLink } from "../lib/notification-target";

describe("parseNotificationLink", () => {
  // The complete set of link shapes v1 emits (jpc-space src/lib, nine
  // producers, five shapes — see the table in this task). Ruling X1: every v2
  // producer writes one of these. Anything else is a null target and a list
  // fallback on the client.
  it.each([
    ["/student/assignments/41", { entityType: "assignment", entityId: 41 }],
    ["/student/quizzes", { entityType: "quiz", entityId: null }],
    ["/student/calendar", { entityType: "calendar", entityId: null }],
    ["/admin/students/12", { entityType: "student", entityId: 12 }],
    ["/leader/students/12", { entityType: "student", entityId: 12 }],
  ])("maps %s", (link, expected) => {
    expect(parseNotificationLink(link)).toEqual(expected);
  });

  it("knows exactly five shapes — the set Plan 18's M4 backfill must mirror", () => {
    expect(NOTIFICATION_LINK_PATTERNS).toHaveLength(5);
  });

  it("returns null for a null link, an unknown shape, or a non-numeric id", () => {
    expect(parseNotificationLink(null)).toBeNull();
    expect(parseNotificationLink("/super/reports")).toBeNull();
    expect(parseNotificationLink("/student/assignments/abc")).toBeNull();
    // Not a v1 shape (no producer writes the bare list path).
    expect(parseNotificationLink("/student/assignments")).toBeNull();
    // Not v1's route either: v1 writes the quiz LIST for QUIZ_GRADED.
    expect(parseNotificationLink("/student/quizzes/7")).toBeNull();
    expect(parseNotificationLink("https://evil.test/student/assignments/1")).toBeNull();
  });

  it("ignores a trailing slash and a query string", () => {
    expect(parseNotificationLink("/student/assignments/41/")).toEqual({
      entityType: "assignment",
      entityId: 41,
    });
    expect(parseNotificationLink("/student/calendar?from=mail")).toEqual({
      entityType: "calendar",
      entityId: null,
    });
  });
});
