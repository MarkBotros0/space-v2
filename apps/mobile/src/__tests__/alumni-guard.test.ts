import { isBlockedForAlumni } from "../lib/alumni-guard";

describe("isBlockedForAlumni (REG-81)", () => {
  it.each(["season", "assignments", "quizzes", "attendance", "assignment", "quiz"])("blocks %s", (seg) => {
    expect(isBlockedForAlumni(["(app)", seg])).toBe(true);
  });

  it.each(["dashboard", "calendar", "history", "profile", "notifications", "settings", "more", "seasons", "session"])(
    "lets an alumnus reach %s",
    (seg) => {
      expect(isBlockedForAlumni(["(app)", seg])).toBe(false);
    },
  );
});
