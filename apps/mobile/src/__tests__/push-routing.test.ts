import { routeForPushData } from "../lib/push-routing";

describe("routeForPushData", () => {
  it("opens the screen the inbox would for the same target", () => {
    expect(routeForPushData({ type: "ASSIGNMENT_CREATED", target: { entityType: "assignment", entityId: 12 } })).toEqual({
      pathname: "/assignment/[id]",
      params: { id: "12" },
    });
    expect(routeForPushData({ type: "QUIZ_GRADED", target: { entityType: "quiz", entityId: null } })).toEqual({
      pathname: "/quizzes",
    });
  });

  it("opens the inbox for a missing or malformed target", () => {
    expect(routeForPushData({ type: "MENTOR_FOLLOWUP", target: null })).toEqual({ pathname: "/notifications" });
    expect(routeForPushData({ target: { entityType: "nope", entityId: "x" } })).toEqual({ pathname: "/notifications" });
    expect(routeForPushData(undefined)).toEqual({ pathname: "/notifications" });
  });
});
