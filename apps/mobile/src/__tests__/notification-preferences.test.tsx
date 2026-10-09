// apps/mobile/src/__tests__/notification-preferences.test.tsx
import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), put: jest.fn() },
}));

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
  it("renders v1's five switches — quizGraded has none", async () => {
    renderWithProviders(<NotificationPreferences />);

    expect(await screen.findByLabelText("Assignment created")).toBeTruthy();
    expect(screen.getByLabelText("Submission reviewed")).toBeTruthy();
    expect(screen.getByLabelText("Session rescheduled")).toBeTruthy();
    expect(screen.getByLabelText("Low attendance flag")).toBeTruthy();
    expect(screen.getByLabelText("Mentor follow-up")).toBeTruthy();
    // v1 parity (settings-page.tsx:7-13, settings-form.tsx:27-53; R56/R57,
    // 18-settings R15): v1's form rendered five toggles; quizGraded is not settable.
    expect(screen.queryByLabelText("Quiz graded")).toBeNull();
  });

  it("states the real low-attendance threshold — two, not three (spec D12)", async () => {
    // v1's help text said "misses 3 in a row"; the rule is two
    // (attendance-notifications.ts `take: 2`, 04-attendance.md R79).
    renderWithProviders(<NotificationPreferences />);
    expect(await screen.findByText(/two consecutive/i)).toBeTruthy();
  });

  it("PUTs v1's five keys when one is toggled off — never quizGraded", async () => {
    renderWithProviders(<NotificationPreferences />);

    fireEvent(await screen.findByLabelText("Mentor follow-up"), "valueChange", false);

    const { quizGraded: _notSettable, ...fiveTrue } = allTrue;
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith("/api/v1/me/notification-preferences", {
        ...fiveTrue,
        mentorFollowup: false,
      }),
    );
  });

  it("flips the switch instantly, before the server answers (REG-80)", async () => {
    let resolvePut: (v: unknown) => void = () => {};
    put.mockReturnValue(new Promise((r) => { resolvePut = r; }));
    renderWithProviders(<NotificationPreferences />);

    fireEvent(await screen.findByLabelText("Mentor follow-up"), "valueChange", false);
    await waitFor(() => expect(screen.getByLabelText("Mentor follow-up").props.value).toBe(false));
    expect(put).toHaveBeenCalled();
    resolvePut({ data: { data: { preferences: { ...allTrue, mentorFollowup: false } } } });
    await waitFor(() => expect(screen.getByLabelText("Mentor follow-up").props.value).toBe(false));
  });

  it("rolls the switch back when the save fails (REG-80)", async () => {
    put.mockRejectedValue(new Error("500"));
    renderWithProviders(<NotificationPreferences />);

    fireEvent(await screen.findByLabelText("Mentor follow-up"), "valueChange", false);
    await waitFor(() => expect(put).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByLabelText("Mentor follow-up").props.value).toBe(true));
  });

  it("explains what turning one off actually does", async () => {
    // v1 semantics (notifications.ts:56-94, R8/R9): off means no inbox row and
    // no email. Saying so is the difference between a setting and a surprise.
    renderWithProviders(<NotificationPreferences />);
    expect(await screen.findByText(/not in your inbox/i)).toBeTruthy();
  });
});
