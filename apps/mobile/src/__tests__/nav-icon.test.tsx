import { screen } from "@testing-library/react-native";
import {
  Backpack,
  Bell,
  BookOpen,
  Calendar,
  ChartColumn,
  CircleUserRound,
  ClipboardCheck,
  ClipboardList,
  Ellipsis,
  GraduationCap,
  History,
  Home,
  Inbox,
  Megaphone,
  LayoutDashboard,
  ListTodo,
  ListChecks,
  NotebookPen,
  Settings,
  Ticket,
  Flag,
  UserCheck,
  UserCog,
  UserMinus,
  UsersRound,
} from "lucide-react-native";

import { NAV_ICONS } from "../design/icons/nav-icon";
import { MoreMenu } from "../design/layout/more-menu";
import { renderWithProviders } from "./helpers/render";

it("groups read as people and admin user management as a person with a cog", () => {
  expect(NAV_ICONS.groups).toBe(UsersRound);
  expect(NAV_ICONS.users).toBe(UserCog);
});

// R35, entry by entry: the whole map, so no destination's icon can drift unnoticed.
it("each destination says what it opens (owner revision R35, 2026-11-05)", () => {
  expect(NAV_ICONS).toEqual({
    home: Home,
    dashboard: LayoutDashboard,
    users: UserCog,
    calendar: Calendar,
    events: Ticket,
    followUps: Flag,
    announcements: Megaphone,
    assignments: ClipboardList,
    attendance: UserCheck,
    submissions: Inbox,
    history: History,
    profile: CircleUserRound,
    reports: ChartColumn,
    groups: UsersRound,
    season: BookOpen,
    students: Backpack,
    alumni: GraduationCap,
    dropped: UserMinus,
    notes: NotebookPen,
    notifications: Bell,
    quizzes: ListChecks,
    more: Ellipsis,
    settings: Settings,
    todo: ListTodo,
    submitted: ClipboardCheck,
  });
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
  renderWithProviders(
    <MoreMenu role="ADMIN" userName="A B" nav={nav} onNavigate={jest.fn()} onSignOut={jest.fn()} onOpenProfile={jest.fn()} />,
  );
  expect(screen.UNSAFE_queryAllByType(History)).toHaveLength(1);
  expect(screen.UNSAFE_queryAllByType(UsersRound)).toHaveLength(1);
});
