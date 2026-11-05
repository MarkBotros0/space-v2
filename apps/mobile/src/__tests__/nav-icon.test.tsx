import { screen } from "@testing-library/react-native";
import {
  Backpack,
  BookOpen,
  ChartColumn,
  GraduationCap,
  History,
  Inbox,
  ListChecks,
  Ticket,
  UserCog,
  UsersRound,
} from "lucide-react-native";

import { NAV_ICONS } from "../design/icons/nav-icon";
import { MoreMenu } from "../design/layout/more-menu";
import { renderWithProviders } from "./helpers/render";

it("groups read as people and admin user management as a person with a cog", () => {
  expect(NAV_ICONS.groups).toBe(UsersRound);
  expect(NAV_ICONS.users).toBe(UserCog);
});

it("each destination says what it opens (owner revision 2026-11-05)", () => {
  expect(NAV_ICONS.reports).toBe(ChartColumn);
  expect(NAV_ICONS.submissions).toBe(Inbox);
  expect(NAV_ICONS.season).toBe(BookOpen);
  expect(NAV_ICONS.quizzes).toBe(ListChecks);
  expect(NAV_ICONS.events).toBe(Ticket);
  expect(NAV_ICONS.students).toBe(Backpack);
  expect(NAV_ICONS.alumni).toBe(GraduationCap);
});

it("no two destinations share an icon", () => {
  const icons = Object.values(NAV_ICONS);
  expect(new Set(icons).size).toBe(icons.length);
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
