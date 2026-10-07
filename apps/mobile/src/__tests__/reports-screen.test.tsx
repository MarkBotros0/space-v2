// apps/mobile/src/__tests__/reports-screen.test.tsx
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

import ReportsScreen from "../../app/(app)/reports";

const get = apiClient.get as jest.Mock;

const emptyScopes = {
  seasonAdminIds: [] as number[],
  groupLeaderIds: [] as number[],
  activeSeasonId: null as number | null,
  graduationYear: null as number | null,
};
const sessionFor = (role: "SUPER" | "MENTOR" | "ADMIN" | "LEADER" | "STUDENT") => ({
  user: { id: 1, name: `Test ${role}`, email: `${role}@jpc.test`, role, avatarPath: null, hasPassword: true },
  scopes: emptyScopes,
});

const row = {
  score: 40,
  attendancePct: 50,
  submissionPct: 30,
  attendanceTotal: 8,
  attendancePresent: 4,
  submissionsExpected: 10,
  submissionsCompleted: 3,
  studentUserId: 21,
  name: "Sara Student",
  email: "sara@jpc.test",
  seasonId: 7,
  seasonTitle: "Spring 2099",
  band: "AT_RISK" as const,
};

const summary = {
  scope: {
    seasonIds: [7, 8],
    seasons: [
      { id: 7, code: "spring-2099", title: "Spring 2099" },
      { id: 8, code: "autumn-2099", title: "Autumn 2099" },
    ],
    truncated: false,
    label: "All seasons",
  },
  attendanceTrend: [
    {
      sessionId: 1,
      seasonId: 7,
      seasonTitle: "Spring 2099",
      title: "Opening",
      startsAt: "2099-03-01T18:00:00.000Z",
      dayKey: "2099-03-01",
      presentCount: 8,
      expectedCount: 10,
      pct: 80,
    },
    {
      sessionId: 2,
      seasonId: 7,
      seasonTitle: "Spring 2099",
      title: "Week two",
      startsAt: "2099-03-08T18:00:00.000Z",
      dayKey: "2099-03-08",
      presentCount: 5,
      expectedCount: 10,
      pct: 50,
    },
  ],
  completion: [
    {
      assignmentId: 3,
      seasonId: 7,
      title: "Reflection one",
      targeting: "targeted" as const,
      completed: 4,
      expected: 8,
      completionRate: 50,
    },
    {
      assignmentId: 4,
      seasonId: 7,
      title: "Targeted at nobody",
      targeting: "targeted" as const,
      completed: 0,
      expected: 0,
      completionRate: null,
    },
  ],
  bands: [
    { band: "HIGH" as const, count: 3 },
    { band: "MEDIUM" as const, count: 5 },
    { band: "LOW" as const, count: 2 },
    { band: "AT_RISK" as const, count: 34 },
  ],
  atRisk: [row],
  atRiskTotal: 34,
  cohortSize: 40,
  enrollmentCount: 44,
  generatedAt: "2099-03-10T00:00:00.000Z",
  exportDay: "2099-03-10",
};

const organisation = {
  totalStudentsNotGraduated: 40,
  totalAlumni: 12,
  activeSeasonCount: 2,
  seasons: [
    {
      seasonId: 7,
      code: "spring-2099",
      program: "GBV",
      year: 2099,
      title: "Spring 2099",
      status: "ACTIVE" as const,
      activeCount: 20,
      completedCount: 3,
      withdrawnCount: 1,
      leaderCount: 2,
    },
  ],
  alumniByYear: [{ year: 2098, count: 12 }],
  generatedAt: "2099-03-10T00:00:00.000Z",
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

/** Answer whichever endpoints a given branch calls. */
function mockEndpoints({ withOrg = false }: { withOrg?: boolean } = {}) {
  get.mockImplementation((url: string) => {
    if (url.startsWith("/api/v1/reports/organisation")) {
      return Promise.resolve({ data: { data: organisation } });
    }
    if (url.startsWith("/api/v1/reports/engagement/students")) {
      return Promise.resolve({
        data: { data: { scope: summary.scope, rows: [row], nextCursor: null, total: 34 } },
      });
    }
    if (url.startsWith("/api/v1/reports/engagement")) {
      return Promise.resolve({ data: { data: summary } });
    }
    return Promise.reject(new Error(`unexpected ${url}`));
  });
  return withOrg;
}

describe("ReportsScreen — role branches", () => {
  it("shows a LEADER nothing and issues no request (R109)", async () => {
    useSessionStore.setState(sessionFor("LEADER"));
    mockEndpoints();

    renderWithProviders(<ReportsScreen />);

    expect(await screen.findByText("Reports")).toBeTruthy();
    // The API refuses leaders explicitly. A query that fires only to be refused
    // surfaces as an error state on a screen that should simply say the surface
    // is not theirs.
    expect(get).not.toHaveBeenCalled();
  });

  it("shows a STUDENT nothing and issues no request (R110)", async () => {
    useSessionStore.setState(sessionFor("STUDENT"));
    mockEndpoints();
    renderWithProviders(<ReportsScreen />);
    expect(await screen.findByText("Reports")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });

  it("gives a MENTOR the engagement report and NOT the organisation roll-up", async () => {
    useSessionStore.setState(sessionFor("MENTOR"));
    mockEndpoints();

    renderWithProviders(<ReportsScreen />);

    expect(await screen.findByText("Sara Student")).toBeTruthy();
    const urls = get.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.startsWith("/api/v1/reports/engagement"))).toBe(true);
    // /reports/organisation is SUPER-only; asking for it as a mentor earns a
    // 403 and an error card for a section that is not theirs.
    expect(urls.some((u) => u.includes("organisation"))).toBe(false);
  });

  it("gives SUPER both the roll-up and the engagement view (spec D17)", async () => {
    useSessionStore.setState(sessionFor("SUPER"));
    mockEndpoints({ withOrg: true });

    renderWithProviders(<ReportsScreen />);

    // v1 gates /mentor/reports to MENTOR only, so SUPER cannot open the
    // cross-season engagement screen at all (R106) — while the CSV route hands
    // them exactly that data (R45).
    expect(await screen.findByText("Sara Student")).toBeTruthy();
    expect(screen.getByText("Student accounts")).toBeTruthy();
    expect(screen.getByText("40")).toBeTruthy();
  });
});

describe("ReportsScreen — the at-risk card comes first and tells the truth", () => {
  it('renders "1 of 34" so the cap is visible (spec D16, R33)', async () => {
    useSessionStore.setState(sessionFor("MENTOR"));
    mockEndpoints();

    renderWithProviders(<ReportsScreen />);

    // v1 sliced to ten and said nothing, so a reader could not tell whether ten
    // was all of them.
    expect(await screen.findByText("Students at risk (1 of 34)")).toBeTruthy();
  });

  it("navigates to the student on press", async () => {
    useSessionStore.setState(sessionFor("MENTOR"));
    mockEndpoints();

    renderWithProviders(<ReportsScreen />);
    fireEvent.press(await screen.findByText("Sara Student"));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/student/[id]",
      params: { id: "21" },
    });
  });

  it("pages more at-risk rows inline rather than pushing a second route", async () => {
    useSessionStore.setState(sessionFor("MENTOR"));
    mockEndpoints();

    renderWithProviders(<ReportsScreen />);
    fireEvent.press(await screen.findByText("Show more"));

    await waitFor(() => {
      const urls = get.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes("/reports/engagement/students"))).toBe(true);
      expect(urls.some((u) => u.includes("band=AT_RISK"))).toBe(true);
    });
  });
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
    expect(screen.getByText("50% attendance · 100% submissions")).toBeTruthy();
  });

  it("labels the band donut by enrolments when the scope spans seasons (R32)", async () => {
    useSessionStore.setState(sessionFor("MENTOR"));
    mockEndpoints();

    renderWithProviders(<ReportsScreen />);

    // Bucket counts count ENROLMENTS, so the total exceeds the headcount and a
    // reader comparing the donut to "40 students" is looking at two numbers.
    expect(await screen.findByText("44 enrolments · 40 students")).toBeTruthy();
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
