import { routeForTarget } from "../lib/notification-route";

describe("routeForTarget", () => {
  it("sends an assignment target to the assignment detail route", () => {
    expect(routeForTarget({ entityType: "assignment", entityId: 41 })).toEqual({
      pathname: "/assignment/[id]",
      params: { id: "41" },
    });
  });

  it("falls back to the list when the target names no specific row", () => {
    expect(routeForTarget({ entityType: "assignment", entityId: null })).toEqual({
      pathname: "/assignments",
    });
    expect(routeForTarget({ entityType: "quiz", entityId: null })).toEqual({
      pathname: "/quizzes",
    });
    expect(routeForTarget({ entityType: "calendar", entityId: null })).toEqual({
      pathname: "/calendar",
    });
  });

  it("deep-links a student target to the student detail route", () => {
    // Plan 7 shipped the /student/[id] route (student/[id]/index.tsx since Plan 10) before this plan.
    expect(routeForTarget({ entityType: "student", entityId: 12 })).toEqual({
      pathname: "/student/[id]",
      params: { id: "12" },
    });
  });

  it("opens the review screen for a submission target, by publicId", () => {
    expect(routeForTarget({ entityType: "submission", entityId: "Ab3dE5gH9k" })).toEqual({
      pathname: "/submission/[publicId]",
      params: { publicId: "Ab3dE5gH9k" },
    });
  });

  it("opens the announcement, or the feed when there is no id", () => {
    expect(routeForTarget({ entityType: "announcement", entityId: 7 })).toEqual({
      pathname: "/announcements/[id]",
      params: { id: "7" },
    });
    expect(routeForTarget({ entityType: "announcement", entityId: null })).toEqual({
      pathname: "/announcements",
    });
  });

  it("returns null for a notification with no resolvable target", () => {
    expect(routeForTarget(null)).toBeNull();
  });
});
