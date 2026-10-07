import { fireEvent, screen } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import SeasonScreen from "../../app/(app)/season";

const get = apiClient.get as jest.Mock;

const mySeason = {
  id: 7,
  code: "gbv-2026",
  title: "GBV 2026",
  description: "The spring season.",
  status: "ACTIVE" as const,
  startDate: "2026-02-01T00:00:00.000Z",
  endDate: "2026-06-30T00:00:00.000Z",
  progress: { completedSessions: 3, totalSessions: 7, pct: 43 },
  group: {
    id: 4,
    name: "Group B1",
    description: "Tuesday group",
    leaders: [{ id: 5, name: "Lina Leader", email: "lina@jpc.test" }],
    members: [
      { id: 6, name: "Peer Person", isYou: false },
      { id: 9, name: "Test student", isYou: true },
    ],
  },
  upcoming: [
    { id: 41, title: "Week 4", startsAt: "2099-03-22T18:00:00.000Z", dayKey: "2099-03-22", location: "Hall B" },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("SeasonScreen — STUDENT branch (v1 student/season)", () => {
  it("renders the season, server-derived progress, the group with leaders, and the next sessions", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }));
    get.mockResolvedValue({ data: { data: { season: mySeason } } });

    renderWithProviders(<SeasonScreen />);

    expect(await screen.findByText("GBV 2026")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/me/season");
    // Neither the staff detail read nor the seasons list (spec 02 §5 over-fetch).
    expect(get).not.toHaveBeenCalledWith("/api/v1/seasons/7");
    expect(get).not.toHaveBeenCalledWith("/api/v1/seasons");
    expect(screen.getByText("Session 3 of 7")).toBeTruthy(); // R29, not "Week N of M"
    expect(screen.getByText("4 to go")).toBeTruthy();
    expect(screen.getByText("Your group")).toBeTruthy();
    expect(screen.getByText("Group B1")).toBeTruthy();
    expect(screen.getByText("Leader")).toBeTruthy();
    expect(screen.getByText("Lina Leader")).toBeTruthy();
    expect(screen.getByText("lina@jpc.test")).toBeTruthy(); // R89: leaders' emails, not peers'
    expect(screen.getByText("Members (2)")).toBeTruthy();
    expect(screen.getByText("Peer Person")).toBeTruthy();
    expect(screen.getByText("You")).toBeTruthy();
    expect(screen.getByText("The spring season.")).toBeTruthy();
    expect(screen.getByText("Week 4")).toBeTruthy();
    expect(screen.queryByText("Save changes")).toBeNull(); // no staff edit
  });

  it("opens an upcoming session and the calendar", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }));
    get.mockResolvedValue({ data: { data: { season: mySeason } } });

    renderWithProviders(<SeasonScreen />);

    fireEvent.press(await screen.findByText("Week 4"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/session/[id]", params: { id: "41" } });
    fireEvent.press(screen.getByText("See calendar"));
    expect(mockPush).toHaveBeenCalledWith("/calendar");
  });

  it("omits the group card without a group and says when nothing is upcoming", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }));
    get.mockResolvedValue({ data: { data: { season: { ...mySeason, group: null, upcoming: [] } } } });

    renderWithProviders(<SeasonScreen />);

    expect(await screen.findByText("No upcoming sessions.")).toBeTruthy();
    expect(screen.queryByText("Your group")).toBeNull();
  });

  it("shows the no-season state without a request when the student has no active season (R28)", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: null }));

    renderWithProviders(<SeasonScreen />);

    expect(await screen.findByText("No active season")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });

  it("shows the same state when the server answers null (deleted season — spec 02 D2)", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }));
    get.mockResolvedValue({ data: { data: { season: null } } });

    renderWithProviders(<SeasonScreen />);

    expect(await screen.findByText("No active season")).toBeTruthy();
  });
});
