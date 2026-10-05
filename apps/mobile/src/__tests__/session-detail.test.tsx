import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn(), post: jest.fn() } }));
jest.mock("react-native-qrcode-svg", () => "QRCode");
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "12" }),
  useRouter: () => ({ push: mockPush }),
}));

import { apiClient } from "../lib/api-client";
import type { SessionDetail } from "@space/shared";

import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import SessionDetailScreen from "../../app/(app)/session/[id]/index";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

const baseDetail: SessionDetail = {
  id: 12, title: "Week 3", description: "Bring your notebook.",
  startsAt: "2099-03-15T18:00:00.000Z", durationMinutes: 90, location: "Hall B",
  youtubeUrl: null, recurrenceGroupId: null, seasonId: 7, seasonCode: "s7", seasonTitle: "Spring",
  checkInOpen: false, myAttendance: null, canMarkAttendance: false, canManageCheckIn: false,
};

const listRow = (checkInToken: string | null) => ({
  id: 12, title: "Week 3", startsAt: "2099-03-15T18:00:00.000Z", dayKey: "2099-03-15",
  durationMinutes: 90, location: "Hall B", recurrenceGroupId: null, attendanceMarked: false,
  seasonId: 7, seasonCode: "s7", seasonTitle: "Spring", checkInToken,
  checkInOpenAt: null, checkInClosedAt: null,
});


/** Routes GETs by URL; `detail` is read at call time so a test can flip it mid-flight. */
function routeGets(state: { detail: typeof baseDetail; token: string | null; roster?: unknown[] }) {
  get.mockImplementation((url: string) => {
    if (url === "/api/v1/sessions/12") return Promise.resolve({ data: { data: state.detail } });
    if (url === "/api/v1/seasons/7/sessions")
      return Promise.resolve({ data: { data: { sessions: [listRow(state.token)] } } });
    if (url === "/api/v1/sessions/12/attendance")
      return Promise.resolve({ data: { data: { roster: state.roster ?? [] } } });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

it("shows a student their header and attendance, and no check-in card (C4: flags drive the UI)", async () => {
  useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }, { id: 9 }));
  routeGets({
    detail: { ...baseDetail, myAttendance: { status: "LATE", notes: null, lateMinutes: 10, checkedInAt: null } },
    token: null,
  });

  renderWithProviders(<SessionDetailScreen />);

  expect(await screen.findByText("Week 3")).toBeTruthy();
  expect(screen.getByText("Hall B")).toBeTruthy();
  expect(screen.getByText("Bring your notebook.")).toBeTruthy();
  expect(screen.getByText("Your attendance: Late (10 min)")).toBeTruthy();
  expect(screen.queryByText("Check-in")).toBeNull();
  expect(screen.queryByText("Open check-in")).toBeNull();
  expect(screen.queryByText("Mark attendance")).toBeNull();
});

it("lets a season admin open check-in and shows the QR from the open response", async () => {
  useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }, { id: 2 }));
  const state = {
    detail: { ...baseDetail, canMarkAttendance: true, canManageCheckIn: true },
    token: null as string | null,
  };
  routeGets(state);
  post.mockImplementation(() => {
    state.detail = { ...state.detail, checkInOpen: true };
    return Promise.resolve({ data: { data: { checkInToken: "tok123" } } });
  });

  renderWithProviders(<SessionDetailScreen />);

  fireEvent.press(await screen.findByText("Open check-in"));
  await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/sessions/12/check-in-open"));
  expect(await screen.findByText("Code: tok123")).toBeTruthy();
  expect(await screen.findByText("Close check-in")).toBeTruthy();
});

it("shows an admin the QR of an already-open session without reopening (token from the staff session list)", async () => {
  useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }, { id: 2 }));
  routeGets({
    detail: { ...baseDetail, checkInOpen: true, canMarkAttendance: true, canManageCheckIn: true },
    token: "tokABC",
  });
  post.mockResolvedValue({ data: { data: { closed: true } } });

  renderWithProviders(<SessionDetailScreen />);

  expect(await screen.findByText("Code: tokABC")).toBeTruthy();
  fireEvent.press(screen.getByText("Close check-in"));
  await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/sessions/12/check-in-close"));

  fireEvent.press(screen.getByText("Mark attendance"));
  expect(mockPush).toHaveBeenCalledWith({ pathname: "/session/[id]/attendance", params: { id: "12" } });
});

it("gives a leader a read-only live roster — no open/close (spec 04 §9 row 2, G18)", async () => {
  useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [3] }, { id: 5 }));
  routeGets({
    detail: { ...baseDetail, checkInOpen: true, canMarkAttendance: true, canManageCheckIn: false },
    token: "never-shown",
    roster: [
      { studentUserId: 21, name: "Sara Student", email: "sara@jpc.test", groupName: "Group A",
        status: "PRESENT", notes: null, lateMinutes: null },
      { studentUserId: 22, name: "Omar Student", email: "omar@jpc.test", groupName: "Group A",
        status: null, notes: null, lateMinutes: null },
    ],
  });

  renderWithProviders(<SessionDetailScreen />);

  expect(await screen.findByText("Sara Student")).toBeTruthy();
  expect(screen.getByText("Check-in is open")).toBeTruthy();
  expect(screen.getByText("Present")).toBeTruthy();
  expect(screen.getByText("Not checked in")).toBeTruthy();
  expect(screen.queryByText("Open check-in")).toBeNull();
  expect(screen.queryByText("Close check-in")).toBeNull();
  expect(screen.queryByText(/Code:/)).toBeNull();
  // The leader never pulls the season list just to find a token they may not use.
  expect(get).not.toHaveBeenCalledWith("/api/v1/seasons/7/sessions");
  expect(screen.getByText("Mark attendance")).toBeTruthy();
});

it("refreshes the leader's roster every 10 seconds while check-in is open", async () => {
  jest.useFakeTimers();
  try {
    useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [3] }, { id: 5 }));
    routeGets({
      detail: { ...baseDetail, checkInOpen: true, canMarkAttendance: true, canManageCheckIn: false },
      token: null,
      roster: [],
    });
    const rosterCalls = () =>
      get.mock.calls.filter(([url]) => url === "/api/v1/sessions/12/attendance").length;

    renderWithProviders(<SessionDetailScreen />);
    expect(await screen.findByText("Check-in is open")).toBeTruthy();
    await waitFor(() => expect(rosterCalls()).toBe(1));

    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });
    await waitFor(() => expect(rosterCalls()).toBe(2));
  } finally {
    jest.useRealTimers();
  }
});
