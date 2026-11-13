import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";

jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: "success" },
  ImpactFeedbackStyle: { Light: "light" },
}));
jest.mock("../design/ui/toaster", () => ({ toast: { success: jest.fn(), error: jest.fn() }, Toaster: () => null }));
jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn(), post: jest.fn() } }));
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "12" }),
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
}));

import * as Haptics from "expo-haptics";
import { toast } from "../design/ui/toaster";
import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderStacked } from "./helpers/render";
import { makeSession } from "./helpers/session";
import AttendanceScreen from "../../app/(app)/session/[id]/attendance";
import { expectQuietSuccess } from "./helpers/quiet-success";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

const sessionDetail = {
  id: 12,
  title: "Week three",
  description: null,
  startsAt: "2099-03-01T18:00:00.000Z",
  dayKey: "2099-03-01",
  startTime: "20:00",
  durationMinutes: 90,
  location: null,
  youtubeUrl: null,
  recurrenceGroupId: null,
  seasonId: 7,
  seasonCode: "S26",
  seasonTitle: "Spring 2026",
  checkInOpen: false,
  myAttendance: null,
  canMarkAttendance: true,
  canManageCheckIn: false,
};

const roster = [
  {
    studentUserId: 9,
    name: "Test student",
    email: "s@jpc.test",
    groupName: "Group A",
    status: null,
    notes: null,
    lateMinutes: null,
  },
  {
    studentUserId: 10,
    name: "Second student",
    email: "s2@jpc.test",
    groupName: "Group A",
    status: "PRESENT",
    notes: "Checked in at the gate",
    lateMinutes: null,
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [3] }, { id: 5 }));
  get.mockImplementation((url: string) =>
    url === "/api/v1/sessions/12"
      ? Promise.resolve({ data: { data: sessionDetail } })
      : Promise.resolve({ data: { data: { roster } } }),
  );
});

it("heads the page with the session and pins a save bar with no Cancel", async () => {
  renderStacked(<AttendanceScreen />);
  expect(await screen.findByText("Week three · Sun, Mar 1 · 8:00 PM")).toBeTruthy();
  const bar = screen.getByTestId("save-bar");
  expect(within(bar).getByText("Save attendance")).toBeTruthy();
  expect(screen.queryByText("Cancel")).toBeNull();
  expect(screen.queryByText(/changed/)).toBeNull();
});

it("counts the changed rows in the save bar hint", async () => {
  renderStacked(<AttendanceScreen />);
  fireEvent.press(await screen.findByLabelText("Mark Test student PRESENT"));
  expect(within(screen.getByTestId("save-bar")).getByText("1 changed")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Mark Second student ABSENT"));
  expect(within(screen.getByTestId("save-bar")).getByText("2 changed")).toBeTruthy();
});

it("follows each mark in the toggle's selected state and fires a selection haptic", async () => {
  renderStacked(<AttendanceScreen />);
  const present = await screen.findByLabelText("Mark Test student PRESENT");
  expect(present.props.accessibilityState.selected).toBe(false);
  fireEvent.press(present);
  expect(screen.getByLabelText("Mark Test student PRESENT").props.accessibilityState.selected).toBe(true);
  expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByLabelText("Mark Test student ABSENT"));
  expect(screen.getByLabelText("Mark Test student PRESENT").props.accessibilityState.selected).toBe(false);
  expect(screen.getByLabelText("Mark Test student ABSENT").props.accessibilityState.selected).toBe(true);
});

it("shows the save in flight on the bar", async () => {
  post.mockReturnValue(new Promise(() => {}));
  renderStacked(<AttendanceScreen />);
  fireEvent.press(await screen.findByLabelText("Mark Test student PRESENT"));
  fireEvent.press(screen.getByText("Save attendance"));
  expect(await screen.findByTestId("button-spinner")).toBeTruthy();
});

it("on success buzzes and goes back, with no toast", async () => {
  post.mockResolvedValue({ data: { data: { saved: 1 } } });
  renderStacked(<AttendanceScreen />);
  fireEvent.press(await screen.findByLabelText("Mark Test student PRESENT"));
  fireEvent.press(screen.getByText("Save attendance"));
  await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
  await expectQuietSuccess();
});

it("on a failed save shows the message, stays, and does not buzz", async () => {
  post.mockRejectedValue(
    Object.assign(new Error("400"), {
      isAxiosError: true,
      response: { status: 400, data: { error: { code: "bad_request", message: "Invalid attendance entries." } } },
    }),
  );
  renderStacked(<AttendanceScreen />);
  fireEvent.press(await screen.findByLabelText("Mark Test student PRESENT"));
  fireEvent.press(screen.getByText("Save attendance"));
  expect(await screen.findByText("Invalid attendance entries.")).toBeTruthy();
  expect(mockBack).not.toHaveBeenCalled();
  expect(Haptics.impactAsync).not.toHaveBeenCalled();
  expect(toast.success).not.toHaveBeenCalled();
});

it("renders the roster and saves only rows the caller touched, notes carried through", async () => {
  post.mockResolvedValue({ data: { data: { saved: 2 } } });

  renderStacked(<AttendanceScreen />);

  expect(await screen.findByText("Test student")).toBeTruthy();
  expect(get).toHaveBeenCalledWith("/api/v1/sessions/12/attendance");
  fireEvent.press(screen.getByLabelText("Mark Test student PRESENT"));
  fireEvent.press(screen.getByLabelText("Mark Second student ABSENT"));
  fireEvent.press(screen.getByText("Save attendance"));

  await waitFor(() =>
    expect(post).toHaveBeenCalledWith("/api/v1/sessions/12/attendance", {
      entries: [
        { studentUserId: 9, status: "PRESENT", notes: null },
        { studentUserId: 10, status: "ABSENT", notes: "Checked in at the gate" },
      ],
    }),
  );
  await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
});

it("keeps a never-touched row out of the payload", async () => {
  post.mockResolvedValue({ data: { data: { saved: 1 } } });

  renderStacked(<AttendanceScreen />);
  fireEvent.press(await screen.findByLabelText("Mark Test student ABSENT"));
  fireEvent.press(screen.getByText("Save attendance"));

  // Second student is untouched: their server status stands, and sending it
  // again would stamp this leader as markedBy for a mark they never made.
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith("/api/v1/sessions/12/attendance", {
      entries: [{ studentUserId: 9, status: "ABSENT", notes: null }],
    }),
  );
});

it("asks for minutes late on a LATE row and sends them", async () => {
  post.mockResolvedValue({ data: { data: { saved: 1 } } });

  renderStacked(<AttendanceScreen />);
  fireEvent.press(await screen.findByLabelText("Mark Test student LATE"));
  fireEvent.changeText(screen.getByLabelText("Minutes late for Test student"), "15");
  fireEvent.press(screen.getByText("Save attendance"));

  await waitFor(() =>
    expect(post).toHaveBeenCalledWith("/api/v1/sessions/12/attendance", {
      entries: [{ studentUserId: 9, status: "LATE", notes: null, lateMinutes: 15 }],
    }),
  );
});

it("marks everyone at once (v1's quick mark all)", async () => {
  post.mockResolvedValue({ data: { data: { saved: 2 } } });

  renderStacked(<AttendanceScreen />);
  fireEvent.press(await screen.findByLabelText("Mark all PRESENT"));
  fireEvent.press(screen.getByText("Save attendance"));

  await waitFor(() =>
    expect(post).toHaveBeenCalledWith("/api/v1/sessions/12/attendance", {
      entries: [
        { studentUserId: 9, status: "PRESENT", notes: null },
        { studentUserId: 10, status: "PRESENT", notes: "Checked in at the gate" },
      ],
    }),
  );
});

it("refuses to save with nothing marked, without a request (v1)", async () => {
  renderStacked(<AttendanceScreen />);
  fireEvent.press(await screen.findByText("Save attendance"));

  expect(
    await within(await screen.findByTestId("save-bar")).findByText("Mark at least one student before saving."),
  ).toBeTruthy();
  expect(post).not.toHaveBeenCalled();
});

it("a mark replaces the stored status in the selected state", async () => {
  renderStacked(<AttendanceScreen />);
  expect((await screen.findByLabelText("Mark Second student PRESENT")).props.accessibilityState.selected).toBe(true);
  fireEvent.press(screen.getByLabelText("Mark Second student LATE"));
  expect(screen.getByLabelText("Mark Second student PRESENT").props.accessibilityState.selected).toBe(false);
  expect(screen.getByLabelText("Mark Second student LATE").props.accessibilityState.selected).toBe(true);
});

it("counts a minutes edit on an already-LATE row as changed", async () => {
  get.mockImplementation((url: string) =>
    url === "/api/v1/sessions/12"
      ? Promise.resolve({ data: { data: sessionDetail } })
      : Promise.resolve({ data: { data: { roster: [{ ...roster[0], status: "LATE", lateMinutes: 5 }] } } }),
  );
  renderStacked(<AttendanceScreen />);
  expect(screen.queryByText(/changed/)).toBeNull();
  fireEvent.changeText(await screen.findByLabelText("Minutes late for Test student"), "12");
  expect(within(screen.getByTestId("save-bar")).getByText("1 changed")).toBeTruthy();
});
