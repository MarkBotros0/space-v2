// apps/mobile/src/__tests__/events-screen.test.tsx
import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { format } from "date-fns";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
const mockPush = jest.fn();
const mockDismissTo = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), dismissTo: mockDismissTo }),
  useLocalSearchParams: () => ({ id: "3" }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";

import EventsScreen from "../../app/(app)/events";
import EventDetailScreen from "../../app/(app)/event/[id]";

const get = apiClient.get as jest.Mock;
const del = apiClient.delete as jest.Mock;

/** The picker opens on the current month, so today is always on screen. */
function pickToday(label: string) {
  fireEvent.press(screen.getByLabelText(label));
  fireEvent.press(screen.getByLabelText(format(new Date(), "PPP")));
  return format(new Date(), "yyyy-MM-dd");
}
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
  user: {
    id: 1,
    name: "Su",
    email: "su@jpc.test",
    role: "SUPER" as const,
    avatarPath: null,
    hasPassword: true,
  },
  scopes: { seasonAdminIds: [], groupLeaderIds: [], activeSeasonId: null, graduationYear: null },
};

const alumnusSession = {
  user: {
    id: 8,
    name: "Al",
    email: "al@jpc.test",
    role: "STUDENT" as const,
    avatarPath: null,
    hasPassword: true,
  },
  scopes: { seasonAdminIds: [], groupLeaderIds: [], activeSeasonId: null, graduationYear: 2098 },
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  get.mockResolvedValue({ data: { data: { events: [listRow], total: 1, nextCursor: null } } });
});

describe("events screen", () => {
  it("shows SUPER the manager with a create form", async () => {
    useSessionStore.setState(superSession);
    post.mockResolvedValue({ data: { data: detailRow } });

    renderWithProviders(<EventsScreen />);

    expect(await screen.findByText("Summer retreat")).toBeTruthy();
    fireEvent.press(screen.getByText("New event"));
    fireEvent.changeText(screen.getByLabelText("Title"), "Graduation");
    const day = pickToday("Date");
    fireEvent.changeText(screen.getByLabelText("Time"), "18:30");
    fireEvent.press(within(screen.getByTestId("sheet-save-bar")).getByText("Create event"));

    // Wall-clock fields only — the device composes no instant and applies no
    // zone; the server does that in the org zone (ruling X13).
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/events", {
        title: "Graduation",
        day,
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
    pickToday("Date");
    fireEvent.changeText(screen.getByLabelText("Time"), "6pm");
    fireEvent.press(within(screen.getByTestId("sheet-save-bar")).getByText("Create event"));

    await waitFor(() => expect(post).not.toHaveBeenCalled());
    expect(screen.getByLabelText("Time").props.accessibilityHint).toContain("HH:mm");
    expect(within(screen.getByTestId("sheet-save-bar")).getByText("Fix the fields marked above.")).toBeTruthy();
  });

  it("shows a non-SUPER role the same list with no write controls", async () => {
    // Deep-linking here must not crash: /events is SUPER's sidebar entry, and
    // ALUMNI's "Events" points at /calendar (packages/shared/src/navigation.ts).
    useSessionStore.setState(alumnusSession);

    renderWithProviders(<EventsScreen />);

    expect(await screen.findByText("Summer retreat")).toBeTruthy();
    expect(screen.queryByText("New event")).toBeNull();
    expect(screen.queryByLabelText("New event")).toBeNull();
  });

  it("renders an empty state rather than nothing (spec 15 R75)", async () => {
    useSessionStore.setState(alumnusSession);
    get.mockResolvedValue({ data: { data: { events: [], total: 0, nextCursor: null } } });

    renderWithProviders(<EventsScreen />);
    expect(await screen.findByText("No upcoming events")).toBeTruthy();
  });

  it("pages newest first behind Load more, echoing the server's cursor", async () => {
    useSessionStore.setState(superSession);
    const older = { ...listRow, id: 2, title: "Spring fair" };
    get.mockImplementation((url: string) =>
      Promise.resolve({
        data: {
          data:
            url === "/api/v1/events?paged=true"
              ? { events: [listRow], total: 2, nextCursor: "4086000000000_3" }
              : { events: [older], total: 2, nextCursor: null },
        },
      }),
    );

    renderWithProviders(<EventsScreen />);
    expect(await screen.findByText("Summer retreat")).toBeTruthy();
    expect(screen.queryByText("Spring fair")).toBeNull();

    fireEvent.press(screen.getByText("Load more"));
    expect(await screen.findByText("Spring fair")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/events?paged=true&cursor=4086000000000_3");
    // The last page carries no cursor, so the button goes.
    await waitFor(() => expect(screen.queryByText("Load more")).toBeNull());
  });

  it("shows no Load more when the first page is the only one", async () => {
    useSessionStore.setState(superSession);
    renderWithProviders(<EventsScreen />);
    expect(await screen.findByText("Summer retreat")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/events?paged=true");
    expect(screen.queryByText("Load more")).toBeNull();
  });

  it("never truncates a row's date and time to one line", async () => {
    useSessionStore.setState(superSession);
    get.mockResolvedValue({
      data: { data: { events: [{ ...listRow, time: "18:30", endDayKey: null }], total: 1, nextCursor: null } },
    });
    renderWithProviders(<EventsScreen />);
    const when = await screen.findByText("Jul 1, 2099 · 6:30 PM");
    expect(when.props.numberOfLines === undefined || when.props.numberOfLines >= 2).toBe(true);
  });

  it("marks a past event and an alumni-only event with a worded chip", async () => {
    useSessionStore.setState(superSession);
    get.mockResolvedValue({
      data: {
        data: {
          events: [
            { ...listRow, id: 5, title: "Old fair", dayKey: "2001-03-01", endDayKey: null },
            { ...listRow, id: 6, title: "Alumni night", visibility: "ALUMNI_ONLY" as const },
          ],
          total: 2,
          nextCursor: null,
        },
      },
    });
    renderWithProviders(<EventsScreen />);
    expect(await screen.findByText("Past")).toBeTruthy();
    expect(screen.getByText("Alumni & staff")).toBeTruthy();
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

  it("edits from a sheet with the same body shape as create", async () => {
    useSessionStore.setState(superSession);
    get.mockResolvedValue({ data: { data: { ...detailRow, time: "18:30" } } });
    const patch = apiClient.patch as jest.Mock;
    patch.mockResolvedValue({ data: { data: detailRow } });

    renderWithProviders(<EventDetailScreen />);
    fireEvent.press(await screen.findByText("Edit"));
    fireEvent.changeText(screen.getByLabelText("Title"), "Summer camp");
    fireEvent.press(within(screen.getByTestId("sheet-save-bar")).getByText("Save changes"));

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/events/3", {
        title: "Summer camp",
        day: "2099-07-01",
        time: "18:30",
        endDay: "2099-07-05",
        description: "Five days away.",
        url: null,
        visibility: "ALL",
        seasonId: null,
      }),
    );
  });

  it("deletes behind a confirm, then dismisses to the list", async () => {
    useSessionStore.setState(superSession);
    get.mockResolvedValue({ data: { data: detailRow } });
    del.mockResolvedValue({ data: { data: { deleted: true } } });
    renderWithProviders(<EventDetailScreen />);

    fireEvent.press(await screen.findByText("Delete event"));
    expect(await screen.findByText("Delete event?")).toBeTruthy();
    expect(del).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText("Delete"));
    await waitFor(() => expect(del).toHaveBeenCalledWith("/api/v1/events/3"));
    await waitFor(() => expect(mockDismissTo).toHaveBeenCalledWith("/events"));
  });
});
