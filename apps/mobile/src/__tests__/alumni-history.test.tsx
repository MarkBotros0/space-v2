import { fireEvent, screen } from "@testing-library/react-native";
import type { SeasonHistoryRow } from "@space/shared";

const mockFormatSeasonDay = jest.fn();
jest.mock("../lib/format", () => {
  const actual = jest.requireActual("../lib/format");
  return {
    ...actual,
    formatSeasonDay: (iso: string) => {
      mockFormatSeasonDay(iso);
      return actual.formatSeasonDay(iso);
    },
  };
});

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

import { AlumniHistory } from "../screens/alumni/alumni-history";
import { renderWithProviders } from "./helpers/render";

const row = {
  seasonId: 3,
  code: "gbv-2025",
  outcome: "COMPLETED",
  title: "GBV 2025",
  startDate: "2025-02-01T00:00:00.000Z",
  endDate: "2025-06-30T00:00:00.000Z",
  groupName: "Group A1",
  attendancePct: 85,
  curriculum: [
    { sessionId: 31, title: "Opening night", startsAt: "2025-03-01T23:30:00.000Z", dayKey: "2025-03-02" },
    { sessionId: 32, title: "Second night", startsAt: "2025-03-08T18:00:00.000Z", dayKey: "2025-03-08" },
    { sessionId: 33, title: "Finale", startsAt: "2025-03-15T18:00:00.000Z", dayKey: "2025-03-15" },
  ],
} satisfies SeasonHistoryRow;

const query = (over: Record<string, unknown> = {}) =>
  ({
    data: [row],
    isPending: false,
    isError: false,
    refetch: jest.fn(),
    isRefetching: false,
    ...over,
  }) as never;

describe("AlumniHistory", () => {
  it("titles the screen My History with the journey subtitle", () => {
    renderWithProviders(<AlumniHistory query={query()} />);
    expect(screen.getByText("My History")).toBeTruthy();
    expect(screen.getByText("The seasons you journeyed through")).toBeTruthy();
  });

  it("shows title, date range, group, attendance and the outcome in words", () => {
    renderWithProviders(<AlumniHistory query={query()} />);
    expect(screen.getByText("GBV 2025")).toBeTruthy();
    expect(screen.getByText(/Feb 1, 2025 – Jun 30, 2025 · Group A1/)).toBeTruthy();
    expect(screen.getByText("85% attended")).toBeTruthy();
    expect(screen.getByText("Completed")).toBeTruthy();
    expect(screen.queryByText("Participated")).toBeNull();
  });

  it.each([
    ["PASSED", "Passed"],
    ["NOT_PASSED", "Did not pass"],
    ["DROPPED", "Did not finish"],
  ])("says %s as %s", (outcome, label) => {
    renderWithProviders(<AlumniHistory query={query({ data: [{ ...row, outcome }] })} />);
    expect(screen.getByText(label)).toBeTruthy();
  });

  it("opens the finished season page from View your season", () => {
    renderWithProviders(<AlumniHistory query={query()} />);
    fireEvent.press(screen.getByText("View your season"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/past-season/[seasonId]", params: { seasonId: "3" } });
  });

  it("formats both season dates as calendar days, like Today (not as instants)", () => {
    // Season dates are UTC-midnight calendar days: formatDate would print the
    // previous day west of UTC. The TZ cannot be switched inside Jest, so pin
    // which formatter the screen calls.
    renderWithProviders(<AlumniHistory query={query()} />);
    expect(mockFormatSeasonDay).toHaveBeenCalledWith("2025-02-01T00:00:00.000Z");
    expect(mockFormatSeasonDay).toHaveBeenCalledWith("2025-06-30T00:00:00.000Z");
  });

  it("omits the group separator when there is no group", () => {
    renderWithProviders(<AlumniHistory query={query({ data: [{ ...row, groupName: null }] })} />);
    expect(screen.queryByText(/·/)).toBeNull();
  });

  it("expands the curriculum with an expanded state and no glyph", () => {
    renderWithProviders(<AlumniHistory query={query()} />);
    const toggle = screen.getByRole("button", { name: "Curriculum (3 sessions)" });
    expect(toggle.props.accessibilityState).toMatchObject({ expanded: false });
    expect(screen.queryByText("Opening night")).toBeNull();
    fireEvent.press(toggle);
    expect(screen.getByRole("button", { name: "Curriculum (3 sessions)" }).props.accessibilityState)
      .toMatchObject({ expanded: true });
    expect(screen.getByText("Opening night")).toBeTruthy();
    expect(screen.getByText("Finale")).toBeTruthy();
    expect(screen.getByText("Mar 2, 2025")).toBeTruthy();
    expect(screen.queryByText("▶")).toBeNull();
    expect(screen.queryByText("▼")).toBeNull();
  });

  it("says sessions even for one", () => {
    renderWithProviders(
      <AlumniHistory query={query({ data: [{ ...row, curriculum: [row.curriculum[0]] }] })} />,
    );
    expect(screen.getByText("Curriculum (1 sessions)")).toBeTruthy();
  });

  it("has no toggle without a curriculum", () => {
    renderWithProviders(<AlumniHistory query={query({ data: [{ ...row, curriculum: [] }] })} />);
    expect(screen.queryByText(/Curriculum/)).toBeNull();
  });

  it("renders the empty state", () => {
    renderWithProviders(<AlumniHistory query={query({ data: [] })} />);
    expect(screen.getByText("No past seasons")).toBeTruthy();
    expect(screen.getByText("Your completed seasons will appear here.")).toBeTruthy();
  });

  it("offers retry on error", () => {
    const refetch = jest.fn();
    renderWithProviders(<AlumniHistory query={query({ data: undefined, isError: true, refetch })} />);
    fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("renders nothing beyond attendance and curriculum (R34)", () => {
    const leaky = { ...row, studentEmail: "x@y.z", notes: "SECRET-NOTE", score: 99 };
    renderWithProviders(<AlumniHistory query={query({ data: [leaky] })} />);
    fireEvent.press(screen.getByRole("button", { name: "Curriculum (3 sessions)" }));
    expect(screen.queryByText(/SECRET-NOTE|x@y\.z|99/)).toBeNull();
  });
});
