/** The student list's owner-ruled words, per audience and filter (refactor FE-061). */
import { DEFAULT_STUDENT_VIEW } from "../hooks/use-students";
import { studentListCopy } from "../screens/students-list/copy";

const view = (over = {}) => ({ ...DEFAULT_STUDENT_VIEW, ...over });
const copy = (audience: "staff" | "mentor", shown: "active" | "alumni" | "dropped", over = {}, q = "") =>
  studentListCopy({ audience, shown, view: view(over), q });

describe("studentListCopy", () => {
  it("says students and their seasons to staff, per list", () => {
    expect(copy("staff", "active")).toMatchObject({
      searchLabel: "Search students",
      emptyTitle: "No students yet",
      emptyDescription: "Students will appear here once they're enrolled.",
    });
    expect(copy("staff", "active").subtitle(1)).toBe("1 student in your seasons");
    expect(copy("staff", "active").subtitle(3)).toBe("3 students in your seasons");
    expect(copy("staff", "alumni")).toMatchObject({
      emptyTitle: "No alumni yet",
      emptyDescription: "Students you graduate will appear here.",
    });
    expect(copy("staff", "alumni").subtitle(2)).toBe("2 graduated students from your seasons");
    expect(copy("staff", "dropped")).toMatchObject({
      emptyTitle: "No dropped students",
      emptyDescription: "Students who leave a season without graduating will show up here.",
    });
    expect(copy("staff", "dropped").subtitle(1)).toBe("1 student dropped from your seasons");
  });

  it("says members to a mentor, never seasons", () => {
    expect(copy("mentor", "active")).toMatchObject({
      searchLabel: "Search members",
      emptyTitle: "No members yet",
      emptyDescription: "Members will appear here once they join a season.",
    });
    expect(copy("mentor", "active").subtitle(1)).toBe("1 member");
    expect(copy("mentor", "active", { absentLately: true }).subtitle(4)).toBe("4 members absent lately");
    // A mentor's alumni list keeps the list's own empty copy.
    expect(copy("mentor", "alumni")).toMatchObject({ emptyTitle: "No alumni yet" });
  });

  it("explains an empty filtered list by the first filter that applies", () => {
    expect(copy("staff", "active", {}, "sam")).toMatchObject({
      emptyTitle: "No matches",
      emptyDescription: "No students match your search.",
    });
    expect(copy("mentor", "active", { absentLately: true }, "sam").emptyDescription).toBe(
      "No members match your search.",
    );
    expect(copy("mentor", "active", { absentLately: true })).toMatchObject({
      emptyTitle: "No matches",
      emptyDescription: "Nobody has missed their last two sessions.",
    });
    expect(copy("staff", "active", { groupId: 3, seasonId: 7 }).emptyDescription).toBe(
      "No students are in that group.",
    );
    expect(copy("staff", "active", { groupId: "none" }).emptyDescription).toBe("No students are in that group.");
    expect(copy("staff", "alumni", { seasonId: 7 })).toMatchObject({
      emptyTitle: "No matches",
      emptyDescription: "No students are in that season.",
    });
  });
});
