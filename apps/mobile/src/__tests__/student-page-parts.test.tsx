import { fireEvent, render, screen } from "@testing-library/react-native";
import { Linking, Text } from "react-native";

import { StudentDetails } from "../screens/student-detail/student-details";
import { StudentSections } from "../screens/student-detail/student-sections";

const base = {
  university: "Cairo Uni",
  faculty: null,
  universityGraduationYear: null,
  activeSeasonId: 7,
  activeSeasonTitle: "3G-2026",
  activeSeasonCode: "3G-2026",
};

describe("StudentDetails", () => {
  it("shows only the filled-in rows, never a dash, and no season", () => {
    render(<StudentDetails profile={base as never} />);
    expect(screen.getByText("Cairo Uni")).toBeTruthy();
    expect(screen.queryByText("Faculty")).toBeNull();
    expect(screen.queryByText("—")).toBeNull();
    expect(screen.queryByText("3G-2026")).toBeNull();
  });

  // Owner 2026-11-07: an empty Details card is left out.
  it("shows nothing when nothing is filled in", () => {
    render(<StudentDetails profile={{ ...base, university: null } as never} />);
    expect(screen.queryByTestId("student-details")).toBeNull();
    expect(screen.queryByText("Details")).toBeNull();
  });

  it("calls the phone from its row", () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    render(<StudentDetails profile={{ ...base, phone: "0111 222 3333", dateOfBirth: null } as never} />);
    expect(screen.getByText("0111 222 3333")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Call 0111 222 3333" }));
    expect(openURL).toHaveBeenCalledWith("tel:01112223333");
    openURL.mockRestore();
  });
});

describe("StudentSections", () => {
  const sections = (render2: jest.Mock) => [
    { value: "a", label: "Seasons", render: () => <Text>seasons body</Text> },
    { value: "b", label: "Notes", render: () => (render2(), (<Text>notes body</Text>)) },
  ];

  it("mounts a section the first time it is chosen, then keeps it", () => {
    const notes = jest.fn();
    render(<StudentSections sections={sections(notes)} />);
    expect(screen.getByText("seasons body")).toBeTruthy();
    expect(notes).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole("tab", { name: "Notes" }));
    expect(screen.getByText("notes body")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Notes" }).props.accessibilityState).toMatchObject({ selected: true });
    fireEvent.press(screen.getByRole("tab", { name: "Seasons" }));
    expect(screen.getByText("notes body", { includeHiddenElements: true })).toBeTruthy();
  });

  it("with one section shows it under its name, with no chips", () => {
    render(<StudentSections sections={sections(jest.fn()).slice(0, 1)} />);
    expect(screen.getByText("SEASONS")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
