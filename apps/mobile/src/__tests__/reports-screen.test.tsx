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

import ReportsScreen from "../../app/(app)/(tabs)/reports";

import { mockEndpoints, sessionFor } from "./helpers/reports-fixtures";

const get = apiClient.get as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("ReportsScreen — role branches", () => {
  it("shows a LEADER nothing and issues no request (R109)", async () => {
    useSessionStore.setState(sessionFor("LEADER"));
    mockEndpoints();

    renderWithProviders(<ReportsScreen />);

    expect(await screen.findByText("Reports")).toBeTruthy();
    expect(screen.getByText("This screen is for mentors and season admins.")).toBeTruthy();
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
    // The roll-up is its own view behind the Season | Organisation control.
    expect(screen.queryByText("Student accounts")).toBeNull();
    fireEvent.press(screen.getByText("Organisation"));
    expect(await screen.findByText("Student accounts")).toBeTruthy();
    expect((await screen.findAllByText("40")).length).toBeGreaterThan(0);
  });
});

describe("ReportsScreen — SUPER's organisation roll-up (v1 super/reports)", () => {
  it("draws the stat cards, the alumni years and the per-season table, and opens a season", async () => {
    useSessionStore.setState(sessionFor("SUPER"));
    mockEndpoints({ withOrg: true });

    renderWithProviders(<ReportsScreen />);

    fireEvent.press(await screen.findByText("Organisation"));
    expect(await screen.findByText("Students per season")).toBeTruthy();
    expect(screen.getByText("Active seasons")).toBeTruthy();
    expect(screen.getByText("2098: 12")).toBeTruthy();
    expect(screen.getAllByText("20 active").length).toBeGreaterThan(0);
    // The season is a grouped row: its label is the title, then the counts it carries.
    fireEvent.press(screen.getByLabelText(/^Spring 2099, 2 leaders/));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/seasons/[code]",
      params: { code: "spring-2099" },
    });
  });
});

describe("ReportsScreen — the at-risk card comes first and tells the truth", () => {
  it('renders "1 of 34" so the cap is visible (spec D16, R33)', async () => {
    useSessionStore.setState(sessionFor("MENTOR"));
    mockEndpoints();

    renderWithProviders(<ReportsScreen />);

    // v1 sliced to ten and said nothing, so a reader could not tell whether ten
    // was all of them.
    expect(await screen.findByText("STUDENTS AT RISK (1 OF 34)")).toBeTruthy();
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
