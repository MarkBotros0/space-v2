import { fireEvent, screen } from "@testing-library/react-native";

import { MoreMenu } from "../design/layout/more-menu";
import { renderWithProviders } from "./helpers/render";

const nav = {
  tabs: [{ href: "/dashboard", label: "Home", icon: "home" as const }],
  sidebar: [
    { href: "/dashboard", label: "Home", icon: "home" as const },
    { href: "/history", label: "History", icon: "history" as const },
    { href: "/settings", label: "Settings", icon: "settings" as const },
  ],
};

it("lists sidebar items that are not tabs, with v1's header, appearance and sign-out", () => {
  const onNavigate = jest.fn();
  const onSignOut = jest.fn();
  renderWithProviders(
    <MoreMenu
      role="STUDENT"
      userName="Sara Adel"
      nav={nav}
      onNavigate={onNavigate}
      onSignOut={onSignOut}
      onOpenProfile={jest.fn()}
    />,
  );
  expect(screen.getByText("More")).toBeTruthy();
  expect(screen.getByText("Account, settings, and more places to go.")).toBeTruthy();
  expect(screen.getByText("SA")).toBeTruthy();
  expect(screen.queryByText("Home")).toBeNull();
  fireEvent.press(screen.getByText("History"));
  expect(onNavigate).toHaveBeenCalledWith("/history");
  expect(screen.getByText("Appearance")).toBeTruthy();
  fireEvent.press(screen.getByText("Sign out"));
  expect(onSignOut).toHaveBeenCalled();
});

it("falls back to the role's first letter without a name (v1 initials rule)", () => {
  renderWithProviders(
    <MoreMenu
      role="ADMIN"
      userName={null}
      nav={nav}
      onNavigate={jest.fn()}
      onSignOut={jest.fn()}
      onOpenProfile={jest.fn()}
    />,
  );
  expect(screen.getByText("A")).toBeTruthy();
});

it("every row of moreItemsFor navigates to its own href", () => {
  const onNavigate = jest.fn();
  renderWithProviders(
    <MoreMenu
      role="STUDENT"
      userName="Sara Adel"
      nav={nav}
      onNavigate={onNavigate}
      onSignOut={jest.fn()}
      onOpenProfile={jest.fn()}
    />,
  );
  for (const item of nav.sidebar.filter((i) => i.href !== "/dashboard")) {
    fireEvent.press(screen.getByLabelText(item.label));
    expect(onNavigate).toHaveBeenLastCalledWith(item.href);
  }
  expect(onNavigate).toHaveBeenCalledTimes(2);
});

it("fires sign-out once per press and leaves navigation alone", () => {
  const onNavigate = jest.fn();
  const onSignOut = jest.fn();
  renderWithProviders(
    <MoreMenu
      role="STUDENT"
      userName="Sara Adel"
      nav={nav}
      onNavigate={onNavigate}
      onSignOut={onSignOut}
      onOpenProfile={jest.fn()}
    />,
  );
  fireEvent.press(screen.getByLabelText("Sign out"));
  expect(onSignOut).toHaveBeenCalledTimes(1);
  expect(onNavigate).not.toHaveBeenCalled();
});

it("keeps the theme toggle reachable on the Appearance row", () => {
  renderWithProviders(
    <MoreMenu
      role="STUDENT"
      userName="Sara Adel"
      nav={nav}
      onNavigate={jest.fn()}
      onSignOut={jest.fn()}
      onOpenProfile={jest.fn()}
    />,
  );
  const toggle = screen.getByLabelText(/Switch to (dark|light) mode/);
  const before = toggle.props.accessibilityLabel;
  fireEvent.press(toggle);
  expect(screen.getByLabelText(/Switch to (dark|light) mode/).props.accessibilityLabel).not.toBe(before);
});

// Owner 2026-11-07: no role badge; the name row opens Profile.
it("opens Profile from the name row, with no role badge", () => {
  const onOpenProfile = jest.fn();
  renderWithProviders(
    <MoreMenu
      role="STUDENT"
      userName="Sara Adel"
      nav={nav}
      onNavigate={jest.fn()}
      onSignOut={jest.fn()}
      onOpenProfile={onOpenProfile}
    />,
  );
  expect(screen.queryByText("STUDENT")).toBeNull();
  fireEvent.press(screen.getByText("Sara Adel"));
  expect(onOpenProfile).toHaveBeenCalledTimes(1);
});
