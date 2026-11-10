// apps/mobile/src/__tests__/reports-screen-numbers.test.tsx
import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn() },
}));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));
// Task 9's module reaches native file/share APIs that do not exist under Jest.
// The screen only needs it to render a button.
jest.mock("../screens/reports/export-menu", () => ({
  ExportMenu: () => null,
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";

import ReportsScreen from "../../app/(app)/reports";

import { mockEndpoints, row, sessionFor, summary } from "./helpers/reports-fixtures";

const get = apiClient.get as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("ReportsScreen — the numbers it renders", () => {
  it("takes the band from the contract, never from a local threshold (C4)", async () => {
    useSessionStore.setState(sessionFor("ADMIN"));
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

    expect(await screen.findByText("STUDENTS AT RISK (1 OF 1)")).toBeTruthy();
    expect(screen.getByText(/50% attendance · 100% submissions/)).toBeTruthy();
  });

  it("shows enrolments and students side by side when the scope spans seasons (R32)", async () => {
    useSessionStore.setState(sessionFor("ADMIN"));
    mockEndpoints();

    renderWithProviders(<ReportsScreen />);

    // Bucket counts count ENROLMENTS, so the total exceeds the headcount and a
    // reader comparing the donut to "40 students" is looking at two numbers.
    expect(await screen.findByText("Enrolments")).toBeTruthy();
    expect(screen.getByLabelText(/Enrolments.*44|44.*Enrolments/)).toBeTruthy();
    expect(screen.getByLabelText(/Students.*40|40.*Students/)).toBeTruthy();
  });

  it("renders a completion row with no cohort as — rather than 0% (R22)", async () => {
    useSessionStore.setState(sessionFor("ADMIN"));
    mockEndpoints();

    renderWithProviders(<ReportsScreen />);

    expect(await screen.findByText("Reflection one")).toBeTruthy();
    expect(screen.getByLabelText("Nobody expected: no students in the season")).toBeTruthy();
  });

  it("describes the trend for a screen reader from the served values", async () => {
    useSessionStore.setState(sessionFor("ADMIN"));
    mockEndpoints();

    renderWithProviders(<ReportsScreen />);

    expect(await screen.findByLabelText("Attendance trend, 2 sessions, from 80% to 50%")).toBeTruthy();
  });

  it("draws one line per season instead of one interleaved line (REG-117)", async () => {
    useSessionStore.setState(sessionFor("ADMIN"));
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
      if (url.startsWith("/api/v1/reports/engagement")) return Promise.resolve({ data: { data: interleaved } });
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
    useSessionStore.setState(sessionFor("ADMIN"));
    mockEndpoints();

    renderWithProviders(<ReportsScreen />);

    // The notes are folded away until asked for.
    fireEvent.press(await screen.findByText("How are these calculated?"));
    expect(
      screen.getByText(/Submission % counts the assignments of the student's season that they have submitted/),
    ).toBeTruthy();
  });

  it("warns when the requested scope was narrowed", async () => {
    useSessionStore.setState(sessionFor("ADMIN"));
    get.mockResolvedValue({
      data: { data: { ...summary, scope: { ...summary.scope, truncated: true } } },
    });

    renderWithProviders(<ReportsScreen />);

    expect(await screen.findByText("Some seasons you asked for aren't in your scope.")).toBeTruthy();
  });

  it("maps an error to ErrorState with a working retry", async () => {
    useSessionStore.setState(sessionFor("ADMIN"));
    get.mockRejectedValue(new Error("boom"));

    renderWithProviders(<ReportsScreen />);

    fireEvent.press(await screen.findByText("Try again"));
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(1));
  });

  it("says there are no seasons when the scope has none", async () => {
    useSessionStore.setState(sessionFor("ADMIN"));
    get.mockResolvedValue({
      data: {
        data: {
          ...summary,
          scope: { seasonIds: [], seasons: [], truncated: false, label: "No seasons" },
        },
      },
    });

    renderWithProviders(<ReportsScreen />);

    expect(await screen.findByText("No seasons yet")).toBeTruthy();
  });

  it("shows an empty state when the season has no data", async () => {
    useSessionStore.setState(sessionFor("ADMIN"));
    get.mockResolvedValue({
      data: {
        data: {
          ...summary,
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

    expect(await screen.findByText("Nothing to report yet")).toBeTruthy();
  });
});

describe("ReportsScreen — the season header and History", () => {
  const seasonIdOf = (u: string) => new URLSearchParams(u.split("?")[1] ?? "").get("seasonId");

  it("opens on the active season, asking unscoped first and then for that season", async () => {
    useSessionStore.setState(sessionFor("SUPER"));
    mockEndpoints({ withOrg: true });

    renderWithProviders(<ReportsScreen />);

    const header = await screen.findByTestId("report-season");
    expect(within(header).getByText("Spring 2099")).toBeTruthy();
    expect(within(header).getByText("Running now")).toBeTruthy();
    await waitFor(() => {
      const urls = get.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => seasonIdOf(u) === "7")).toBe(true);
    });
    // The permitted set came from the first response: no GET /seasons round trip.
    expect(get.mock.calls.map((c) => String(c[0]))).not.toContain("/api/v1/seasons");
  });

  it("opens on the season that ended last when none is running", async () => {
    useSessionStore.setState(sessionFor("ADMIN"));
    const ended = (id: number, title: string, endDate: string) => ({
      id,
      code: `s${id}`,
      title,
      status: "COMPLETED" as const,
      endDate,
    });
    const scope = {
      ...summary.scope,
      seasons: [
        ended(8, "Autumn 2098", "2098-12-20T00:00:00.000Z"),
        ended(9, "Spring 2098", "2098-06-30T00:00:00.000Z"),
      ],
    };
    get.mockImplementation((url: string) =>
      Promise.resolve({
        data: {
          data: url.includes("engagement/students")
            ? { scope, rows: [], nextCursor: null, total: 0 }
            : { ...summary, scope },
        },
      }),
    );

    renderWithProviders(<ReportsScreen />);

    const header = await screen.findByTestId("report-season");
    expect(within(header).getByText("Autumn 2098")).toBeTruthy();
    expect(within(header).getByText("Ended Dec 20, 2098")).toBeTruthy();
  });

  it("lists current then past seasons in History and refetches scoped to the one picked", async () => {
    useSessionStore.setState(sessionFor("ADMIN"));
    mockEndpoints();

    renderWithProviders(<ReportsScreen />);
    fireEvent.press(await screen.findByLabelText("Choose another season"));

    expect(await screen.findByText("CURRENT")).toBeTruthy();
    expect(screen.getByText("PAST SEASONS")).toBeTruthy();
    // An admin has no All seasons.
    expect(screen.queryByText("All seasons")).toBeNull();
    fireEvent.press(screen.getByText("Autumn 2098"));

    await waitFor(() => {
      const urls = get.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => seasonIdOf(u) === "8")).toBe(true);
    });
    expect(within(await screen.findByTestId("report-season")).getByText("Autumn 2098")).toBeTruthy();
  });

  it("offers All seasons in History to SUPER", async () => {
    useSessionStore.setState(sessionFor("SUPER"));
    mockEndpoints({ withOrg: true });

    renderWithProviders(<ReportsScreen />);
    fireEvent.press(await screen.findByLabelText("Choose another season"));
    fireEvent.press(await screen.findByText("All seasons"));

    expect(await within(screen.getByTestId("report-season")).findByText("Every season together (2)")).toBeTruthy();
  });
});
