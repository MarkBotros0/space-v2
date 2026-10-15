import { fireEvent, screen, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));
const mockLogout = jest.fn(() => Promise.resolve());
jest.mock("../hooks/use-session", () => ({
  useLogout: () => mockLogout,
}));

// Ionicons loads its font asynchronously and setStates after the test body has
// finished, which logs act() warnings. The glyph is not under test here.

import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import MoreScreen from "../../app/(app)/more";

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("MoreScreen", () => {
  it("shows the student's sidebar-only destinations and not their tabs", () => {
    useSessionStore.setState(makeSession("STUDENT", {}, { name: "Mina Adel" }));

    renderWithProviders(<MoreScreen />);

    for (const label of ["Current Season", "Attendance", "History", "Profile", "Settings"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    // Already tabs: never duplicated in More.
    expect(screen.queryByText("Assignments")).toBeNull();
    expect(screen.queryByText("Quizzes")).toBeNull();
  });

  it("shows the leader's More rows (v1 Quizzes + Settings, plus v2's My notes and Notifications, B3-7)", () => {
    useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [3] }, { name: "Lina Leader" }));

    renderWithProviders(<MoreScreen />);

    for (const label of ["My notes", "Quizzes", "Notifications", "Settings"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.queryByText("Submissions")).toBeNull();
    expect(screen.queryByText("Calendar")).toBeNull();
    expect(screen.getByText("LEADER")).toBeTruthy();
  });

  it("shows the account card: initials, name and role", () => {
    useSessionStore.setState(makeSession("STUDENT", {}, { name: "Mina Adel" }));

    renderWithProviders(<MoreScreen />);
    expect(screen.getByText("Account, settings, and more places to go.")).toBeTruthy();
    expect(screen.getByText("Appearance")).toBeTruthy();

    expect(screen.getByText("MA")).toBeTruthy();
    expect(screen.getByText("Mina Adel")).toBeTruthy();
    expect(screen.getByText("STUDENT")).toBeTruthy();
  });

  it("shows a different set for an admin, and an alumnus gets only Settings", () => {
    useSessionStore.setState(makeSession("ADMIN"));
    const { unmount } = renderWithProviders(<MoreScreen />);
    expect(screen.getByText("Reports")).toBeTruthy();
    expect(screen.getByText("My Season")).toBeTruthy();
    unmount();

    useSessionStore.setState(makeSession("STUDENT", { graduationYear: 2024 }));
    renderWithProviders(<MoreScreen />);
    expect(screen.getByText("Settings")).toBeTruthy();
    expect(screen.queryByText("History")).toBeNull();
  });

  it("navigates to the item's route on press", () => {
    useSessionStore.setState(makeSession("STUDENT"));

    renderWithProviders(<MoreScreen />);
    fireEvent.press(screen.getByText("History"));

    expect(mockPush).toHaveBeenCalledWith("/history");
  });

  it("signs out through useLogout", async () => {
    useSessionStore.setState(makeSession("STUDENT"));

    renderWithProviders(<MoreScreen />);
    fireEvent.press(screen.getByText("Sign out"));

    await waitFor(() => expect(mockLogout).toHaveBeenCalledTimes(1));
  });
});
