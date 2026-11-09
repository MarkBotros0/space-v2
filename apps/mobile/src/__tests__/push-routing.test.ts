import { routeForPushData } from "../lib/push-routing";

describe("routeForPushData", () => {
  it("opens the screen the inbox would for the same target", () => {
    expect(
      routeForPushData({ type: "ASSIGNMENT_CREATED", target: { entityType: "assignment", entityId: 12 } }),
    ).toEqual({
      pathname: "/assignment/[id]",
      params: { id: "12" },
    });
    expect(routeForPushData({ type: "QUIZ_GRADED", target: { entityType: "quiz", entityId: null } })).toEqual({
      pathname: "/quizzes",
    });
    expect(
      routeForPushData({ type: "SUBMISSION_RECEIVED", target: { entityType: "submission", entityId: "Ab3dE5gH9k" } }),
    ).toEqual({ pathname: "/submission/[publicId]", params: { publicId: "Ab3dE5gH9k" } });
    expect(routeForPushData({ type: "SESSION_CANCELLED", target: { entityType: "calendar", entityId: null } })).toEqual(
      {
        pathname: "/calendar",
      },
    );
  });

  it("opens the inbox for a missing or malformed target", () => {
    expect(routeForPushData({ type: "MENTOR_FOLLOWUP", target: null })).toEqual({ pathname: "/notifications" });
    expect(routeForPushData({ target: { entityType: "nope", entityId: "x" } })).toEqual({ pathname: "/notifications" });
    expect(routeForPushData(undefined)).toEqual({ pathname: "/notifications" });
    // A submission is addressed by publicId only; a numeric id is malformed.
    expect(routeForPushData({ target: { entityType: "submission", entityId: 41 } })).toEqual({
      pathname: "/notifications",
    });
  });
});
