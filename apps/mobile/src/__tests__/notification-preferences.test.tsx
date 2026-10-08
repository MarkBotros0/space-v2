// apps/mobile/src/__tests__/notification-preferences.test.tsx
import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), put: jest.fn() },
}));

jest.mock("../lib/push", () => ({ enablePush: jest.fn() }));

import { apiClient } from "../lib/api-client";
import { renderWithProviders } from "./helpers/render";

import { NotificationPreferences } from "../components/NotificationPreferences";

const get = apiClient.get as jest.Mock;
const put = apiClient.put as jest.Mock;

const allTrue = {
  assignmentCreated: true,
  submissionReviewed: true,
  sessionRescheduled: true,
  lowAttendanceFlag: true,
  mentorFollowup: true,
  quizGraded: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  get.mockResolvedValue({ data: { data: { preferences: allTrue } } });
  put.mockResolvedValue({ data: { data: { preferences: allTrue } } });
});

describe("NotificationPreferences", () => {
  it("renders a switch for all six types — including the one v1 could never set", async () => {
    renderWithProviders(<NotificationPreferences />);

    expect(await screen.findByLabelText("Assignment created")).toBeTruthy();
    expect(screen.getByLabelText("Submission reviewed")).toBeTruthy();
    expect(screen.getByLabelText("Session rescheduled")).toBeTruthy();
    expect(screen.getByLabelText("Low attendance flag")).toBeTruthy();
    expect(screen.getByLabelText("Mentor follow-up")).toBeTruthy();
    // R56/R57: v1's form rendered five toggles and its action spread a
    // five-field object, so this column kept its default forever.
    expect(screen.getByLabelText("Quiz graded")).toBeTruthy();
  });

  it("states the real low-attendance threshold — two, not three (spec D12)", async () => {
    // v1's help text said "misses 3 in a row"; the rule is two
    // (attendance-notifications.ts `take: 2`, 04-attendance.md R79).
    renderWithProviders(<NotificationPreferences />);
    expect(await screen.findByText(/two consecutive/i)).toBeTruthy();
  });

  it("PUTs all six keys when one is toggled off", async () => {
    renderWithProviders(<NotificationPreferences />);

    fireEvent(await screen.findByLabelText("Quiz graded"), "valueChange", false);

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith("/api/v1/me/notification-preferences", {
        ...allTrue,
        quizGraded: false,
      }),
    );
  });

  it("flips the switch instantly, before the server answers (REG-80)", async () => {
    let resolvePut: (v: unknown) => void = () => {};
    put.mockReturnValue(new Promise((r) => { resolvePut = r; }));
    renderWithProviders(<NotificationPreferences />);

    fireEvent(await screen.findByLabelText("Quiz graded"), "valueChange", false);
    await waitFor(() => expect(screen.getByLabelText("Quiz graded").props.value).toBe(false));
    expect(put).toHaveBeenCalled();
    resolvePut({ data: { data: { preferences: { ...allTrue, quizGraded: false } } } });
    await waitFor(() => expect(screen.getByLabelText("Quiz graded").props.value).toBe(false));
  });

  it("rolls the switch back when the save fails (REG-80)", async () => {
    put.mockRejectedValue(new Error("500"));
    renderWithProviders(<NotificationPreferences />);

    fireEvent(await screen.findByLabelText("Quiz graded"), "valueChange", false);
    await waitFor(() => expect(put).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByLabelText("Quiz graded").props.value).toBe(true));
  });

  it("explains what turning one off actually does", async () => {
    // Spec D4: the in-app row is always written now; the switch governs
    // outbound channels. Saying so is the difference between a setting and a
    // surprise.
    renderWithProviders(<NotificationPreferences />);
    expect(await screen.findByText(/still appear in your inbox/i)).toBeTruthy();
  });
});
