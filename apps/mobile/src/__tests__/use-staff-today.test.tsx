import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));

import { apiClient } from "../lib/api-client";
import { useStaffToday } from "../hooks/use-staff-today";
import { useSessionStore } from "../store/session";
import { staffDashboard } from "./helpers/dashboard-fixtures";
import { makeSession } from "./helpers/session";

const get = apiClient.get as jest.Mock;

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const season = (id: number, status: string, startDate: string) => ({
  id,
  code: `s${id}`,
  title: `Season ${id}`,
  program: "TEST",
  year: 2026,
  status,
  startDate,
  endDate: "2026-12-31T00:00:00.000Z",
});
const session = (id: number, seasonId: number, startsAt: string, marked = false) => ({
  id,
  title: `S${id}`,
  startsAt,
  dayKey: startsAt.slice(0, 10),
  startTime: "10:00",
  durationMinutes: 60,
  location: null,
  recurrenceGroupId: null,
  attendanceMarked: marked,
  seasonId,
  seasonCode: `s${seasonId}`,
  seasonTitle: `Season ${seasonId}`,
  checkInToken: null,
  checkInOpenAt: null,
  checkInClosedAt: null,
});
const ok = (data: unknown) => Promise.resolve({ data: { data } });
const scope = { seasonIds: [], seasons: [], truncated: false, label: "x" };

const SEASONS = [
  season(1, "ACTIVE", "2026-01-01T00:00:00.000Z"),
  season(2, "ARCHIVED", "2025-01-01T00:00:00.000Z"),
  season(3, "ACTIVE", "2026-06-01T00:00:00.000Z"),
];
const PAST = "2020-01-01T10:00:00.000Z";

let sessionsFail: number[] = [];
function route(url: string) {
  if (url === "/api/v1/seasons") return ok({ seasons: SEASONS });
  const m = /^\/api\/v1\/seasons\/(\d+)\/sessions$/.exec(url);
  if (m) {
    const id = Number(m[1]);
    return sessionsFail.includes(id)
      ? Promise.reject(new Error("boom"))
      : ok({ sessions: [session(id * 10, id, PAST), session(id * 10 + 1, id, PAST, true)] });
  }
  if (url.startsWith("/api/v1/submissions?")) {
    return ok({ items: [], counts: { pending: 4, total: 9, late: 1 }, nextCursor: null });
  }
  if (url.startsWith("/api/v1/reports/engagement/students")) {
    return ok({ scope, rows: [], nextCursor: null, total: 2 });
  }
  if (url === "/api/v1/users/invites/pending") return ok({ pending: 5 });
  return Promise.reject(new Error(`unexpected ${url}`));
}
const urls = () => get.mock.calls.map((c) => c[0] as string);

beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  sessionsFail = [];
  get.mockImplementation(route);
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("useStaffToday", () => {
  it("SUPER reads sessions only for ACTIVE seasons, with no season on the queue or engagement", async () => {
    useSessionStore.setState(makeSession("SUPER"));
    const { result } = renderHook(() => useStaffToday("SUPER"), { wrapper });
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.seasonIds.sort()).toEqual([1, 3]);
    expect(result.current.scopeSeasonId).toBeNull();
    expect(urls()).toEqual(expect.arrayContaining(["/api/v1/seasons/1/sessions", "/api/v1/seasons/3/sessions"]));
    expect(urls()).not.toContain("/api/v1/seasons/2/sessions");
    expect(urls().find((u) => u.startsWith("/api/v1/submissions?"))).not.toContain("seasonId");
    expect(urls().find((u) => u.startsWith("/api/v1/reports/engagement"))).not.toContain("seasonId");
    expect(result.current.needs).toEqual({
      pendingReview: 4,
      unmarkedSessions: 2,
      atRisk: 2,
      pendingInvites: 5,
    });
  });

  it("ADMIN scopes to the current season, and never asks for pending invites", async () => {
    useSessionStore.setState(makeSession("ADMIN"));
    const { result } = renderHook(() => useStaffToday("ADMIN"), { wrapper });
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.seasonIds).toEqual([3]);
    expect(result.current.scopeSeasonId).toBe(3);
    expect(urls()).not.toContain("/api/v1/users/invites/pending");
    expect(urls().find((u) => u.startsWith("/api/v1/submissions?"))).toContain("seasonId=3");
    expect(urls().find((u) => u.startsWith("/api/v1/reports/engagement"))).toContain("seasonId=3");
    expect(result.current.needs.pendingInvites).toBeUndefined();
    expect(result.current.needs).toMatchObject({ pendingReview: 4, unmarkedSessions: 1, atRisk: 2 });
  });

  it("a failed sessions read gives unmarkedSessions null while the other counts stay numbers", async () => {
    sessionsFail = [3];
    useSessionStore.setState(makeSession("ADMIN"));
    const { result } = renderHook(() => useStaffToday("ADMIN"), { wrapper });
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.needs).toMatchObject({ pendingReview: 4, unmarkedSessions: null, atRisk: 2 });
  });

  it("SUPER with no active seasons has no sessions and zero unmarked", async () => {
    get.mockImplementation((url: string) =>
      url === "/api/v1/seasons" ? ok({ seasons: [season(2, "ARCHIVED", "2025-01-01T00:00:00.000Z")] }) : route(url),
    );
    useSessionStore.setState(makeSession("SUPER"));
    const { result } = renderHook(() => useStaffToday("SUPER"), { wrapper });
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.sessions).toEqual([]);
    expect(result.current.needs.unmarkedSessions).toBe(0);
    expect(urls().some((u) => u.includes("/sessions"))).toBe(false);
  });

  describe("counts from the server's day", () => {
    // Both seasons' sessions sit on 2020-01-01, long past by the device.
    function serveDashboard(todayOrgDay: string | Error) {
      get.mockImplementation((url: string) =>
        url.startsWith("/api/v1/me/dashboard")
          ? todayOrgDay instanceof Error
            ? Promise.reject(todayOrgDay)
            : ok({ ...staffDashboard("season"), todayOrgDay })
          : route(url),
      );
    }

    it("a server day before the sessions' day: nothing is over yet, whatever the device says", async () => {
      serveDashboard("2019-12-31");
      useSessionStore.setState(makeSession("ADMIN"));
      const { result } = renderHook(() => useStaffToday("ADMIN"), { wrapper });
      await waitFor(() => expect(result.current.orgToday).toBe("2019-12-31"));
      expect(result.current.needs.unmarkedSessions).toBe(0);
      expect(urls()).toContain("/api/v1/me/dashboard?seasonId=3");
    });

    it("SUPER reads the first active season's dashboard for it", async () => {
      serveDashboard("2019-12-31");
      useSessionStore.setState(makeSession("SUPER"));
      const { result } = renderHook(() => useStaffToday("SUPER"), { wrapper });
      await waitFor(() => expect(result.current.orgToday).toBe("2019-12-31"));
      expect(result.current.needs.unmarkedSessions).toBe(0);
      expect(urls().filter((u) => u.startsWith("/api/v1/me/dashboard"))).toHaveLength(1);
    });

    it("a failing dashboard falls back to the device's day, and Today still settles", async () => {
      serveDashboard(new Error("down"));
      useSessionStore.setState(makeSession("ADMIN"));
      const { result } = renderHook(() => useStaffToday("ADMIN"), { wrapper });
      await waitFor(() => expect(result.current.isPending).toBe(false));
      await waitFor(() => expect(urls()).toContain("/api/v1/me/dashboard?seasonId=3"));
      expect(result.current.orgToday).toBeUndefined();
      expect(result.current.needs.unmarkedSessions).toBe(1);
    });
  });
});
