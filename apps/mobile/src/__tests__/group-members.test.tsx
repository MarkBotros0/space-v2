// The group form's Members (owner, 2026-11-07): only the season's people, each
// row saying where they are now; an empty season points to the season page.
import { fireEvent, screen } from "@testing-library/react-native";

import { MembersField } from "../screens/group-form/members-field";
import { memberLine, memberSections, membersSummary } from "../screens/group-form/members-model";
import { studentsSummary } from "../screens/season/students-level";
import { renderWithProviders } from "./helpers/render";

const roster = [
  { userId: 1, name: "Abanob Magdy", email: "a@jpc.test", groupId: 10, groupName: "Group 1" },
  { userId: 2, name: "Aiten Tarek", email: "b@jpc.test", groupId: null, groupName: null },
  { userId: 3, name: "Amir Samir", email: "c@jpc.test", groupId: 20, groupName: "Group 2" },
];

describe("members model", () => {
  it("says where each person is now", () => {
    expect(memberLine(roster[0]!, 10)).toBe("In this group");
    expect(memberLine(roster[1]!, 10)).toBe("Not in a group yet");
    expect(memberLine(roster[2]!, 10)).toBe("In Group 2 · picking moves them here");
    // A new group: everyone in a group is in another one.
    expect(memberLine(roster[0]!, null)).toBe("In Group 1 · picking moves them here");
  });

  it("sections by where they are, searches by name or email, and drops empty sections", () => {
    expect(memberSections(roster, 10, "").map((s) => [s.key, s.rows.map((r) => r.id)])).toEqual([
      ["this", [1]],
      ["none", [2]],
      ["other", [3]],
    ]);
    expect(memberSections(roster, null, "").map((s) => s.key)).toEqual(["none", "other"]);
    expect(memberSections(roster, 10, "c@jpc").map((s) => s.key)).toEqual(["other"]);
    expect(memberSections(roster, 10, "nobody")).toEqual([]);
  });

  it("sums up the picks in words", () => {
    expect(membersSummary(roster, [1], 10)).toBe("1 member. 1 person in the season isn't in a group.");
    expect(membersSummary(roster, [1, 2, 3], 10)).toBe("3 members. 1 moves here from another group.");
    expect(membersSummary(roster, [], null)).toBe("No members yet. 1 person in the season isn't in a group.");
  });
});

describe("the People card's Students summary", () => {
  it("names who is in the season and who is in no group", () => {
    expect(studentsSummary("GBV 2026", 0, 0, 1)).toBe("Nobody is in GBV 2026 yet.");
    expect(studentsSummary("GBV 2026", 3, 1, 1)).toBe("3 people are in GBV 2026. 1 isn't in a group yet.");
    expect(studentsSummary("GBV 2026", 3, 0, 1)).toBe("3 people are in GBV 2026. All are in a group.");
    expect(studentsSummary("GBV 2026", 2, 2, 1)).toBe("2 people are in GBV 2026. Nobody is in a group yet.");
    expect(studentsSummary("GBV 2026", 1, 1, 0)).toBe("1 person is in GBV 2026.");
  });
});

describe("MembersField", () => {
  it("with nobody in the season, says so and points to the season page", () => {
    const onOpenSeason = jest.fn();
    renderWithProviders(
      <MembersField
        roster={[]}
        groupId={null}
        seasonTitle="GBV 2026"
        value={[]}
        onChange={jest.fn()}
        status="ready"
        onOpenSeason={onOpenSeason}
      />,
    );
    expect(
      screen.getByText("Nobody is in GBV 2026 yet. Add people to the season first, from the season page."),
    ).toBeTruthy();
    expect(screen.queryByText("No students found.")).toBeNull();
    fireEvent.press(screen.getByText("Go to the season page"));
    expect(onOpenSeason).toHaveBeenCalled();
  });

  it("ticks and unticks from the sheet", () => {
    const onChange = jest.fn();
    renderWithProviders(
      <MembersField
        roster={roster}
        groupId={10}
        seasonTitle="GBV 2026"
        value={[1]}
        onChange={onChange}
        status="ready"
      />,
    );
    fireEvent.press(screen.getByLabelText("Members"));
    expect(screen.getByLabelText("Abanob Magdy. In this group")).toBeChecked();
    fireEvent.press(screen.getByLabelText("Amir Samir. In Group 2 · picking moves them here"));
    expect(onChange).toHaveBeenLastCalledWith([1, 3]);
    fireEvent.press(screen.getByLabelText("Abanob Magdy. In this group"));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});
