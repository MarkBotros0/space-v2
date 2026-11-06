import { act, fireEvent, screen } from "@testing-library/react-native";
import { Linking } from "react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn() },
}));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: (...args: unknown[]) => mockPush(...args) }),
}));

jest.mock("../design/layout/home-actions", () => {
  const { Text } = jest.requireActual("react-native");
  return { HomeActions: () => <Text testID="home-actions">home actions</Text> };
});

import { AlumniDashboard } from "../components/dashboard/AlumniDashboard";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import { EVENTS, event, get, requested, serve } from "./helpers/dashboard-fixtures";

const HISTORY = "/api/v1/me/season-history";
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)));

const row = (seasonId: number, title: string, groupName: string | null = "Group A") => ({
  seasonId,
  code: `season-${seasonId}`,
  outcome: "COMPLETED",
  title,
  startDate: "2025-01-05T00:00:00.000Z",
  endDate: "2025-03-20T00:00:00.000Z",
  groupName,
  attendancePct: 85,
  curriculum: [],
});

const gala = { ...event, id: 4, title: "Gala", url: "https://jpc.example/gala" };

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(
    makeSession("STUDENT", { graduationYear: 2025, activeSeasonId: 7 }, { name: "Aya Hassan" }),
  );
});
afterEach(settle);

describe("AlumniDashboard", () => {
  it("greets by first name with the class in the subtitle and never asks /me/dashboard", async () => {
    serve({ [EVENTS]: { events: [event], total: 1 }, [HISTORY]: { seasons: [] } });
    renderWithProviders(<AlumniDashboard />);
    expect(await screen.findByText("Hi, Aya")).toBeTruthy();
    expect(screen.getByText("Class of 2025")).toBeTruthy();
    await screen.findByText("No past seasons");
    expect(requested()).not.toContain("/api/v1/me/dashboard");
  });

  it("makes the first event the hero and lists the rest under Also coming up", async () => {
    serve({ [EVENTS]: { events: [event, gala], total: 2 }, [HISTORY]: { seasons: [] } });
    renderWithProviders(<AlumniDashboard />);
    expect(await screen.findByText("Next event")).toBeTruthy();
    expect(screen.getAllByText("Open day")).toHaveLength(1);
    expect(screen.getByText("ALSO COMING UP")).toBeTruthy();
    expect(screen.getByText("Gala")).toBeTruthy();
    expect(screen.getByText("View event")).toBeTruthy();
  });

  it("hero action pushes the event when it has no url", async () => {
    serve({ [EVENTS]: { events: [event], total: 1 }, [HISTORY]: { seasons: [] } });
    renderWithProviders(<AlumniDashboard />);
    fireEvent.press(await screen.findByText("View event"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/event/[id]", params: { id: "3" } });
    expect(screen.queryByText("ALSO COMING UP")).toBeNull();
  });

  it("hero action opens the link when the event has a url", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    serve({ [EVENTS]: { events: [gala], total: 1 }, [HISTORY]: { seasons: [] } });
    renderWithProviders(<AlumniDashboard />);
    fireEvent.press(await screen.findByText("Open link"));
    expect(openURL).toHaveBeenCalledWith("https://jpc.example/gala");
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("a row in Also coming up opens its link or pushes its page", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    const third = { ...event, id: 5, title: "Picnic" };
    serve({ [EVENTS]: { events: [event, gala, third], total: 3 }, [HISTORY]: { seasons: [] } });
    renderWithProviders(<AlumniDashboard />);
    fireEvent.press(await screen.findByText("Gala"));
    expect(openURL).toHaveBeenCalledWith("https://jpc.example/gala");
    fireEvent.press(screen.getByText("Picnic"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/event/[id]", params: { id: "5" } });
  });

  it("says so when there are no events and shows no hero", async () => {
    serve({ [EVENTS]: { events: [], total: 0 }, [HISTORY]: { seasons: [] } });
    renderWithProviders(<AlumniDashboard />);
    expect(await screen.findByText("No upcoming events")).toBeTruthy();
    expect(screen.queryByText("Next event")).toBeNull();
  });

  it("lists at most three past seasons with the attendance chip and opens history", async () => {
    serve({
      [EVENTS]: { events: [], total: 0 },
      [HISTORY]: {
        seasons: [row(1, "Season A"), row(2, "Season B", null), row(3, "Season C"), row(4, "Season D")],
      },
    });
    renderWithProviders(<AlumniDashboard />);
    expect(await screen.findByText("Season A")).toBeTruthy();
    expect(screen.getByText("YOUR HISTORY")).toBeTruthy();
    expect(screen.queryByText("Season D")).toBeNull();
    expect(screen.getAllByText("85% attended")).toHaveLength(3);
    expect(screen.getByLabelText("Season B, Jan 5, 2025 – Mar 20, 2025, 85% attended")).toBeTruthy();
    expect(screen.getByLabelText("Season A, Jan 5, 2025 – Mar 20, 2025 · Group A, 85% attended")).toBeTruthy();
    fireEvent.press(screen.getByText("Season A"));
    expect(mockPush).toHaveBeenLastCalledWith("/history");
    mockPush.mockClear();
    fireEvent.press(screen.getByText("View my history"));
    expect(mockPush).toHaveBeenCalledWith("/history");
  });

  it("keeps the events when the history request fails", async () => {
    get.mockImplementation((url: string) =>
      url === HISTORY
        ? Promise.reject(new Error("boom"))
        : Promise.resolve({ data: { data: { events: [event], total: 1 } } }),
    );
    renderWithProviders(<AlumniDashboard />);
    expect(await screen.findByText("Next event")).toBeTruthy();
    expect(await screen.findByText("Couldn't load your history.")).toBeTruthy();
  });

  it("shows the finished-season card above the rest, without the next-season line", async () => {
    serve({ [EVENTS]: { events: [event], total: 1 }, [HISTORY]: { seasons: [{ ...row(3, "GBV 2025"), outcome: "PASSED" }] } });
    renderWithProviders(<AlumniDashboard />);
    expect(await screen.findByText("GBV 2025 finished")).toBeTruthy();
    expect(screen.getByText("Passed - 85% attendance")).toBeTruthy();
    expect(screen.queryByText(/next season here/)).toBeNull();
    fireEvent.press(screen.getByText("View your season"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/past-season/[seasonId]", params: { seasonId: "3" } });
  });

  it("shows no finished card when the latest enrolment was a drop", async () => {
    serve({ [EVENTS]: { events: [event], total: 1 }, [HISTORY]: { seasons: [{ ...row(3, "GBV 2025"), outcome: "DROPPED" }] } });
    renderWithProviders(<AlumniDashboard />);
    await screen.findByText("Next event");
    expect(screen.queryByText("GBV 2025 finished")).toBeNull();
  });
});
