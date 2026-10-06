import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn(), post: jest.fn() } }));
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "12" }),
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import AttendanceScreen from "../../app/(app)/session/[id]/attendance";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

const roster = [
  { studentUserId: 9, name: "Test student", email: "s@jpc.test", groupName: "Group A",
    status: null, notes: null, lateMinutes: null },
  { studentUserId: 10, name: "Second student", email: "s2@jpc.test", groupName: "Group A",
    status: "PRESENT", notes: "Checked in at the gate", lateMinutes: null },
];

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [3] }, { id: 5 }));
  get.mockResolvedValue({ data: { data: { roster } } });
});

it("renders the roster and saves only rows the caller touched, notes carried through", async () => {
  post.mockResolvedValue({ data: { data: { saved: 2 } } });

  renderWithProviders(<AttendanceScreen />);

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

  renderWithProviders(<AttendanceScreen />);
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

  renderWithProviders(<AttendanceScreen />);
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

  renderWithProviders(<AttendanceScreen />);
  fireEvent.press(await screen.findByText("All present"));
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
  renderWithProviders(<AttendanceScreen />);
  fireEvent.press(await screen.findByText("Save attendance"));

  expect(await screen.findByText("Mark at least one student before saving.")).toBeTruthy();
  expect(post).not.toHaveBeenCalled();
});
