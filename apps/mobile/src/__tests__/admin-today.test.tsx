import { fireEvent, screen, waitFor } from "@testing-library/react-native";

// `jest.mock` factories may only close over `mock*` consts (CLAUDE.md).
jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: (...args: unknown[]) => mockPush(...args) }),
}));

jest.mock("../design/layout/home-actions", () => {
  const { Text } = jest.requireActual("react-native");
  return { HomeActions: () => <Text testID="home-actions">home actions</Text> };
});

import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import { get, requested, staffDashboard } from "./helpers/dashboard-fixtures";
import { serveStaff, sessionRow, staffRoutes } from "./helpers/staff-today-fixtures";

import DashboardScreen from "../../app/(app)/(tabs)/dashboard";

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
});

type Json = { children?: (Json | string)[] | null } | string | null | undefined | (Json | string)[];
/** Rendered text in document order. */
const texts = (n: Json): string[] =>
  typeof n === "string" ? [n] : Array.isArray(n) ? n.flatMap(texts) : n ? texts(n.children ?? []) : [];
const order = (...wanted: string[]) => {
  const all = texts(screen.toJSON() as Json);
  return wanted.map((w) => all.findIndex((t) => t.includes(w)));
};

describe("Admin Today", () => {
  it("greets the admin by first name, and falls back to Today when the name is blank", async () => {
    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }, { name: "Ada Admin" }));
    serveStaff(get);
    const first = renderWithProviders(<DashboardScreen />);
    expect((await screen.findAllByText("Hi, Ada")).length).toBeGreaterThan(0);
    first.unmount();

    useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }, { name: "  " }));
    serveStaff(get);
    renderWithProviders(<DashboardScreen />);
    expect((await screen.findAllByText("Home")).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^Hi,/)).toBeNull();
  });

  it("orders the live session, then what needs action, then the figures", async () => {
    serveStaff(get);
    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByLabelText("Submissions to review: 3")).toBeTruthy();
    expect(screen.getAllByTestId("home-actions")).toHaveLength(1);
    expect(screen.getByText("Happening now")).toBeTruthy();
    expect(screen.getByText("Week 6")).toBeTruthy();
    expect(screen.getByText(/Spring 2099 · .*· 90 min · Hall/)).toBeTruthy();
    const at = order("Happening now", "NEEDS ACTION", "Sessions held", "Upcoming events");
    expect(at[0]).toBeGreaterThan(-1);
    expect(at[1]).toBeGreaterThan(at[0]!);
    expect(at[2]).toBeGreaterThan(at[1]!);
    expect(at[3]).toBeGreaterThan(at[2]!);
    expect(screen.getByLabelText("Students: 3")).toBeTruthy();
    expect(screen.getByLabelText("Sessions held: 3 of 4")).toBeTruthy();
    expect(screen.getByLabelText("Season progress 75%")).toBeTruthy();
    expect(screen.getByLabelText("Attendance: 33%")).toBeTruthy();
  });

  it("Mark attendance opens the attendance sheet; Open session the session; Join stream stays while live", async () => {
    serveStaff(get);
    renderWithProviders(<DashboardScreen />);

    fireEvent.press(await screen.findByText("Mark attendance"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/session/[id]/attendance", params: { id: "11" } });
    fireEvent.press(screen.getByText("Open session"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/session/[id]", params: { id: "11" } });
    expect(screen.getByText("Join stream")).toBeTruthy();
  });

  it("a session that has not started has no Mark attendance and no stream", async () => {
    const next = { ...staffDashboard("season"), nextSession: { ...staffDashboard("season").nextSession, isInProgress: false } };
    serveStaff(get, { table: staffRoutes({ "/api/v1/me/dashboard?seasonId=7": next }) });
    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText("Next session")).toBeTruthy();
    expect(screen.queryByText("Mark attendance")).toBeNull();
    expect(screen.queryByText("Join stream")).toBeNull();
    expect(screen.getByText("Open session")).toBeTruthy();
  });

  it("the review row opens exactly the queue it counts: pending, in this season", async () => {
    serveStaff(get);
    renderWithProviders(<DashboardScreen />);

    fireEvent.press(await screen.findByLabelText("Submissions to review: 3"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/submissions", params: { seasonId: "7" } });
    fireEvent.press(screen.getByLabelText("Sessions without attendance: 1"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/attention/sessions", params: { seasonId: "7" } });
    fireEvent.press(screen.getByLabelText("Students at risk: 2"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/attention/at-risk", params: { seasonId: "7" } });
    expect(screen.queryByLabelText(/Not invited yet/)).toBeNull();
  });

  it("a zero count is an All clear tile beside the ones with work in them", async () => {
    serveStaff(get, { pending: 0, atRisk: 1 });
    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByLabelText("Students at risk: 1")).toBeTruthy();
    expect(screen.getByLabelText("Submissions to review: none, all clear")).toBeTruthy();
    expect(screen.getByText("Submissions to review · All clear")).toBeTruthy();
  });

  it("every Needs action tile reads All clear only when its count is exactly zero", async () => {
    serveStaff(get, {
      pending: 0,
      atRisk: 0,
      table: staffRoutes({ "/api/v1/seasons/7/sessions": { sessions: [sessionRow(2, 7, 700, true)] } }),
    });
    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByLabelText("Submissions to review: none, all clear")).toBeTruthy();
    expect(screen.getByLabelText("Sessions without attendance: none, all clear")).toBeTruthy();
    expect(screen.getByLabelText("Students at risk: none, all clear")).toBeTruthy();
  });

  it("a failed sessions read shows a retry in place of that row, never Nothing needs action", async () => {
    serveStaff(get, {
      pending: 0,
      atRisk: 0,
      table: staffRoutes({ "/api/v1/seasons/7/sessions": new Error("boom") }),
    });
    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText(/Couldn't load sessions with no attendance/)).toBeTruthy();
    expect(screen.queryByLabelText("Sessions without attendance: none, all clear")).toBeNull();
    const before = requested().filter((u) => u.endsWith("/sessions")).length;
    fireEvent.press(screen.getAllByText("Try again")[0]!);
    await waitFor(() => expect(requested().filter((u) => u.endsWith("/sessions")).length).toBeGreaterThan(before));
  });

  it("the season card opens the season and the at-risk preview opens the student", async () => {
    serveStaff(get);
    renderWithProviders(<DashboardScreen />);

    fireEvent.press(await screen.findByLabelText("Open Spring 2099"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/seasons/[code]", params: { code: "spring-2099" } });
    // Students, Assignments and Quizzes are tabs now, not rows on Home.
    expect(screen.queryByText("Assignments")).toBeNull();
    expect(screen.queryByText("Quizzes")).toBeNull();
    fireEvent.press(screen.getByText("Sara Student"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/student/[id]", params: { id: "21" } });
    expect(screen.getByText("1/3 submitted · 33% attendance")).toBeTruthy();
    expect(screen.getByText("Open day")).toBeTruthy();
  });

  it("no season: 'No season yet' and the events card, with no dashboard request", async () => {
    serveStaff(get, { table: staffRoutes({ "/api/v1/seasons": { seasons: [] } }) });
    renderWithProviders(<DashboardScreen />);

    expect(await screen.findByText("No season yet")).toBeTruthy();
    expect(await screen.findByText("Open day")).toBeTruthy();
    expect(requested().some((u) => u.startsWith("/api/v1/me/dashboard"))).toBe(false);
    expect(screen.queryByLabelText(/Submissions to review/)).toBeNull();
  });
});
