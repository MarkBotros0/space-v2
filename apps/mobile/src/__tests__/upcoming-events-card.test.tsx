import { fireEvent, screen } from "@testing-library/react-native";
import { Linking } from "react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn() },
}));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: (...args: unknown[]) => mockPush(...args) }),
}));

import { apiClient } from "../lib/api-client";
import { UpcomingEventsCard } from "../components/dashboard/UpcomingEventsCard";
import { useUpcomingEvents } from "../hooks/use-events";
import { renderWithProviders } from "./helpers/render";

const get = apiClient.get as jest.Mock;

const event = {
  id: 3,
  title: "Open day",
  date: "2099-03-05T16:30:00.000Z",
  endDate: null,
  dayKey: "2099-03-05",
  endDayKey: null,
  time: "18:30",
  allDay: false,
  url: null,
  visibility: "ALL",
  seasonId: null,
  seasonCode: null,
};

function Harness() {
  return <UpcomingEventsCard query={useUpcomingEvents(4)} />;
}

beforeEach(() => jest.clearAllMocks());

describe("UpcomingEventsCard (spec 19 R5–R11, D19)", () => {
  it("reads today-onwards, capped at four, from the server", async () => {
    get.mockResolvedValue({ data: { data: { events: [event], total: 1 } } });
    renderWithProviders(<Harness />);
    expect(await screen.findByText("Open day")).toBeTruthy();
    expect(screen.getByText("Mar 5, 2099 · 6:30 PM")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/events?upcoming=true&limit=4");
  });

  it("renders an EmptyState, not nothing, when no event qualifies (v1 R10)", async () => {
    get.mockResolvedValue({ data: { data: { events: [], total: 0 } } });
    renderWithProviders(<Harness />);
    expect(await screen.findByText("No upcoming events")).toBeTruthy();
  });

  it("opens the event detail, or the external link when the event has one", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    get.mockResolvedValue({
      data: { data: { events: [event, { ...event, id: 4, title: "Gala", url: "https://jpc.example/gala" }], total: 2 } },
    });
    renderWithProviders(<Harness />);

    fireEvent.press(await screen.findByLabelText("Open day, Mar 5, 2099 · 6:30 PM"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/event/[id]", params: { id: "3" } });

    fireEvent.press(screen.getByLabelText("Gala, Mar 5, 2099 · 6:30 PM"));
    expect(openURL).toHaveBeenCalledWith("https://jpc.example/gala");
  });

  it("fails on its own with a retry", async () => {
    get.mockRejectedValueOnce(new Error("down"));
    renderWithProviders(<Harness />);
    expect(await screen.findByText("Couldn't load upcoming events.")).toBeTruthy();
    get.mockResolvedValueOnce({ data: { data: { events: [event], total: 1 } } });
    fireEvent.press(screen.getByText("Try again"));
    expect(await screen.findByText("Open day")).toBeTruthy();
  });
});
