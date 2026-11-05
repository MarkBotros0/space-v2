// Reports for ADMIN and SUPER: Screen frame, tiles and grouped rows. The
// mentor keeps today's look (plan 05 owns its frame), pinned by the two suites
// beside this one.
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

import { mockEndpoints, sessionFor } from "./helpers/reports-fixtures";

const get = apiClient.get as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  mockDownloadAndShare.mockResolvedValue(undefined);
});

describe("ReportsScreen for admin and super — frame and export", () => {
  it("titles the Screen, keeps the scope line, and opens the export sheet from the title row", async () => {
    useSessionStore.setState(sessionFor("ADMIN"));
    mockEndpoints();
    renderWithProviders(<ReportsScreen />);

    expect(await screen.findByText("Scoped to All seasons.")).toBeTruthy();
    expect(screen.getAllByText("Reports").length).toBeGreaterThan(0);
    // The two buttons moved into a sheet; nothing is offered inline any more.
    expect(screen.queryByText("Export engagement")).toBeNull();

    fireEvent.press(screen.getByLabelText("Export"));
    fireEvent.press(await screen.findByText("Export engagement"));

    await waitFor(() =>
      expect(mockDownloadAndShare).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "/api/v1/reports/engagement/export",
          filename: "engagement-all-seasons-2099-03-10.xlsx",
        }),
      ),
    );
  });

  it("keeps the mentor's inline export buttons", async () => {
    useSessionStore.setState(sessionFor("MENTOR"));
    mockEndpoints();
    renderWithProviders(<ReportsScreen />);
    expect(await screen.findByText("Export engagement")).toBeTruthy();
  });
});

describe("ReportsScreen for admin — at-risk rows and engagement tiles", () => {
  it("draws the at-risk list as a grouped row with the season and both percentages", async () => {
    useSessionStore.setState(sessionFor("ADMIN"));
    mockEndpoints();
    renderWithProviders(<ReportsScreen />);

    expect(await screen.findByText("Students at risk (1 of 34)")).toBeTruthy();
    expect(screen.getByText("Sara Student")).toBeTruthy();
    expect(screen.getByText("Spring 2099 · 50% attendance · 30% submissions")).toBeTruthy();
    expect(screen.getByTestId("list-row-chevron", { includeHiddenElements: true })).toBeTruthy();
    fireEvent.press(screen.getByLabelText(/^Sara Student/));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/student/[id]", params: { id: "21" } });
    expect(screen.getByText("Show more")).toBeTruthy();
  });

  it("keeps every engagement figure as a tile in a wrapping row", async () => {
    useSessionStore.setState(sessionFor("ADMIN"));
    mockEndpoints();
    renderWithProviders(<ReportsScreen />);

    const expected: Array<[string, string]> = [
      ["Enrolments", "44"],
      ["Students", "40"],
      ["High", "3"],
      ["Medium", "5"],
      ["Low", "2"],
      ["At risk", "34"],
    ];
    for (const [label, value] of expected) {
      const tile = await screen.findByLabelText(`${label}: ${value}`);
      // The figure shrinks to fit one line at font scale 1.3 and never ellipsizes.
      await waitFor(() => expect(within(tile).getByText(value)).toBeTruthy());
      const figure = within(tile).getByText(value);
      expect(figure.props.adjustsFontSizeToFit).toBe(true);
      expect(figure.props.numberOfLines).toBe(1);
      expect(figure.props.ellipsizeMode).toBeUndefined();
    }
    expect(screen.getByTestId("engagement-tiles").props.className).toContain("flex-wrap");
    // The old text lines are the tiles now.
    expect(screen.queryByText("44 enrolments · 40 students")).toBeNull();
  });

  it("still carries the trend range, completion bars and the method note", async () => {
    useSessionStore.setState(sessionFor("ADMIN"));
    mockEndpoints();
    renderWithProviders(<ReportsScreen />);

    expect(await screen.findByText("Reflection one")).toBeTruthy();
    expect(screen.getByText("Completion rate")).toBeTruthy();
    expect(screen.getByText("How these numbers are calculated")).toBeTruthy();
    expect(screen.getByLabelText("Attendance trend, 2 sessions, from 80% to 50%")).toBeTruthy();
  });

  it("filters by season with chips and refetches with that seasonId", async () => {
    useSessionStore.setState(sessionFor("ADMIN"));
    mockEndpoints();
    renderWithProviders(<ReportsScreen />);

    const chip = await screen.findByLabelText("Season filter: Autumn 2099");
    expect(chip.props.accessibilityState).toEqual({ selected: false });
    fireEvent.press(chip);

    await waitFor(() => {
      const urls = get.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes("seasonId=8"))).toBe(true);
    });
    await waitFor(() =>
      expect(screen.getByLabelText("Season filter: Autumn 2099").props.accessibilityState).toEqual({
        selected: true,
      }),
    );
  });
});

describe("ReportsScreen for super — organisation tiles and season rows", () => {
  it("shows the three figures as tiles that open their lists", async () => {
    useSessionStore.setState(sessionFor("SUPER"));
    mockEndpoints({ withOrg: true });
    renderWithProviders(<ReportsScreen />);

    fireEvent.press(await screen.findByLabelText("Student accounts: 40"));
    expect(mockPush).toHaveBeenCalledWith("/students");
    fireEvent.press(screen.getByLabelText("Alumni: 12"));
    expect(mockPush).toHaveBeenCalledWith("/students/alumni");
    fireEvent.press(screen.getByLabelText("Active seasons: 2"));
    expect(mockPush).toHaveBeenCalledWith("/seasons");
    expect(screen.getByTestId("organisation-tiles").props.className).toContain("flex-wrap");
  });

  it("lists students per season as a grouped row with all four counts and a status chip", async () => {
    useSessionStore.setState(sessionFor("SUPER"));
    mockEndpoints({ withOrg: true });
    renderWithProviders(<ReportsScreen />);

    expect(await screen.findByText("Students per season")).toBeTruthy();
    expect(screen.getByText("2 leaders · 20 active · 3 completed · 1 dropped")).toBeTruthy();
    expect(screen.getByText("Active members per season")).toBeTruthy();
    expect(screen.getByText("2098: 12")).toBeTruthy();
    fireEvent.press(screen.getByLabelText(/^Spring 2099, 2 leaders/));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/seasons/[code]",
      params: { code: "spring-2099" },
    });
  });
});
