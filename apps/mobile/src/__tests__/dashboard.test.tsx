import { fireEvent, screen, waitFor } from "@testing-library/react-native";

// Same hoisting constraint as use-session.test.tsx and use-sessions.test.tsx:
// a `jest.mock` factory may only close over out-of-scope consts whose names
// start with `mock`. Declare the fn inline, then import the mocked module's
// own export and alias it below. Mocking `apiClient` (not the hook) is the
// point — it's the wiring between the query, the store, and the four render
// states that's under test here.
jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn() },
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";

import DashboardScreen from "../../app/(app)/dashboard";

const get = apiClient.get as jest.Mock;

const scopesWithSeason = {
  seasonAdminIds: [],
  groupLeaderIds: [],
  activeSeasonId: 7,
  graduationYear: null as number | null,
};

const session = {
  id: 1,
  title: "Kickoff",
  startsAt: "2026-03-01T18:00:00.000Z",
  durationMinutes: 60,
  location: "Room 1",
  recurrenceGroupId: null,
  attendanceMarked: false,
  seasonId: 7,
  seasonCode: "S26",
  seasonTitle: "Spring 2026",
  checkInToken: null,
  checkInOpenAt: null,
  checkInClosedAt: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("DashboardScreen", () => {
  it("shows a distinct empty state when there is no active season, without calling the API", async () => {
    useSessionStore.setState({
      scopes: { ...scopesWithSeason, activeSeasonId: null },
    });

    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText("No active season")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });

  it("shows LoadingState while the request is in flight", async () => {
    useSessionStore.setState({ scopes: scopesWithSeason });
    let resolveGet: (value: unknown) => void = () => {};
    get.mockReturnValue(new Promise((resolve) => (resolveGet = resolve)));

    renderWithProviders(<DashboardScreen />);

    expect(screen.getByLabelText("Loading")).toBeTruthy();

    // Settle the pending request through RNTL's own async utilities rather
    // than a manual `act()` — React Query's notifyManager batches its
    // subscriber notification via a macrotask, so a resolve wrapped in
    // `act(async () => {...})` still lands outside the wrapped scope. `waitFor`
    // keeps polling (and wrapping in `act`) until the update actually lands.
    resolveGet({ data: { data: { sessions: [] } } });
    await screen.findByText("No sessions");
  });

  it("shows ErrorState with onRetry wired to the query's refetch", async () => {
    useSessionStore.setState({ scopes: scopesWithSeason });
    get.mockRejectedValueOnce(new Error("network down"));

    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText(/Couldn't load sessions/)).toBeTruthy();
    expect(get).toHaveBeenCalledTimes(1);

    get.mockResolvedValueOnce({ data: { data: { sessions: [session] } } });
    fireEvent.press(screen.getByText("Try again"));

    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Kickoff")).toBeTruthy();
  });

  it("shows EmptyState when the season has no sessions", async () => {
    useSessionStore.setState({ scopes: scopesWithSeason });
    get.mockResolvedValue({ data: { data: { sessions: [] } } });

    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText("No sessions")).toBeTruthy();
  });

  it("renders session rows on success", async () => {
    useSessionStore.setState({ scopes: scopesWithSeason });
    get.mockResolvedValue({ data: { data: { sessions: [session] } } });

    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText("Kickoff")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/seasons/7/sessions");
  });
});
