import type { ComponentType } from "react";
import { screen } from "@testing-library/react-native";

// Task-7 fix round, Fix 5: nothing before this file ever rendered any of
// the 19 placeholder screens. A bare `render()` of one throws
// "No safe area value available..." because `Screen` calls
// `useSafeAreaInsets()`, which needs a `SafeAreaProvider` that has actually
// fired `onLayout` — a bare provider never does that under the test
// renderer (see the note in `helpers/render.tsx`). This is also the worked
// example of `renderWithProviders`, so the first Phase 1 author to build a
// real screen has something to copy instead of hitting that error cold.
//
// `dashboard` used to be in this list — it's now the one real `useQuery`
// screen (see `dashboard.test.tsx`) and dropped out of the placeholder
// count below, from 19 to 18.
import { renderWithProviders } from "./helpers/render";

import AssignmentsScreen from "../../app/(app)/assignments";
import CalendarScreen from "../../app/(app)/calendar";
import EventsScreen from "../../app/(app)/events";
import GroupsScreen from "../../app/(app)/groups";
import HistoryScreen from "../../app/(app)/history";
import MoreScreen from "../../app/(app)/more";
import NotesScreen from "../../app/(app)/notes";
import ProfileScreen from "../../app/(app)/profile";
import QuizzesScreen from "../../app/(app)/quizzes";
import ReportsScreen from "../../app/(app)/reports";
import SeasonScreen from "../../app/(app)/season";
import SeasonsScreen from "../../app/(app)/seasons";
import SettingsScreen from "../../app/(app)/settings";
import AlumniScreen from "../../app/(app)/students/alumni";
import DroppedStudentsScreen from "../../app/(app)/students/dropped";
import StudentsScreen from "../../app/(app)/students/index";
import SubmissionsScreen from "../../app/(app)/submissions";
import UsersScreen from "../../app/(app)/users";

const PLACEHOLDER_SCREENS: Array<[string, ComponentType, string]> = [
  ["assignments", AssignmentsScreen, "Assignments"],
  ["calendar", CalendarScreen, "Calendar"],
  ["events", EventsScreen, "JPC Events"],
  ["groups", GroupsScreen, "Groups"],
  ["history", HistoryScreen, "History"],
  ["more", MoreScreen, "More"],
  ["notes", NotesScreen, "Notes"],
  ["profile", ProfileScreen, "Profile"],
  ["quizzes", QuizzesScreen, "Quizzes"],
  ["reports", ReportsScreen, "Reports"],
  ["season", SeasonScreen, "My Season"],
  ["seasons", SeasonsScreen, "Seasons"],
  ["settings", SettingsScreen, "Settings"],
  ["students/alumni", AlumniScreen, "Alumni"],
  ["students/dropped", DroppedStudentsScreen, "Dropped Students"],
  ["students/index", StudentsScreen, "Students"],
  ["submissions", SubmissionsScreen, "Submissions"],
  ["users", UsersScreen, "Users"],
];

describe("placeholder screens", () => {
  it("covers all remaining placeholder route files under app/(app)", () => {
    expect(PLACEHOLDER_SCREENS).toHaveLength(18);
  });

  it.each(PLACEHOLDER_SCREENS)("renders %s with its title and placeholder message", (_route, Component, title) => {
    renderWithProviders(<Component />);

    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.getByText("This screen isn't built yet.")).toBeTruthy();
  });
});
