// apps/mobile/src/__tests__/notification-preferences.test.tsx
import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), put: jest.fn() },
}));

jest.mock("../lib/push", () => ({ enablePush: jest.fn() }));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import { NotificationPreferences } from "../screens/settings/notification-preferences";

const get = apiClient.get as jest.Mock;
const put = apiClient.put as jest.Mock;

const allTrue = {
  assignmentCreated: true,
  submissionReviewed: true,
  sessionRescheduled: true,
  lowAttendanceFlag: true,
  mentorFollowup: true,
  quizGraded: true,
  quizPublished: true,
  submissionReceived: true,
  sessionCancelled: true,
  announcement: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  get.mockResolvedValue({ data: { data: { preferences: allTrue } } });
  put.mockResolvedValue({ data: { data: { preferences: allTrue } } });
  // A student in a season: the student's switches.
  useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }));
  // The switches only render once push is on for this phone.
  useSessionStore.setState({ pushToken: "ExponentPushToken[x]" });
});

afterEach(() => {
  useSessionStore.setState({ pushToken: null });
});

describe("NotificationPreferences", () => {
  it("hides the per-kind switches until push is enabled on this phone", async () => {
    useSessionStore.setState({ pushToken: null });
    renderWithProviders(<NotificationPreferences />);
    expect(await screen.findByRole("button", { name: "Enable push" })).toBeTruthy();
    expect(screen.queryByLabelText("New assignments")).toBeNull();
    expect(screen.queryByText(/Changes save automatically/)).toBeNull();
  });

  it("push button labels are short enough to never ellipsize at 1.3x", async () => {
    useSessionStore.setState({ pushToken: null });
    renderWithProviders(<NotificationPreferences />);
    expect(await screen.findByRole("button", { name: "Enable push" })).toBeTruthy();
    useSessionStore.setState({ pushToken: "ExponentPushToken[x]" });
    renderWithProviders(<NotificationPreferences />);
    expect(await screen.findByRole("button", { name: "Push enabled" })).toBeTruthy();
    useSessionStore.setState({ pushToken: null });
  });

  // Owner 2026-11-07: only the switches for what this person can get; no mentor follow-ups.
  it("shows a student their seven switches and none of the staff ones", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }));
    renderWithProviders(<NotificationPreferences />);
    expect(await screen.findByLabelText("New assignments")).toBeTruthy();
    for (const label of [
      "Submission reviewed",
      "New quizzes",
      "Quiz graded",
      "Session rescheduled",
      "Session cancelled",
      "New announcements",
    ]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    expect(screen.getAllByRole("switch")).toHaveLength(7);
    expect(screen.queryByLabelText("Submissions received")).toBeNull();
    expect(screen.queryByLabelText("Low-attendance flags")).toBeNull();
    expect(screen.queryByLabelText("Mentor follow-ups")).toBeNull();
  });

  it("shows a leader handed-in work and low attendance, an admin low attendance only", async () => {
    useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [3] }));
    const { unmount } = renderWithProviders(<NotificationPreferences />);
    expect(await screen.findByLabelText("Submissions received")).toBeTruthy();
    expect(screen.getByLabelText("Low-attendance flags")).toBeTruthy();
    expect(screen.getByLabelText("New announcements")).toBeTruthy();
    expect(screen.getAllByRole("switch")).toHaveLength(3);
    unmount();

    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
    renderWithProviders(<NotificationPreferences />);
    expect(await screen.findByLabelText("Low-attendance flags")).toBeTruthy();
    expect(screen.getByLabelText("New announcements")).toBeTruthy();
    expect(screen.getAllByRole("switch")).toHaveLength(2);
    expect(screen.queryByLabelText("Mentor follow-ups")).toBeNull();
  });

  it("gives a super one switch: New announcements", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    renderWithProviders(<NotificationPreferences />);
    expect(await screen.findByLabelText("New announcements")).toBeTruthy();
    expect(screen.getAllByRole("switch")).toHaveLength(1);
    expect(screen.queryByText(/can be turned off/)).toBeNull();
  });

  it("gives a mentor follow-up reminders and announcements (owner, 2026-11-07)", async () => {
    useSessionStore.setState(makeSession("MENTOR"));
    renderWithProviders(<NotificationPreferences />);
    expect(await screen.findByLabelText("Follow-up reminders")).toBeTruthy();
    expect(screen.getByLabelText("New announcements")).toBeTruthy();
    expect(screen.getAllByRole("switch")).toHaveLength(2);
  });

  it("explains each new type in its help text", async () => {
    renderWithProviders(<NotificationPreferences />);
    expect(await screen.findByText("When an online quiz opens in your season.")).toBeTruthy();
    expect(screen.getByText("When an upcoming session in your season is cancelled.")).toBeTruthy();
  });

  it("PUTs every key when a new one is toggled off", async () => {
    renderWithProviders(<NotificationPreferences />);

    fireEvent.press(await screen.findByLabelText("Session cancelled"));

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith("/api/v1/me/notification-preferences", {
        ...allTrue,
        sessionCancelled: false,
      }),
    );
  });

  it("states the real low-attendance threshold — two, not three (spec D12)", async () => {
    // v1's help text said "misses 3 in a row"; the rule is two
    // (attendance-notifications.ts `take: 2`, 04-attendance.md R79).
    useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [3] }));
    renderWithProviders(<NotificationPreferences />);
    expect(await screen.findByText("When a student in a group you lead submits their work.")).toBeTruthy();
    expect(await screen.findByText(/two in a row/i)).toBeTruthy();
  });

  it("PUTs every key when one is toggled off", async () => {
    renderWithProviders(<NotificationPreferences />);

    fireEvent.press(await screen.findByLabelText("Quiz graded"));

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith("/api/v1/me/notification-preferences", {
        ...allTrue,
        quizGraded: false,
      }),
    );
  });

  it("flips the switch instantly, before the server answers (REG-80)", async () => {
    let resolvePut: (v: unknown) => void = () => {};
    put.mockReturnValue(
      new Promise((r) => {
        resolvePut = r;
      }),
    );
    renderWithProviders(<NotificationPreferences />);

    fireEvent.press(await screen.findByLabelText("Quiz graded"));
    await waitFor(() => expect(screen.getByLabelText("Quiz graded").props.accessibilityState.checked).toBe(false));
    expect(put).toHaveBeenCalled();
    resolvePut({ data: { data: { preferences: { ...allTrue, quizGraded: false } } } });
    await waitFor(() => expect(screen.getByLabelText("Quiz graded").props.accessibilityState.checked).toBe(false));
  });

  it("rolls the switch back when the save fails (REG-80)", async () => {
    put.mockRejectedValue(new Error("500"));
    renderWithProviders(<NotificationPreferences />);

    fireEvent.press(await screen.findByLabelText("Quiz graded"));
    await waitFor(() => expect(put).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByLabelText("Quiz graded").props.accessibilityState.checked).toBe(true));
  });

  it("explains what turning one off actually does", async () => {
    // Spec D4: the in-app row is always written now; the switch governs
    // outbound channels. Saying so is the difference between a setting and a
    // surprise.
    renderWithProviders(<NotificationPreferences />);
    expect(await screen.findByText(/still appear in your inbox/i)).toBeTruthy();
    expect(screen.getByText(/Changes save automatically/)).toBeTruthy();
  });
});
