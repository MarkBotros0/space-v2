import { isBlockedForAlumni } from "../lib/alumni-guard";

describe("isBlockedForAlumni (REG-81)", () => {
  it.each(["season", "work", "assignments", "quizzes", "attendance", "assignment", "quiz"])("blocks %s", (seg) => {
    expect(isBlockedForAlumni(["(app)", seg])).toBe(true);
  });

  it.each(["dashboard", "calendar", "history", "profile", "notifications", "settings", "more", "seasons", "session"])(
    "lets an alumnus reach %s",
    (seg) => {
      expect(isBlockedForAlumni(["(app)", seg])).toBe(false);
    },
  );
});

describe("isBlockedForAlumni under the (tabs) group (redesign Task 9)", () => {
  it("skips both groups for a tab: segments gain \"(tabs)\"", () => {
    expect(isBlockedForAlumni(["(app)", "(tabs)", "work"])).toBe(true);
    expect(isBlockedForAlumni(["(app)", "(tabs)", "history"])).toBe(false);
  });

  it("still reads the first segment of a detail route on the stack", () => {
    expect(isBlockedForAlumni(["(app)", "quiz", "[id]"])).toBe(true);
    expect(isBlockedForAlumni(["(app)", "session", "[id]"])).toBe(false);
  });
});
