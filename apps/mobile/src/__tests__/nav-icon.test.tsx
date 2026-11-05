import { screen } from "@testing-library/react-native";
import { History, UserCog, UsersRound } from "lucide-react-native";

import { NAV_ICONS } from "../design/icons/nav-icon";
import { MoreMenu } from "../design/layout/more-menu";
import { renderWithProviders } from "./helpers/render";

it("groups read as people and admin user management as a person with a cog", () => {
  expect(NAV_ICONS.groups).toBe(UsersRound);
  expect(NAV_ICONS.users).toBe(UserCog);
});

it("the More page draws its rows from the same icon map as the tab bar", () => {
  const nav = {
    tabs: [{ href: "/dashboard", label: "Home", icon: "home" as const }],
    sidebar: [
      { href: "/history", label: "History", icon: "history" as const },
      { href: "/groups", label: "Groups", icon: "groups" as const },
    ],
  };
  renderWithProviders(<MoreMenu role="ADMIN" userName="A B" nav={nav} onNavigate={jest.fn()} onSignOut={jest.fn()} />);
  expect(screen.UNSAFE_queryAllByType(History)).toHaveLength(1);
  expect(screen.UNSAFE_queryAllByType(UsersRound)).toHaveLength(1);
});
