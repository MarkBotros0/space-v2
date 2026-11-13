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

import MoreScreen from "../../app/(app)/(tabs)/more";

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("MoreScreen", () => {
  it("shows the student's sidebar-only destinations and not their tabs", () => {
    useSessionStore.setState(makeSession("STUDENT", {}, { name: "Mina Adel" }));

    renderWithProviders(<MoreScreen />);

    for (const label of ["Announcements", "Current Season", "Attendance", "History"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    // Owner 2026-11-07: Profile opens from the name row, not a row of its own.
    expect(screen.queryByText("Profile")).toBeNull();
    expect(screen.queryByText("Profile settings")).toBeNull();
    // Already tabs: never duplicated in More.
    expect(screen.queryByText("Work")).toBeNull();
    expect(screen.queryByText("Assignments")).toBeNull();
    expect(screen.queryByText("Quizzes")).toBeNull();
  });

  it("shows the leader's More rows (v1 Quizzes, plus v2's My notes and Notifications, B3-7)", () => {
    useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [3] }, { name: "Lina Leader" }));

    renderWithProviders(<MoreScreen />);

    for (const label of ["My notes", "Quizzes", "Notifications"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.queryByText("Submissions")).toBeNull();
    expect(screen.queryByText("Calendar")).toBeNull();
    expect(screen.queryByText("LEADER")).toBeNull();
  });

  it("shows the account card: initials and name, no role badge, opening Profile", () => {
    useSessionStore.setState(makeSession("STUDENT", {}, { name: "Mina Adel" }));

    renderWithProviders(<MoreScreen />);
    expect(screen.getByText("Account, settings, and more places to go.")).toBeTruthy();
    expect(screen.getByText("Appearance")).toBeTruthy();

    expect(screen.getByText("MA")).toBeTruthy();
    expect(screen.getByText("Mina Adel")).toBeTruthy();
    expect(screen.queryByText("STUDENT")).toBeNull();
    fireEvent.press(screen.getByText("Mina Adel"));
    expect(mockPush).toHaveBeenCalledWith("/profile");
  });

  it("shows a different set for an admin, and an alumnus gets only Notifications", () => {
    useSessionStore.setState(makeSession("ADMIN"));
    const { unmount } = renderWithProviders(<MoreScreen />);
    expect(screen.getByText("Reports")).toBeTruthy();
    expect(screen.getByText("My Season")).toBeTruthy();
    unmount();

    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: null, graduationYear: 2024 }));
    renderWithProviders(<MoreScreen />);
    expect(screen.getByText("Notifications")).toBeTruthy();
    expect(screen.queryByText("Notification settings")).toBeNull();
    expect(screen.queryByText("History")).toBeNull();
  });

  it("gives the mentor the same More as everyone: profile row, Announcements, Notifications, theme, sign out, delete (owner, 2026-11-07)", async () => {
    useSessionStore.setState(makeSession("MENTOR", {}, { name: "Maged Mentor" }));

    renderWithProviders(<MoreScreen />);

    expect(screen.getByText("Maged Mentor")).toBeTruthy();
    fireEvent.press(screen.getByText("Maged Mentor"));
    expect(mockPush).toHaveBeenCalledWith("/profile");
    fireEvent.press(screen.getByRole("button", { name: "Notifications" }));
    expect(mockPush).toHaveBeenCalledWith("/notifications");
    fireEvent.press(screen.getByText("Announcements"));
    expect(mockPush).toHaveBeenCalledWith("/announcements");
    expect(screen.getByText("Appearance")).toBeTruthy();
    expect(screen.getByText("Delete account")).toBeTruthy();
    // Their own tabs are not repeated.
    for (const label of ["Community", "Notes", "Follow-ups"]) expect(screen.queryByText(label)).toBeNull();
    fireEvent.press(screen.getByText("Sign out"));
    expect(await screen.findByText("Sign out?")).toBeTruthy();
  });

  it("navigates to the item's route on press", () => {
    useSessionStore.setState(makeSession("STUDENT"));

    renderWithProviders(<MoreScreen />);
    fireEvent.press(screen.getByText("History"));

    expect(mockPush).toHaveBeenCalledWith("/history");
  });

  it("asks before signing out, then signs out through useLogout (owner 2026-11-13)", async () => {
    useSessionStore.setState(makeSession("STUDENT"));

    renderWithProviders(<MoreScreen />);
    fireEvent.press(screen.getByText("Sign out"));

    expect(await screen.findByText("Sign out?")).toBeTruthy();
    expect(mockLogout).not.toHaveBeenCalled();
    const buttons = screen.getAllByRole("button", { name: "Sign out" });
    fireEvent.press(buttons[buttons.length - 1]!);
    await waitFor(() => expect(mockLogout).toHaveBeenCalledTimes(1));
  });

  it("Cancel on the sign-out question keeps you signed in", async () => {
    useSessionStore.setState(makeSession("STUDENT"));

    renderWithProviders(<MoreScreen />);
    fireEvent.press(screen.getByText("Sign out"));
    fireEvent.press(await screen.findByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByText("Sign out?")).toBeNull());
    expect(mockLogout).not.toHaveBeenCalled();
  });
});
