// apps/mobile/src/__tests__/events-screen.test.tsx
import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => ({ id: "3" }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";

import EventsScreen from "../../app/(app)/events";
import EventDetailScreen from "../../app/(app)/event/[id]";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

const listRow = {
  id: 3,
  title: "Summer retreat",
  date: "2099-06-30T21:00:00.000Z",
  endDate: "2099-07-04T21:00:00.000Z",
  dayKey: "2099-07-01",
  endDayKey: "2099-07-05",
  time: null,
  allDay: true,
  url: null,
  visibility: "ALL" as const,
  seasonId: null,
  seasonCode: null,
};

const detailRow = {
  ...listRow,
  description: "Five days away.",
  seasonTitle: null,
  canManage: true,
};

const superSession = {
  user: { id: 1, name: "Su", email: "su@jpc.test", role: "SUPER" as const, avatarPath: null, hasPassword: true },
  scopes: { seasonAdminIds: [], groupLeaderIds: [], activeSeasonId: null, graduationYear: null },
};

const alumnusSession = {
  user: { id: 8, name: "Al", email: "al@jpc.test", role: "STUDENT" as const, avatarPath: null, hasPassword: true },
  scopes: { seasonAdminIds: [], groupLeaderIds: [], activeSeasonId: null, graduationYear: 2098 },
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  get.mockResolvedValue({ data: { data: { events: [listRow], total: 1 } } });
});

describe("events screen", () => {
  it("shows SUPER the manager with a create form", async () => {
    useSessionStore.setState(superSession);
    post.mockResolvedValue({ data: { data: detailRow } });

    renderWithProviders(<EventsScreen />);

    expect(await screen.findByText("Summer retreat")).toBeTruthy();
    fireEvent.press(screen.getByText("New event"));
    fireEvent.changeText(screen.getByLabelText("Title"), "Graduation");
    fireEvent.changeText(screen.getByLabelText("Date"), "2099-09-01");
    fireEvent.changeText(screen.getByLabelText("Time"), "18:30");
    fireEvent.press(screen.getByText("Create event"));

    // Wall-clock fields only — the device composes no instant and applies no
    // zone; the server does that in the org zone (ruling X13).
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/events", {
        title: "Graduation",
        day: "2099-09-01",
        time: "18:30",
        endDay: null,
        description: null,
        url: null,
        visibility: "ALL",
        seasonId: null,
      }),
    );
  });

  it("refuses a malformed time before any request", async () => {
    useSessionStore.setState(superSession);
    renderWithProviders(<EventsScreen />);

    fireEvent.press(await screen.findByText("New event"));
    fireEvent.changeText(screen.getByLabelText("Title"), "Graduation");
    fireEvent.changeText(screen.getByLabelText("Date"), "2099-09-01");
    fireEvent.changeText(screen.getByLabelText("Time"), "6pm");
    fireEvent.press(screen.getByText("Create event"));

    await waitFor(() => expect(post).not.toHaveBeenCalled());
    expect(screen.getByLabelText("Time").props.accessibilityHint).toContain("HH:mm");
  });

  it("shows a non-SUPER role the same list with no write controls", async () => {
    // Deep-linking here must not crash: /events is SUPER's sidebar entry, and
    // ALUMNI's "Events" points at /calendar (packages/shared/src/navigation.ts).
    useSessionStore.setState(alumnusSession);

    renderWithProviders(<EventsScreen />);

    expect(await screen.findByText("Summer retreat")).toBeTruthy();
    expect(screen.queryByText("New event")).toBeNull();
  });

  it("renders an empty state rather than nothing (spec 15 R75)", async () => {
    useSessionStore.setState(alumnusSession);
    get.mockResolvedValue({ data: { data: { events: [], total: 0 } } });

    renderWithProviders(<EventsScreen />);
    expect(await screen.findByText("No upcoming events")).toBeTruthy();
  });

  it("navigates to the detail v1 has no page for", async () => {
    useSessionStore.setState(alumnusSession);
    renderWithProviders(<EventsScreen />);
    fireEvent.press(await screen.findByText("Summer retreat"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/event/[id]", params: { id: "3" } });
  });
});

describe("event detail screen", () => {
  it("shows the description and the date range", async () => {
    useSessionStore.setState(alumnusSession);
    // The server decides: an alumnus's detail carries canManage: false.
    get.mockResolvedValue({ data: { data: { ...detailRow, canManage: false } } });

    renderWithProviders(<EventDetailScreen />);

    expect(await screen.findByText("Five days away.")).toBeTruthy();
    // All-day, so no time is rendered — the boolean comes from the server, and
    // the label is built from the server's org days, not from `date` (whose
    // UTC day is June 30th).
    expect(screen.getByText("Jul 1, 2099 – Jul 5, 2099")).toBeTruthy();
    expect(screen.queryByText("Delete event")).toBeNull();
  });

  it("offers edit and delete to SUPER only", async () => {
    useSessionStore.setState(superSession);
    get.mockResolvedValue({ data: { data: detailRow } });

    renderWithProviders(<EventDetailScreen />);
    expect(await screen.findByText("Delete event")).toBeTruthy();
  });
});
