import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn(), post: jest.fn() } }));
jest.mock("react-native-qrcode-svg", () => "QRCode");
jest.mock("expo-camera", () => require("./helpers/expo-camera"));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "12" }),
  useRouter: () => ({ push: mockPush }),
}));

import type { SessionDetail } from "@space/shared";

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import SessionDetailScreen from "../../app/(app)/session/[id]/index";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

const baseDetail: SessionDetail = {
  id: 12, title: "Week 3", description: "Bring your notebook.",
  startsAt: "2099-03-15T18:00:00.000Z", dayKey: "2099-03-15", startTime: "20:00",
  durationMinutes: 90, location: "Hall B", youtubeUrl: null, recurrenceGroupId: null,
  seasonId: 7, seasonCode: "s7", seasonTitle: "Spring",
  checkInOpen: false, myAttendance: null, canMarkAttendance: false, canManageCheckIn: false,
};

const checkInState = (over: Record<string, unknown> = {}) => ({
  state: "not_open", isOpen: false, checkInToken: null, checkInOpenAt: null,
  checkInClosedAt: null, expiresAt: null, expiresAtTime: null, ...over,
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

  renderWithProviders(<SessionDetailScreen />);

  expect(await screen.findByText("Week 3")).toBeTruthy();
  // Server-derived day and wall-clock time (X13) — not the device's reading of startsAt.
  expect(screen.getByText("Mar 15, 2099 · 8:00 PM · 90 min")).toBeTruthy();
  expect(screen.getByText("Your attendance: Late (10 min)")).toBeTruthy();
  expect(screen.getByText("Check-in isn't open right now.")).toBeTruthy();
  expect(screen.queryByText("Edit session")).toBeNull();
  expect(screen.queryByText("Mark attendance")).toBeNull();
  expect(get).not.toHaveBeenCalledWith("/api/v1/sessions/12/quizzes");
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

  renderWithProviders(<SessionDetailScreen />);

  fireEvent.press(await screen.findByText("Open check-in"));
  await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/sessions/12/check-in-open"));
  expect(await screen.findByText("Code: tok123")).toBeTruthy();
  expect(await screen.findByText("Close check-in")).toBeTruthy();
  // v1 parity 2026-10-09 (03 R68, 04 R41): the QR holds v1's full check-in URL, not the bare token.
  expect(screen.UNSAFE_getByProps({ size: 220 }).props.value).toMatch(/^.*\/checkin\/tok123$/);
});

it("recovers an open session's QR from GET /check-in — not the season-wide list (D-16.9)", async () => {
  useSessionStore.setState(admin());
  routeGets({
    detail: { ...baseDetail, checkInOpen: true, canMarkAttendance: true, canManageCheckIn: true },
    checkIn: checkInState({ state: "open", isOpen: true, checkInToken: "tokABC", expiresAtTime: "23:00" }),
  });
  post.mockResolvedValue({ data: { data: { closed: true } } });

  renderWithProviders(<SessionDetailScreen />);

  expect(await screen.findByText("Code: tokABC")).toBeTruthy();
  expect(screen.getByText("Closes at 11:00 PM")).toBeTruthy();
  // v1's QR payload is the full <AUTH_URL>/checkin/<token> (03-sessions R68), not the bare token.
  const qrValue = screen.UNSAFE_getByType("QRCode" as unknown as React.ComponentType).props.value as string;
  expect(qrValue).toMatch(/\/checkin\/tokABC$/);
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

  renderWithProviders(<SessionDetailScreen />);

  fireEvent.press(await screen.findByText("Regenerate code"));
  expect(post).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText("Replace the code? The current one stops working."));
  await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/sessions/12/check-in-regenerate"));
  expect(await screen.findByText("Code: tokNEW")).toBeTruthy();
});

it("gives a season admin Edit session", async () => {
  useSessionStore.setState(admin());
  routeGets({ detail: { ...baseDetail, canMarkAttendance: true, canManageCheckIn: true } });
  renderWithProviders(<SessionDetailScreen />);
  fireEvent.press(await screen.findByText("Edit session"));
  expect(mockPush).toHaveBeenCalledWith({ pathname: "/session/[id]/edit", params: { id: "12" } });
});

it("gives a leader a read-only live roster — no open/close/regenerate/edit (spec 04 §9 row 2)", async () => {
  useSessionStore.setState(leader());
  routeGets({
    detail: { ...baseDetail, checkInOpen: true, canMarkAttendance: true, canManageCheckIn: false },
    roster: [
      { studentUserId: 21, name: "Sara Student", email: "sara@jpc.test", groupName: "Group A", status: "PRESENT", notes: null, lateMinutes: null },
      { studentUserId: 22, name: "Omar Student", email: "omar@jpc.test", groupName: "Group A", status: null, notes: null, lateMinutes: null },
    ],
  });

  renderWithProviders(<SessionDetailScreen />);

  expect(await screen.findByText("Sara Student")).toBeTruthy();
  expect(screen.getByText("Check-in is open")).toBeTruthy();
  expect(screen.getByText("Present")).toBeTruthy();
  expect(screen.getByText("Not checked in")).toBeTruthy();
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
    routeGets({ detail: { ...baseDetail, checkInOpen: true, canMarkAttendance: true, canManageCheckIn: false }, roster: [] });
    const rosterCalls = () => get.mock.calls.filter(([url]) => url === "/api/v1/sessions/12/attendance").length;

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

it("lists who has checked in on the admin console and refreshes it while open (REG-78)", async () => {
  jest.useFakeTimers();
  try {
    useSessionStore.setState(admin());
    routeGets({
      detail: { ...baseDetail, checkInOpen: true, canMarkAttendance: true, canManageCheckIn: true },
      checkIn: checkInState({ state: "open", isOpen: true, checkInToken: "tokABC" }),
      roster: [
        { studentUserId: 1, name: "Ada", email: "a@x.org", groupName: "G1", status: "PRESENT", notes: null, lateMinutes: null },
        { studentUserId: 2, name: "Bo", email: "b@x.org", groupName: "G1", status: null, notes: null, lateMinutes: null },
      ],
    });
    const rosterCalls = () => get.mock.calls.filter(([url]) => url === "/api/v1/sessions/12/attendance").length;

    renderWithProviders(<SessionDetailScreen />);
    expect(await screen.findByText("Code: tokABC")).toBeTruthy();
    expect(await screen.findByText("Ada")).toBeTruthy();
    expect(screen.getByText("Present")).toBeTruthy();
    expect(screen.getByText("Not checked in")).toBeTruthy();
    expect(screen.getByText("1 of 2 checked in")).toBeTruthy();
    await waitFor(() => expect(rosterCalls()).toBe(1));
    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });
    await waitFor(() => expect(rosterCalls()).toBe(2));
  } finally {
    jest.useRealTimers();
  }
});

// v1 parity 2026-10-09 (03-sessions R103): v1's SUPER opens the admin session page,
// where canEditSeason admits any SUPER, so a SUPER gets the console.
it("shows any SUPER the console, administered season or not (03 R103)", async () => {
  useSessionStore.setState(makeSession("SUPER", { seasonAdminIds: [99] }, { id: 1 }));
  routeGets({ detail: { ...baseDetail, canMarkAttendance: true, canManageCheckIn: true } });
  renderWithProviders(<SessionDetailScreen />);
  expect(await screen.findByText("Open check-in")).toBeTruthy();
  expect(screen.queryByText("Check-in is closed")).toBeNull();
});

// v1 parity 2026-10-09 (04-attendance R98, R33; KEEP-FIX R32): v1 check-in-attendance-list.tsx.
it("sorts the console roster by name and overrides one student without the low-attendance flag", async () => {
  useSessionStore.setState(admin());
  routeGets({
    detail: { ...baseDetail, canMarkAttendance: true, canManageCheckIn: true },
    roster: [
      { studentUserId: 2, name: "Zed", email: "z@x.org", groupName: "A group", status: null, notes: "Kept note", lateMinutes: 7 },
      { studentUserId: 1, name: "Ada", email: "a@x.org", groupName: "Z group", status: "PRESENT", notes: null, lateMinutes: null },
    ],
  });
  post.mockResolvedValue({ data: { data: { saved: 1 } } });
  renderWithProviders(<SessionDetailScreen />);

  expect(await screen.findByText("Zed")).toBeTruthy();
  const names = screen.getAllByText(/^(Ada|Zed)$/).map((n) => n.props.children);
  expect(names).toEqual(["Ada", "Zed"]);

  fireEvent.press(screen.getByLabelText("Edit Zed"));
  fireEvent.press(screen.getByLabelText("Zed: Late"));
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith("/api/v1/sessions/12/attendance", {
      entries: [{ studentUserId: 2, status: "LATE", notes: "Kept note", lateMinutes: 7 }],
      consoleOverride: true,
    }),
  );
});

it("says \"No students have scanned yet.\" on an empty console roster", async () => {
  useSessionStore.setState(admin());
  routeGets({ detail: { ...baseDetail, canMarkAttendance: true, canManageCheckIn: true }, roster: [] });
  renderWithProviders(<SessionDetailScreen />);
  expect(await screen.findByText("No students have scanned yet.")).toBeTruthy();
});

it("shows staff the session's quizzes (G18; v1 leader/sessions/[id])", async () => {
  useSessionStore.setState(leader());
  routeGets({
    detail: { ...baseDetail, canMarkAttendance: true, canManageCheckIn: false },
    quizzes: [
      { id: 40, title: "Paper quiz", kind: "PAPER", maxScore: 20, questionCount: 0, publishedAt: null },
      { id: 41, title: "Online quiz", kind: "ONLINE", maxScore: 10, questionCount: 4, publishedAt: null },
    ],
  });
  renderWithProviders(<SessionDetailScreen />);
  expect(await screen.findByText("Quizzes")).toBeTruthy();
  expect(screen.getByText("Paper quiz")).toBeTruthy();
  expect(screen.getByText("Max score: 20")).toBeTruthy();
  expect(screen.getByText("Max score: 10 · Draft")).toBeTruthy();
});

it("hides the quiz card when the session has none", async () => {
  useSessionStore.setState(leader());
  routeGets({ detail: { ...baseDetail, canMarkAttendance: true, canManageCheckIn: false }, quizzes: [] });
  renderWithProviders(<SessionDetailScreen />);
  expect(await screen.findByText("Week 3")).toBeTruthy();
  await waitFor(() => expect(get).toHaveBeenCalledWith("/api/v1/sessions/12/quizzes"));
  expect(screen.queryByText("Quizzes")).toBeNull();
});

it("opens a session quiz's staff preview from the quiz card (Plan 8 Task 11b)", async () => {
  useSessionStore.setState(leader());
  routeGets({
    detail: { ...baseDetail, canMarkAttendance: true, canManageCheckIn: false },
    quizzes: [{ id: 41, title: "Online quiz", kind: "ONLINE", maxScore: 10, questionCount: 4, publishedAt: null }],
  });
  renderWithProviders(<SessionDetailScreen />);

  fireEvent.press(await screen.findByText("Online quiz"));

  expect(mockPush).toHaveBeenCalledWith({ pathname: "/quiz/[id]", params: { id: "41" } });
});
