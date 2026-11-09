import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn(), post: jest.fn() } }));
jest.mock("react-native-qrcode-svg", () => "QRCode");
jest.mock("../design/ui/toaster", () => ({ toast: { success: jest.fn(), error: jest.fn() }, Toaster: () => null }));
jest.mock("expo-camera", () => require("./helpers/expo-camera"));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "12" }),
  useRouter: () => ({ push: mockPush }),
  // Focused for the whole test: run the effect like a plain useEffect.
  useFocusEffect: (effect: () => void | (() => void)) => require("react").useEffect(effect, [effect]),
}));

import type { SessionDetail } from "@space/shared";

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderStacked } from "./helpers/render";
import { makeSession } from "./helpers/session";
import SessionDetailScreen from "../../app/(app)/session/[id]/index";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

const baseDetail: SessionDetail = {
  id: 12,
  title: "Week 3",
  description: "Bring your notebook.",
  startsAt: "2099-03-15T18:00:00.000Z",
  dayKey: "2099-03-15",
  startTime: "20:00",
  durationMinutes: 90,
  location: "Hall B",
  youtubeUrl: null,
  recurrenceGroupId: null,
  seasonId: 7,
  seasonCode: "s7",
  seasonTitle: "Spring",
  checkInOpen: false,
  myAttendance: null,
  canMarkAttendance: false,
  canManageCheckIn: false,
};

const checkInState = (over: Record<string, unknown> = {}) => ({
  state: "not_open",
  isOpen: false,
  checkInToken: null,
  checkInOpenAt: null,
  checkInClosedAt: null,
  expiresAt: null,
  expiresAtTime: null,
  ...over,
});

interface RouteState {
  detail: SessionDetail;
  checkIn?: ReturnType<typeof checkInState>;
  roster?: unknown[];
  quizzes?: unknown[];
}

const ok = (data: unknown) => Promise.resolve({ data: { data } });

/** Routes GETs by URL; state is read at call time so a test can change it mid-flight. */
function routeGets(state: RouteState) {
  get.mockImplementation((url: string) => {
    if (url === "/api/v1/sessions/12") return ok(state.detail);
    if (url === "/api/v1/sessions/12/check-in") return ok(state.checkIn ?? checkInState());
    if (url === "/api/v1/sessions/12/attendance") return ok({ roster: state.roster ?? [] });
    if (url === "/api/v1/sessions/12/quizzes") return ok({ quizzes: state.quizzes ?? [] });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

const admin = () => makeSession("ADMIN", { seasonAdminIds: [7] }, { id: 2 });
const leader = () => makeSession("LEADER", { groupLeaderIds: [3] }, { id: 5 });

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

it("shows a student the org-time header and their attendance, and no staff cards (C4)", async () => {
  useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }, { id: 9 }));
  routeGets({
    detail: { ...baseDetail, myAttendance: { status: "LATE", notes: null, lateMinutes: 10, checkedInAt: null } },
  });

  renderStacked(<SessionDetailScreen />);

  expect(await screen.findByText("Week 3")).toBeTruthy();
  // Server-derived day and wall-clock time (X13) — not the device's reading of startsAt.
  expect(screen.getAllByRole("link", { name: "Back" })).toHaveLength(1); // the pinned bar (R23)
  expect(screen.queryByText("← Calendar")).toBeNull();
  expect(screen.getByText("Sunday, March 15, 2099")).toBeTruthy();
  expect(screen.getByText("8:00 PM – 9:30 PM · 90 min")).toBeTruthy();
  expect(screen.getByText("Your attendance: Late (10 min)")).toBeTruthy();
  // Already marked by the leader: nothing left to check in to.
  expect(screen.queryByText("Check In")).toBeNull();
  expect(screen.queryByText("Check-in isn't open right now")).toBeNull();
  expect(screen.queryByText("Edit session")).toBeNull();
  expect(screen.queryByText("Mark attendance")).toBeNull();
  expect(get).not.toHaveBeenCalledWith("/api/v1/sessions/12/quizzes");
});

describe("student session detail on the kit (Task 10)", () => {
  const student = () => useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }, { id: 9 }));

  it("puts Check in before the Details group", async () => {
    student();
    routeGets({ detail: { ...baseDetail, checkInOpen: true } });
    renderStacked(<SessionDetailScreen />);
    await screen.findByText("Check In");
    const texts = screen
      .UNSAFE_getAllByType(require("react-native").Text)
      .map((n) => [n.props.children].flat().join(""));
    expect(texts.indexOf("Check In")).toBeGreaterThan(-1);
    expect(texts.indexOf("Check In")).toBeLessThan(texts.indexOf("DETAILS"));
  });

  it("shows the attendance word as a chip in the Attendance row", async () => {
    student();
    routeGets({
      detail: { ...baseDetail, myAttendance: { status: "LATE", notes: null, lateMinutes: 10, checkedInAt: null } },
    });
    renderStacked(<SessionDetailScreen />);
    expect(await screen.findByText("Attendance")).toBeTruthy();
    expect(screen.getByText("Late")).toBeTruthy();
    expect(screen.getByText("Your attendance: Late (10 min)")).toBeTruthy();
  });

  it("shows no Location row without a location, and no Attendance row without attendance", async () => {
    student();
    routeGets({ detail: { ...baseDetail, location: null } });
    renderStacked(<SessionDetailScreen />);
    expect(await screen.findByText("Time")).toBeTruthy();
    expect(screen.queryByText("Location")).toBeNull();
    expect(screen.queryByText("Attendance")).toBeNull();
  });
});

it("lets a season admin open check-in and shows the QR from the open response", async () => {
  useSessionStore.setState(admin());
  const state: RouteState = { detail: { ...baseDetail, canMarkAttendance: true, canManageCheckIn: true } };
  routeGets(state);
  post.mockImplementation((url: string) => {
    if (url === "/api/v1/sessions/12/check-in-open") {
      state.detail = { ...state.detail, checkInOpen: true };
      return ok({ checkInToken: "tok123" });
    }
    return Promise.reject(new Error(`unexpected POST ${url}`));
  });

  renderStacked(<SessionDetailScreen />);

  fireEvent.press(await screen.findByText("Open check-in"));
  await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/sessions/12/check-in-open"));
  expect(await screen.findByText("Code: tok123")).toBeTruthy();
  expect(await screen.findByText("Close check-in")).toBeTruthy();
});

it("recovers an open session's QR from GET /check-in — not the season-wide list (D-16.9)", async () => {
  useSessionStore.setState(admin());
  routeGets({
    detail: { ...baseDetail, checkInOpen: true, canMarkAttendance: true, canManageCheckIn: true },
    checkIn: checkInState({ state: "open", isOpen: true, checkInToken: "tokABC", expiresAtTime: "23:00" }),
  });
  post.mockResolvedValue({ data: { data: { closed: true } } });

  renderStacked(<SessionDetailScreen />);

  expect(await screen.findByText("Code: tokABC")).toBeTruthy();
  expect(screen.getByText("Closes at 11:00 PM")).toBeTruthy();
  expect(get).not.toHaveBeenCalledWith("/api/v1/seasons/7/sessions");
  fireEvent.press(screen.getByText("Close check-in"));
  await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/sessions/12/check-in-close"));

  fireEvent.press(screen.getByText("Mark attendance"));
  expect(mockPush).toHaveBeenCalledWith({ pathname: "/session/[id]/attendance", params: { id: "12" } });
});

it("regenerates an OPEN session's code only on a confirming second press (spec 03 §10 item 9)", async () => {
  useSessionStore.setState(admin());
  const state: RouteState = {
    detail: { ...baseDetail, checkInOpen: true, canMarkAttendance: true, canManageCheckIn: true },
    checkIn: checkInState({ state: "open", isOpen: true, checkInToken: "tokOLD" }),
  };
  routeGets(state);
  post.mockImplementation((url: string) => {
    if (url === "/api/v1/sessions/12/check-in-regenerate") {
      state.checkIn = checkInState({ state: "open", isOpen: true, checkInToken: "tokNEW" });
      return ok({ checkInToken: "tokNEW" });
    }
    return Promise.reject(new Error(`unexpected POST ${url}`));
  });

  renderStacked(<SessionDetailScreen />);

  fireEvent.press(await screen.findByText("Regenerate code"));
  expect(post).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText("Replace the code? The current one stops working."));
  await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/sessions/12/check-in-regenerate"));
  expect(await screen.findByText("Code: tokNEW")).toBeTruthy();
});

it("gives a season admin Edit session", async () => {
  useSessionStore.setState(admin());
  routeGets({ detail: { ...baseDetail, canMarkAttendance: true, canManageCheckIn: true } });
  renderStacked(<SessionDetailScreen />);
  fireEvent.press(await screen.findByText("Edit"));
  expect(mockPush).toHaveBeenCalledWith({ pathname: "/session/[id]/edit", params: { id: "12" } });
});

it("gives a leader a read-only live roster — no open/close/regenerate/edit (spec 04 §9 row 2)", async () => {
  useSessionStore.setState(leader());
  routeGets({
    detail: { ...baseDetail, checkInOpen: true, canMarkAttendance: true, canManageCheckIn: false },
    roster: [
      {
        studentUserId: 21,
        name: "Sara Student",
        email: "sara@jpc.test",
        groupName: "Group A",
        status: "PRESENT",
        notes: null,
        lateMinutes: null,
      },
      {
        studentUserId: 22,
        name: "Omar Student",
        email: "omar@jpc.test",
        groupName: "Group A",
        status: null,
        notes: null,
        lateMinutes: null,
      },
    ],
  });

  renderStacked(<SessionDetailScreen />);

  expect(await screen.findByText("Sara Student")).toBeTruthy();
  // v1: an Open/Closed badge in the card header, and v1's "Not recorded".
  expect(screen.getByText("Check-in")).toBeTruthy();
  expect(screen.getByText("Open")).toBeTruthy();
  expect(screen.getByText("Present")).toBeTruthy();
  expect(screen.getByText("Not recorded")).toBeTruthy();
  expect(screen.getByText("Sun, Mar 15 · 8:00 PM")).toBeTruthy();
  // The leader page has no duration, location or description (v1).
  expect(screen.queryByText("Hall B")).toBeNull();
  expect(screen.queryByText("Bring your notebook.")).toBeNull();
  for (const label of ["Open check-in", "Close check-in", "Regenerate code", "Edit session"]) {
    expect(screen.queryByText(label)).toBeNull();
  }
  expect(screen.queryByText(/Code:/)).toBeNull();
  // The leader never asks for the token in any form.
  expect(get).not.toHaveBeenCalledWith("/api/v1/sessions/12/check-in");
  expect(get).not.toHaveBeenCalledWith("/api/v1/seasons/7/sessions");
  expect(screen.getByText("Mark attendance")).toBeTruthy();
});

it("refreshes the leader's roster every 10 seconds while check-in is open", async () => {
  jest.useFakeTimers();
  try {
    useSessionStore.setState(leader());
    routeGets({
      detail: { ...baseDetail, checkInOpen: true, canMarkAttendance: true, canManageCheckIn: false },
      roster: [],
    });
    const rosterCalls = () => get.mock.calls.filter(([url]) => url === "/api/v1/sessions/12/attendance").length;

    renderStacked(<SessionDetailScreen />);
    expect(await screen.findByText("Open")).toBeTruthy();
    await waitFor(() => expect(rosterCalls()).toBe(1));

    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });
    await waitFor(() => expect(rosterCalls()).toBe(2));
  } finally {
    jest.useRealTimers();
  }
});

it("lists who has checked in on the admin console and refreshes it while open (REG-78)", async () => {
  jest.useFakeTimers();
  try {
    useSessionStore.setState(admin());
    routeGets({
      detail: { ...baseDetail, checkInOpen: true, canMarkAttendance: true, canManageCheckIn: true },
      checkIn: checkInState({ state: "open", isOpen: true, checkInToken: "tokABC" }),
      roster: [
        {
          studentUserId: 1,
          name: "Ada",
          email: "a@x.org",
          groupName: "G1",
          status: "PRESENT",
          notes: null,
          lateMinutes: null,
        },
        {
          studentUserId: 2,
          name: "Bo",
          email: "b@x.org",
          groupName: "G1",
          status: null,
          notes: null,
          lateMinutes: null,
        },
      ],
    });
    const rosterCalls = () => get.mock.calls.filter(([url]) => url === "/api/v1/sessions/12/attendance").length;

    renderStacked(<SessionDetailScreen />);
    expect(await screen.findByText("Code: tokABC")).toBeTruthy();
    expect(await screen.findByText("Ada")).toBeTruthy();
    expect(screen.getByText("Present")).toBeTruthy();
    expect(screen.getByText("Not recorded")).toBeTruthy();
    await waitFor(() => expect(rosterCalls()).toBe(1));
    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });
    await waitFor(() => expect(rosterCalls()).toBe(2));
  } finally {
    jest.useRealTimers();
  }
});

it("hides the console from a SUPER who is not an admin of the season, keeping a read-only roster (REG-79)", async () => {
  useSessionStore.setState(makeSession("SUPER", { seasonAdminIds: [99] }, { id: 1 }));
  routeGets({ detail: { ...baseDetail, canMarkAttendance: true, canManageCheckIn: true } });
  renderStacked(<SessionDetailScreen />);
  expect(await screen.findByText("Closed")).toBeTruthy();
  expect(screen.queryByText("Open check-in")).toBeNull();
  expect(get).not.toHaveBeenCalledWith("/api/v1/sessions/12/check-in");
});

it("shows a SUPER who administers the season the console (REG-79)", async () => {
  useSessionStore.setState(makeSession("SUPER", { seasonAdminIds: [7] }, { id: 1 }));
  routeGets({ detail: { ...baseDetail, canMarkAttendance: true, canManageCheckIn: true } });
  renderStacked(<SessionDetailScreen />);
  expect(await screen.findByText("Open check-in")).toBeTruthy();
});
