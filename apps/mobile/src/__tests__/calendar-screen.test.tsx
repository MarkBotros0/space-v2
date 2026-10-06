import { fireEvent, screen } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import CalendarScreen from "../../app/(app)/calendar";

const get = apiClient.get as jest.Mock;

const session = (id: number, title: string, startsAt: string, dayKey: string) => ({
  id, title, startsAt, dayKey, durationMinutes: 60, location: null, recurrenceGroupId: null,
  attendanceMarked: false, seasonId: 7, seasonCode: "S26", seasonTitle: "Spring 2026",
  checkInToken: null, checkInOpenAt: null, checkInClosedAt: null, startTime: "20:00",
});

const seasonRow = (id: number, year: number, status: "DRAFT" | "ACTIVE") => ({
  id, code: `S${id}`, title: `Season ${id}`, program: "TEST", year, status,
  startDate: `${year}-01-01T00:00:00.000Z`, endDate: `${year}-12-31T00:00:00.000Z`,
});

const studentSession = makeSession("STUDENT", { activeSeasonId: 7 }, { id: 9 });
const adminSession = makeSession("ADMIN", { seasonAdminIds: [7, 8] }, { id: 2 });

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

it("renders a student's calendar from their pinned season, grouped by the server's dayKey", async () => {
  useSessionStore.setState(studentSession);
  get.mockResolvedValue({
    data: { data: { sessions: [
      session(1, "Kickoff", "2099-03-01T18:00:00.000Z", "2099-03-01"),
      // 23:30Z on the 1st is 01:30 on the 2nd in Cairo: the server keyed it to
      // the 2nd. A device-zone grouping in UTC would put it under the 1st.
      session(2, "Late night", "2099-03-01T23:30:00.000Z", "2099-03-02"),
      session(3, "Week two", "2099-03-08T18:00:00.000Z", "2099-03-08"),
    ] } },
  });

  renderWithProviders(<CalendarScreen />);

  expect(await screen.findByText("Kickoff")).toBeTruthy();
  expect(screen.getByText("Mar 1, 2099")).toBeTruthy();
  expect(screen.getByText("Mar 2, 2099")).toBeTruthy();
  expect(screen.getByText("Mar 8, 2099")).toBeTruthy();
  // The student never fetched the seasons list — their season is pinned.
  expect(get).not.toHaveBeenCalledWith("/api/v1/seasons");
  expect(get).toHaveBeenCalledWith("/api/v1/seasons/7/sessions");
});

it("renders an admin's calendar from their first ACTIVE season — same route file", async () => {
  useSessionStore.setState(adminSession);
  get.mockImplementation((url: string) =>
    url === "/api/v1/seasons"
      ? Promise.resolve({
          // A NEWER non-ACTIVE season listed first: "newest" and "first ACTIVE"
          // disagree here, so the preference is actually exercised.
          data: { data: { seasons: [seasonRow(8, 2027, "DRAFT"), seasonRow(7, 2026, "ACTIVE")] } },
        })
      : Promise.resolve({
          data: { data: { sessions: [session(1, "Kickoff", "2099-03-01T18:00:00.000Z", "2099-03-01")] } },
        }),
  );

  renderWithProviders(<CalendarScreen />);

  expect(await screen.findByText("Kickoff")).toBeTruthy();
  expect(get).toHaveBeenCalledWith("/api/v1/seasons/7/sessions");
  expect(get).not.toHaveBeenCalledWith("/api/v1/seasons/8/sessions");
});

it("shows an empty state for a student with no season and fetches nothing", async () => {
  useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: null }, { id: 9 }));

  renderWithProviders(<CalendarScreen />);

  expect(await screen.findByText("No season to show")).toBeTruthy();
  expect(get).not.toHaveBeenCalled();
});

it("navigates to session detail on press", async () => {
  useSessionStore.setState(studentSession);
  get.mockResolvedValue({
    data: { data: { sessions: [session(1, "Kickoff", "2099-03-01T18:00:00.000Z", "2099-03-01")] } },
  });

  renderWithProviders(<CalendarScreen />);
  fireEvent.press(await screen.findByText("Kickoff"));

  expect(mockPush).toHaveBeenCalledWith({ pathname: "/session/[id]", params: { id: "1" } });
});
