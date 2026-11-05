import { fireEvent, screen } from "@testing-library/react-native";

import { MoreMenu } from "../design/layout/more-menu";
import { roleBadge, UserMenu } from "../design/layout/user-menu";
import { renderWithProviders } from "./helpers/render";

// alumni s47-03: an alumnus's user menu said "STUDENT".
describe("role badge", () => {
  it("names a graduated student Alumni, in its own colour; navFor's rule decides", () => {
    expect(roleBadge("STUDENT", 2025)).toEqual({ color: "alumni", label: "ALUMNI" });
    expect(roleBadge("STUDENT", null)).toEqual({ color: "student", label: "STUDENT" });
    expect(roleBadge("ADMIN", null)).toEqual({ color: "admin", label: "ADMIN" });
  });

  it("the user menu shows ALUMNI for an alumnus", () => {
    renderWithProviders(
      <UserMenu
        role="STUDENT"
        graduationYear={2025}
        userName="Sara Adel"
        initials="SA"
        isDark={false}
        onToggleTheme={jest.fn()}
        onProfile={jest.fn()}
        onSignOut={jest.fn()}
      />,
    );
    fireEvent.press(screen.getByLabelText("User menu"));
    expect(screen.getByText("ALUMNI").props.className).toContain("text-role-alumni-foreground");
    expect(screen.queryByText("STUDENT")).toBeNull();
  });

  it("the More page's identity card does too", () => {
    const nav = { tabs: [], sidebar: [] };
    renderWithProviders(
      <MoreMenu
        role="STUDENT"
        graduationYear={2025}
        userName="Sara Adel"
        nav={nav}
        onNavigate={jest.fn()}
        onSignOut={jest.fn()}
      />,
    );
    expect(screen.getByText("ALUMNI")).toBeTruthy();
  });
});
