import { act, screen, waitFor } from "@testing-library/react-native";
import { ScrollView } from "react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn(), post: jest.fn() } }));
jest.mock("react-native-qrcode-svg", () => "QRCode");
jest.mock("expo-camera", () => require("./helpers/expo-camera"));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "12" }),
  useRouter: () => ({ push: jest.fn() }),
  // Focused for the whole test: run the effect like a plain useEffect.
  useFocusEffect: (effect: () => void | (() => void)) => require("react").useEffect(effect, [effect]),
}));

import type { SessionDetail } from "@space/shared";

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { studentDashboard } from "./helpers/dashboard-fixtures";
import { makeSession } from "./helpers/session";
import SessionDetailScreen from "../../app/(app)/session/[id]/index";

/**
 * The session detail screen's freshness: the check-in card follows the
 * session's check-in state, and a 404 is an answer rather than an error.
 */

const get = apiClient.get as jest.Mock;

const baseDetail: SessionDetail = {
  id: 12, title: "Week 3", description: null,
  startsAt: "2099-03-15T18:00:00.000Z", dayKey: "2099-03-15", startTime: "20:00",
  durationMinutes: 90, location: null, youtubeUrl: null, recurrenceGroupId: null,
  seasonId: 7, seasonCode: "s7", seasonTitle: "Spring",
  checkInOpen: false, myAttendance: null, canMarkAttendance: true, canManageCheckIn: false,
};

const ok = (data: unknown) => Promise.resolve({ data: { data } });

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

it("tells a student a session they can't open is not available, with no retry (REG-77)", async () => {
  useSessionStore.setState(makeSession("STUDENT", {}, { id: 9 }));
  get.mockRejectedValue(
    Object.assign(new Error("404"), {
      isAxiosError: true,
      response: { status: 404, data: { error: { code: "not_found", message: "Session not found." } } },
    }),
  );

  renderWithProviders(<SessionDetailScreen />);
  expect(await screen.findByText("Not available")).toBeTruthy();
  expect(screen.queryByText("Try again")).toBeNull();
});

it("refetches the session detail on the same interval, so the badge and polling follow check-in", async () => {
  jest.useFakeTimers();
  try {
    useSessionStore.setState(makeSession("LEADER", { groupLeaderIds: [3] }, { id: 5 }));
    let detail = baseDetail;
    get.mockImplementation((url: string) => {
      if (url === "/api/v1/sessions/12") return ok(detail);
      if (url === "/api/v1/sessions/12/attendance") return ok({ roster: [] });
      if (url === "/api/v1/sessions/12/quizzes") return ok({ quizzes: [] });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    const rosterCalls = () => get.mock.calls.filter(([u]) => u === "/api/v1/sessions/12/attendance").length;

    renderWithProviders(<SessionDetailScreen />);
    expect(await screen.findByText("Closed")).toBeTruthy();
    await waitFor(() => expect(rosterCalls()).toBe(1));

    // Check-in is opened elsewhere; the next tick picks it up.
    detail = { ...baseDetail, checkInOpen: true };
    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });
    expect(await screen.findByText("Open")).toBeTruthy();
    // Closed until now, so the roster was not polled on that tick...
    expect(rosterCalls()).toBe(1);
    // ...but it is from the next one on.
    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });
    await waitFor(() => expect(rosterCalls()).toBe(2));
  } finally {
    jest.useRealTimers();
  }
});

it("a student's session stays on screen when a poll fails, and the poll runs on the server's day", async () => {
  jest.useFakeTimers();
  try {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }, { id: 9 }));
    const dashboard = { ...studentDashboard, todayOrgDay: "2099-03-15" };
    let fail = false;
    get.mockImplementation((url: string) => {
      if (url === "/api/v1/me/dashboard") return ok(dashboard);
      if (url !== "/api/v1/sessions/12") return Promise.reject(new Error(`not served: ${url}`));
      return fail
        ? Promise.reject(new Error("blip"))
        : ok({ ...baseDetail, canMarkAttendance: false });
    });

    renderWithProviders(<SessionDetailScreen />);
    expect(await screen.findByText("Week 3")).toBeTruthy();
    await waitFor(() => expect(get).toHaveBeenCalledWith("/api/v1/me/dashboard"));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    const reads = () => get.mock.calls.filter(([u]) => u === "/api/v1/sessions/12").length;
    const before = reads();

    fail = true;
    await act(async () => {
      await jest.advanceTimersByTimeAsync(10_000);
    });
    expect(reads()).toBe(before + 1);
    expect(screen.getByText("Week 3")).toBeTruthy();
    expect(screen.queryByText("Something went wrong")).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});

it("on a student's session a poll leaves the pull's spinner down, and a pull raises it", async () => {
  jest.useFakeTimers();
  try {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }, { id: 9 }));
    const control = () => screen.UNSAFE_getByType(ScrollView).props.refreshControl.props;
    const student = { ...baseDetail, canMarkAttendance: false };
    let release: (() => void) | null = null;
    let hold = false;
    get.mockImplementation((url: string) => {
      if (url === "/api/v1/me/dashboard") return ok({ ...studentDashboard, todayOrgDay: "2099-03-15" });
      if (url !== "/api/v1/sessions/12") return Promise.reject(new Error(`not served: ${url}`));
      if (!hold) return ok(student);
      return new Promise((resolve) => {
        release = () => resolve({ data: { data: student } });
      });
    });
    const finish = () =>
      act(async () => {
        release?.();
        await jest.advanceTimersByTimeAsync(0);
      });

    renderWithProviders(<SessionDetailScreen />);
    expect(await screen.findByText("Week 3")).toBeTruthy();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });

    hold = true;
    await act(async () => {
      await jest.advanceTimersByTimeAsync(10_000);
    });
    expect(release).not.toBeNull();
    // The read is out and still unanswered: let its state reach the screen.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(50);
    });
    expect(control().refreshing).toBe(false);
    await finish();

    await act(async () => {
      control().onRefresh();
    });
    expect(control().refreshing).toBe(true);
    await finish();
    expect(control().refreshing).toBe(false);
  } finally {
    jest.useRealTimers();
  }
});
