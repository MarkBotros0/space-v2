// Reports for ADMIN and SUPER: Screen frame, tiles and grouped rows. The
// mentor's own page is pinned by mentor-reports.test.tsx.
import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";

const mockDownloadAndShare = jest.fn();
jest.mock("../lib/export-download", () => ({
  downloadAndShare: (...a: unknown[]) => mockDownloadAndShare(...a),
  ExportShareUnavailableError: class extends Error {},
}));
jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), defaults: { baseURL: "http://localhost:4000" } },
}));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";

import ReportsScreen from "../../app/(app)/(tabs)/reports";

import {
  emptyScopes,
  mockEndpoints,
  organisation,
  sessionFor,
  summary,
} from "./helpers/reports-fixtures";

const get = apiClient.get as jest.Mock;

/** An ADMIN who serves season 7 only: season 8 in History is past, not theirs. */
const adminOf7 = () => ({
  ...sessionFor("ADMIN"),
  scopes: { ...emptyScopes, seasonAdminIds: [7] },
});

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  mockDownloadAndShare.mockResolvedValue(undefined);
});

describe("ReportsScreen for admin and super — frame and export", () => {
  it("titles the Screen, shows the season header, and opens the export sheet from the title row", async () => {
    useSessionStore.setState(sessionFor("ADMIN"));
    mockEndpoints();
    renderWithProviders(<ReportsScreen />);

    expect(await screen.findByTestId("report-season")).toBeTruthy();
    expect(screen.getAllByText("Reports").length).toBeGreaterThan(0);
    // The two buttons moved into a sheet; nothing is offered inline any more.
    expect(screen.queryByText("Export engagement")).toBeNull();

    // Export appears once the opening season's summary has loaded, after the header.
    fireEvent.press(await screen.findByLabelText("Export"));
    fireEvent.press(await screen.findByText("Export engagement"));

    await waitFor(() =>
      expect(mockDownloadAndShare).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "/api/v1/reports/engagement/export?seasonId=7",
          filename: "engagement-all-seasons-2099-03-10.xlsx",
        }),
      ),
    );
  });

  it("offers no History when the caller has one season, and names it in the header (sweep F6)", async () => {
    useSessionStore.setState(sessionFor("ADMIN"));
    mockEndpoints();
    const one = {
      id: 7,
      code: "gbv-2026",
      title: "GBV 2026",
      status: "ACTIVE" as const,
      endDate: "2026-12-31T00:00:00.000Z",
    };
    const base = get.getMockImplementation() as (url: string) => Promise<unknown>;
    get.mockImplementation((url: string) =>
      url.startsWith("/api/v1/reports/engagement") && !url.includes("/students")
        ? Promise.resolve({
            data: {
              data: {
                ...summary,
                scope: { ...summary.scope, seasonIds: [7], seasons: [one], label: "GBV 2026" },
              },
            },
          })
        : base(url),
    );
    renderWithProviders(<ReportsScreen />);

    expect(await within(await screen.findByTestId("report-season")).findByText("GBV 2026")).toBeTruthy();
    expect(screen.queryByLabelText("Choose another season")).toBeNull();
  });

  it("labels the engagement donut with a legend of each band's name and count, not colour alone (sweep F7)", async () => {
    useSessionStore.setState(sessionFor("ADMIN"));
    mockEndpoints();
    renderWithProviders(<ReportsScreen />);

    const legend = await screen.findByTestId("band-legend");
    for (const text of ["High 3", "Medium 5", "Low 2", "At risk 34"]) {
      expect(within(legend).getByText(text)).toBeTruthy();
    }
  });

  it("reads a one-point attendance trend as a single date, not a range from a date to itself (sweep F7)", async () => {
    useSessionStore.setState(sessionFor("ADMIN"));
    mockEndpoints();
    const base = get.getMockImplementation() as (url: string) => Promise<unknown>;
    get.mockImplementation((url: string) =>
      url.startsWith("/api/v1/reports/engagement") && !url.includes("/students")
        ? Promise.resolve({
            data: { data: { ...summary, attendanceTrend: [summary.attendanceTrend[0]!] } },
          })
        : base(url),
    );
    renderWithProviders(<ReportsScreen />);

    expect(await screen.findByText("Mar 1, 2099")).toBeTruthy();
    expect(screen.queryByText("Mar 1, 2099 – Mar 1, 2099")).toBeNull();
    // A lone point is a caption, not a dot on a bare axis.
    expect(screen.getByText("One session so far: the trend starts after the next one.")).toBeTruthy();
    expect(screen.queryByLabelText(/^Attendance trend, 1 session/)).toBeNull();
  });

  it("gives a mentor the same Export sheet, with the engagement file only", async () => {
    useSessionStore.setState(sessionFor("MENTOR"));
    mockEndpoints();
    renderWithProviders(<ReportsScreen />);
    fireEvent.press(await screen.findByLabelText("Export"));
    expect(await screen.findByText("Export engagement")).toBeTruthy();
    expect(screen.queryByText(/Export season workbook/)).toBeNull();
  });
});

describe("ReportsScreen for admin — at-risk rows and engagement tiles", () => {
  it("draws the at-risk list as a grouped row with the season and both percentages", async () => {
    useSessionStore.setState(adminOf7());
    mockEndpoints();
    renderWithProviders(<ReportsScreen />);

    expect(await screen.findByText("STUDENTS AT RISK (1 OF 34)")).toBeTruthy();
    expect(screen.getByText("Sara Student").props.numberOfLines).toBe(2);
    expect(screen.getByText("Spring 2099 · 50% attendance · 30% submissions")).toBeTruthy();
    expect(screen.getByTestId("list-row-chevron", { includeHiddenElements: true })).toBeTruthy();
    fireEvent.press(screen.getByLabelText(/^Sara Student/));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/student/[id]", params: { id: "21" } });
    expect(screen.getByText("Show more")).toBeTruthy();
  });

  it("does not open the student of a season the admin no longer serves", async () => {
    useSessionStore.setState(sessionFor("ADMIN"));
    mockEndpoints();
    renderWithProviders(<ReportsScreen />);

    expect(await screen.findByText("Sara Student")).toBeTruthy();
    expect(screen.queryByTestId("list-row-chevron", { includeHiddenElements: true })).toBeNull();
    fireEvent.press(screen.getByText("Sara Student"));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("a failed Show more says so under the list and Try again asks again (final review I4)", async () => {
    useSessionStore.setState(sessionFor("ADMIN"));
    mockEndpoints();
    const base = get.getMockImplementation() as (url: string) => Promise<unknown>;
    let failing = true;
    get.mockImplementation((url: string) =>
      url.startsWith("/api/v1/reports/engagement/students") && failing
        ? Promise.reject(new Error("offline"))
        : base(url),
    );
    renderWithProviders(<ReportsScreen />);

    fireEvent.press(await screen.findByText("Show more"));
    expect(await screen.findByText("Couldn't load more students.")).toBeTruthy();
    expect(screen.getByText("STUDENTS AT RISK (1 OF 34)")).toBeTruthy();

    failing = false;
    fireEvent.press(screen.getByText("Try again"));
    await waitFor(() => expect(screen.queryByText("Couldn't load more students.")).toBeNull(), { timeout: 5000 });
  });

  it("shows the figures in one card: students, enrolments and at risk", async () => {
    useSessionStore.setState(sessionFor("ADMIN"));
    mockEndpoints();
    renderWithProviders(<ReportsScreen />);

    const tiles = await screen.findByTestId("engagement-tiles");
    for (const [label, value] of [
      ["Students", "40"],
      ["Enrolments", "44"],
      ["At risk", "34"],
    ] as const) {
      const figure = within(tiles).getByLabelText(`${label}: ${value}`);
      const number = within(figure).getByText(value);
      expect(number.props.numberOfLines).toBe(1);
    }
    // The bands are the donut's legend now, not tiles.
    expect(screen.queryByLabelText("High engagement: 3")).toBeNull();
    expect(screen.queryByText("44 enrolments · 40 students")).toBeNull();
  });

  it("still carries the trend range, completion bars and the method note", async () => {
    useSessionStore.setState(sessionFor("ADMIN"));
    mockEndpoints();
    renderWithProviders(<ReportsScreen />);

    expect(await screen.findByText("Reflection one")).toBeTruthy();
    expect(screen.getByText("Assignment completion")).toBeTruthy();
    expect(screen.getByText("How are these calculated?")).toBeTruthy();
    expect(screen.getByLabelText("Attendance trend, 2 sessions, from 80% to 50%")).toBeTruthy();
  });

  it("opens on the active season and moves to another through History", async () => {
    useSessionStore.setState(sessionFor("ADMIN"));
    mockEndpoints();
    renderWithProviders(<ReportsScreen />);

    const header = await screen.findByTestId("report-season");
    expect(within(header).getByText("Spring 2099")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Choose another season"));
    fireEvent.press(await screen.findByText("Autumn 2098"));

    await waitFor(() => {
      const urls = get.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes("seasonId=8"))).toBe(true);
    });
    expect(within(await screen.findByTestId("report-season")).getByText("Autumn 2098")).toBeTruthy();
  });
});

describe("ReportsScreen for admin — a failing season", () => {
  it("keeps History when the chosen season fails, so another can be picked (final review M6)", async () => {
    useSessionStore.setState(sessionFor("ADMIN"));
    mockEndpoints();
    const base = get.getMockImplementation() as (url: string) => Promise<unknown>;
    get.mockImplementation((url: string) =>
      url.startsWith("/api/v1/reports/engagement") && url.includes("seasonId=8")
        ? Promise.reject(new Error("boom"))
        : base(url),
    );
    renderWithProviders(<ReportsScreen />);

    fireEvent.press(await screen.findByLabelText("Choose another season"));
    fireEvent.press(await screen.findByText("Autumn 2098"));
    expect(await screen.findByText("Try again")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Choose another season"));
    fireEvent.press(await screen.findByText("Spring 2099"));
    await waitFor(() => expect(screen.getByText("STUDENTS AT RISK (1 OF 34)")).toBeTruthy());
  });
});

describe("ReportsScreen for super — organisation tiles and season rows", () => {
  it("shows the three figures as tiles that open their lists", async () => {
    useSessionStore.setState(sessionFor("SUPER"));
    mockEndpoints({ withOrg: true });
    renderWithProviders(<ReportsScreen />);

    fireEvent.press(await screen.findByText("Organisation"));
    fireEvent.press(await screen.findByLabelText("Student accounts: 40"));
    expect(mockPush).toHaveBeenCalledWith("/students");
    fireEvent.press(screen.getByLabelText("Alumni: 12"));
    expect(mockPush).toHaveBeenCalledWith("/students/alumni");
    fireEvent.press(screen.getByLabelText("Active seasons: 2"));
    expect(mockPush).toHaveBeenCalledWith("/seasons");
    expect(screen.getByTestId("organisation-tiles").props.className).toContain("flex-wrap");
  });

  it("switches between Season and Organisation instead of stacking them", async () => {
    useSessionStore.setState(sessionFor("SUPER"));
    mockEndpoints({ withOrg: true });
    renderWithProviders(<ReportsScreen />);

    expect(await screen.findByTestId("report-season")).toBeTruthy();
    expect(screen.queryByLabelText("Student accounts: 40")).toBeNull();
    fireEvent.press(screen.getByText("Organisation"));
    expect(await screen.findByLabelText("Student accounts: 40")).toBeTruthy();
    expect(screen.queryByTestId("report-season")).toBeNull();
    // No export from the organisation view: it has no engagement file.
    expect(screen.queryByLabelText("Export")).toBeNull();
    fireEvent.press(screen.getByText("Season"));
    expect(await screen.findByTestId("report-season")).toBeTruthy();
  });

  it("says 1 Active season, not 1 Active seasons", async () => {
    useSessionStore.setState(sessionFor("SUPER"));
    mockEndpoints({ withOrg: true });
    const was = organisation.activeSeasonCount;
    organisation.activeSeasonCount = 1;
    try {
      renderWithProviders(<ReportsScreen />);
      fireEvent.press(await screen.findByText("Organisation"));
      expect(await screen.findByLabelText("Active season: 1")).toBeTruthy();
    } finally {
      organisation.activeSeasonCount = was;
    }
  });

  it("lists students per season as a grouped row with all four counts and a status chip", async () => {
    useSessionStore.setState(sessionFor("SUPER"));
    mockEndpoints({ withOrg: true });
    renderWithProviders(<ReportsScreen />);

    fireEvent.press(await screen.findByText("Organisation"));
    expect(await screen.findByText("Students per season")).toBeTruthy();
    const meta = screen.getByText("2 leaders · 20 active · 3 completed · 1 dropped");
    // Each count stays with its noun when the line wraps (sweep R6).
    expect(meta.props.children).toBe("2\u00a0leaders · 20\u00a0active · 3\u00a0completed · 1\u00a0dropped");
    expect(screen.getByText("Active members per season")).toBeTruthy();
    expect(screen.getByText("2098: 12")).toBeTruthy();
    fireEvent.press(screen.getByLabelText(/^Spring 2099, 2 leaders/));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/seasons/[code]",
      params: { code: "spring-2099" },
    });
  });
});
