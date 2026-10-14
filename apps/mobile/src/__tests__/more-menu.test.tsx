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
  renderWithProviders(<MoreMenu role="STUDENT" userName="Sara Adel" nav={nav} onNavigate={onNavigate} onSignOut={onSignOut} />);
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
  renderWithProviders(<MoreMenu role="ADMIN" userName={null} nav={nav} onNavigate={jest.fn()} onSignOut={jest.fn()} />);
  expect(screen.getByText("A")).toBeTruthy();
});
