// apps/mobile/src/__tests__/reports-screen-numbers.test.tsx
import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn() },
}));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));
// Task 9's module reaches native file/share APIs that do not exist under Jest.
// The screen only needs it to render a button.
jest.mock("../components/ExportMenu", () => ({
  ExportMenu: () => null,
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";

import ReportsScreen from "../../app/(app)/(tabs)/reports";

import { mockEndpoints, row, sessionFor, summary } from "./helpers/reports-fixtures";

const get = apiClient.get as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("ReportsScreen — the numbers it renders", () => {
  it("takes the band from the contract, never from a local threshold (C4)", async () => {
    useSessionStore.setState(sessionFor("MENTOR"));
    get.mockImplementation((url: string) => {
      if (url.startsWith("/api/v1/reports/engagement/students")) {
        return Promise.resolve({
          data: { data: { scope: summary.scope, rows: [], nextCursor: null, total: 0 } },
        });
      }
      // Composite 75 — "Medium" if the client re-derived it — with attendance
      // at 50. The server says AT_RISK (either component under 60) and the
      // client must render what it is given.
      return Promise.resolve({
        data: {
          data: {
            ...summary,
            atRisk: [{ ...row, score: 75, attendancePct: 50, submissionPct: 100, band: "AT_RISK" }],
            atRiskTotal: 1,
          },
        },
      });
    });

    renderWithProviders(<ReportsScreen />);

    expect(await screen.findByText("Students at risk (1 of 1)")).toBeTruthy();
    expect(screen.getByText(/50% attendance · 100% submissions/)).toBeTruthy();
  });

  it("shows enrolments and students side by side when the scope spans seasons (R32)", async () => {
    useSessionStore.setState(sessionFor("MENTOR"));
    mockEndpoints();

    renderWithProviders(<ReportsScreen />);

    // Bucket counts count ENROLMENTS, so the total exceeds the headcount and a
    // reader comparing the donut to "40 students" is looking at two numbers.
    expect(await screen.findByText("Enrolments")).toBeTruthy();
    expect(screen.getByLabelText(/Enrolments.*44|44.*Enrolments/)).toBeTruthy();
    expect(screen.getByLabelText(/Students.*40|40.*Students/)).toBeTruthy();
  });

  it("renders a completion row with no cohort as — rather than 0% (R22)", async () => {
    useSessionStore.setState(sessionFor("MENTOR"));
    mockEndpoints();

    renderWithProviders(<ReportsScreen />);

    expect(await screen.findByText("Reflection one")).toBeTruthy();
    expect(screen.getByLabelText("Targeted at nobody: no students targeted")).toBeTruthy();
  });

  it("describes the trend for a screen reader from the served values", async () => {
    useSessionStore.setState(sessionFor("MENTOR"));
    mockEndpoints();

    renderWithProviders(<ReportsScreen />);

    expect(
      await screen.findByLabelText("Attendance trend, 2 sessions, from 80% to 50%"),
    ).toBeTruthy();
  });

  it("draws one line per season instead of one interleaved line (REG-117)", async () => {
    useSessionStore.setState(sessionFor("MENTOR"));
    const [first, second] = summary.attendanceTrend;
    const interleaved = {
      ...summary,
      attendanceTrend: [
        first!,
        { ...second!, seasonId: 8, seasonTitle: "Autumn 2099" },
        { ...first!, sessionId: 3, dayKey: "2099-09-01", pct: 60 },
        {
          ...second!,
          sessionId: 4,
          seasonId: 8,
          seasonTitle: "Autumn 2099",
          dayKey: "2099-09-08",
          pct: 40,
        },
      ],
    };
    get.mockImplementation((url: string) => {
      if (url.startsWith("/api/v1/reports/engagement/students")) {
        return Promise.resolve({
          data: { data: { scope: summary.scope, rows: [row], nextCursor: null, total: 34 } },
        });
      }
      if (url.startsWith("/api/v1/reports/engagement"))
        return Promise.resolve({ data: { data: interleaved } });
      return Promise.reject(new Error(`unexpected ${url}`));
    });

    renderWithProviders(<ReportsScreen />);

    expect(
      await screen.findByLabelText(
        "Attendance trend, 2 seasons. Spring 2099: 2 sessions, from 80% to 60%. Autumn 2099: 2 sessions, from 50% to 40%",
      ),
    ).toBeTruthy();
    expect(screen.getByText("● Spring 2099")).toBeTruthy();
    expect(screen.getByText("● Autumn 2099")).toBeTruthy();
  });

  it("shows the method note, from the shared constant", async () => {
    useSessionStore.setState(sessionFor("MENTOR"));
    mockEndpoints();

    renderWithProviders(<ReportsScreen />);

    expect(await screen.findByText("How these numbers are calculated")).toBeTruthy();
    expect(
      screen.getByText(/Submission % counts only assignments assigned to that student/),
    ).toBeTruthy();
  });

  it("warns when the requested scope was narrowed", async () => {
    useSessionStore.setState(sessionFor("ADMIN"));
    get.mockResolvedValue({
      data: { data: { ...summary, scope: { ...summary.scope, truncated: true } } },
    });

    renderWithProviders(<ReportsScreen />);

    expect(
      await screen.findByText("Some seasons you asked for aren't in your scope."),
    ).toBeTruthy();
  });

  it("maps an error to ErrorState with a working retry", async () => {
    useSessionStore.setState(sessionFor("MENTOR"));
    get.mockRejectedValue(new Error("boom"));

    renderWithProviders(<ReportsScreen />);

    fireEvent.press(await screen.findByText("Try again"));
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(1));
  });

  it("shows an empty state when the scope has no data", async () => {
    useSessionStore.setState(sessionFor("ADMIN"));
    get.mockResolvedValue({
      data: {
        data: {
          ...summary,
          scope: { seasonIds: [], seasons: [], truncated: false, label: "No seasons" },
          attendanceTrend: [],
          completion: [],
          bands: [
            { band: "HIGH", count: 0 },
            { band: "MEDIUM", count: 0 },
            { band: "LOW", count: 0 },
            { band: "AT_RISK", count: 0 },
          ],
          atRisk: [],
          atRiskTotal: 0,
          cohortSize: 0,
          enrollmentCount: 0,
        },
      },
    });

    renderWithProviders(<ReportsScreen />);

    expect(await screen.findByText("No data in this scope")).toBeTruthy();
  });
});

describe("ReportsScreen — the season picker", () => {
  it("seeds itself from the scope the API returned, not from a second request", async () => {
    useSessionStore.setState(sessionFor("SUPER"));
    mockEndpoints({ withOrg: true });

    renderWithProviders(<ReportsScreen />);

    // By accessibility label, not text: "Spring 2099" is also the at-risk row's
    // season caption and a chart label, and "All seasons" is also the scope
    // caption, so getByText would throw on multiple matches.
    expect(await screen.findByLabelText("Season filter: All seasons")).toBeTruthy();
    expect(screen.getByLabelText("Season filter: Spring 2099")).toBeTruthy();
    // The permitted set is already on scope.seasons; asking GET /seasons again
    // would be a second round trip for data the first response carried.
    expect(get.mock.calls.map((c) => String(c[0]))).not.toContain("/api/v1/seasons");
  });

  it("refetches scoped to one season on press", async () => {
    useSessionStore.setState(sessionFor("SUPER"));
    mockEndpoints({ withOrg: true });

    renderWithProviders(<ReportsScreen />);
    fireEvent.press(await screen.findByLabelText("Season filter: Autumn 2099"));

    await waitFor(() => {
      const urls = get.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes("seasonId=8"))).toBe(true);
    });
  });
});
