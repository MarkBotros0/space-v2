import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn() } }));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: (...args: unknown[]) => mockPush(...args) }),
}));

jest.mock("../design/layout/home-actions", () => {
  const { Text } = jest.requireActual("react-native");
  return { HomeActions: () => <Text testID="home-actions">home actions</Text> };
});

import { MentorDashboard } from "../components/dashboard/MentorDashboard";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";
import {
  EVENTS,
  UNREAD,
  engagementSummary,
  events,
  get,
  mentorDashboard,
  requested,
  serve,
} from "./helpers/dashboard-fixtures";

const NOTES = "/api/v1/me/visible-notes?limit=5";
const ENGAGEMENT = "/api/v1/reports/engagement";
const FEED = "/api/v1/me/dashboard";

const note = (over: Record<string, unknown> = {}) => ({
  id: 1,
  body: "Checked in about the essay",
  visibility: "MENTORS",
  followUpFlagged: false,
  createdAt: "2026-11-01T10:00:00.000Z",
  updatedAt: "2026-11-01T10:00:00.000Z",
  edited: false,
  authorId: 3,
  authorName: "Mina Mentor",
  authorRole: "MENTOR",
  seasonId: null,
  seasonTitle: null,
  canEdit: true,
  student: { id: 9, name: "Sam Student", email: "sam@example.com" },
  ...over,
});

const routes = (over: Record<string, unknown> = {}) => ({
  [ENGAGEMENT]: {
    ...engagementSummary,
    atRisk: [{ ...engagementSummary.atRisk[0], seasonTitle: "GBV 2026", attendancePct: 40, submissionPct: 55 }],
    atRiskTotal: 1,
  },
  [FEED]: mentorDashboard,
  [EVENTS]: events,
  [UNREAD]: { unreadCount: 0 },
  [NOTES]: { notes: [note(), note({ id: 2, followUpFlagged: true, student: { id: 10, name: "Nour", email: "n@x" } })], nextCursor: null },
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("MENTOR"));
});

describe("MentorDashboard (Today)", () => {
  it("greets by first name like the leader's Today", async () => {
    useSessionStore.setState(makeSession("MENTOR", {}, { name: "Mina Mentor" }));
    serve(routes());
    renderWithProviders(<MentorDashboard />);
    expect(await screen.findByText("Hi, Mina")).toBeTruthy();
    await screen.findByText("Open day");
  });

  it("keeps the plain Today title when the mentor has no name", async () => {
    useSessionStore.setState(makeSession("MENTOR", {}, { name: "  " }));
    serve(routes());
    renderWithProviders(<MentorDashboard />);
    expect((await screen.findAllByText("Home")).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^Hi,/)).toBeNull();
    await screen.findByText("Open day");
  });

  it("orders the sections At risk, Recent notes, Recent activity, then upcoming events", async () => {
    serve(routes());
    renderWithProviders(<MentorDashboard />);
    await screen.findByText("Open day");
    await screen.findByText("Sam Student");
    expect(screen.queryByText("Mentor dashboard")).toBeNull();
    const headers = screen.getAllByRole("header").map((h) => h.props.children);
    const idx = (t: string) => headers.indexOf(t);
    expect(idx("AT RISK")).toBeGreaterThanOrEqual(0);
    expect(idx("AT RISK")).toBeLessThan(idx("RECENT NOTES"));
    expect(idx("RECENT NOTES")).toBeLessThan(idx("RECENT ACTIVITY"));
    expect(screen.getByText("Upcoming events")).toBeTruthy();
  });

  it("at-risk row: name, season and percentages, no chips; press opens the student", async () => {
    serve(routes());
    renderWithProviders(<MentorDashboard />);
    expect(await screen.findByText("Sara Student")).toBeTruthy();
    expect(screen.getByText(/GBV 2026/)).toBeTruthy();
    expect(screen.getByText(/40% attendance/)).toBeTruthy();
    expect(screen.getByText(/55% submissions/)).toBeTruthy();
    expect(screen.getByText("Sara Student").props.numberOfLines).toBe(2);
    fireEvent.press(screen.getByRole("button", { name: /Sara Student/ }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/student/[id]", params: { id: "21" } });
  });

  it("shows 'n OF total', with tiles for the at-risk count and everyone, when the list is a slice", async () => {
    const row = engagementSummary.atRisk[0];
    serve(
      routes({
        [ENGAGEMENT]: {
          ...engagementSummary,
          atRisk: [row, { ...row, studentUserId: 22, name: "Two" }, { ...row, studentUserId: 23, name: "Three" }],
          atRiskTotal: 12,
        },
      }),
    );
    renderWithProviders(<MentorDashboard />);
    expect(await screen.findByText("AT RISK · 3 OF 12")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Students at risk: 12"));
    expect(mockPush).toHaveBeenCalledWith("/reports");
    fireEvent.press(screen.getByLabelText("Students: 40"));
    expect(mockPush).toHaveBeenCalledWith("/students");
  });

  it("note rows show student, body, a Follow-up chip only when flagged; press opens the student", async () => {
    serve(routes());
    renderWithProviders(<MentorDashboard />);
    expect(await screen.findByText("Sam Student")).toBeTruthy();
    expect(screen.getAllByText(/Checked in about the essay/)).toHaveLength(2);
    expect(screen.getAllByText(/Mina Mentor/)).toHaveLength(2);
    expect(screen.getAllByText("Follow-up")).toHaveLength(1);
    fireEvent.press(screen.getByRole("button", { name: /Sam Student/ }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/student/[id]", params: { id: "9" } });
  });

  it("My notes pushes /notes", async () => {
    serve(routes());
    renderWithProviders(<MentorDashboard />);
    fireEvent.press(await screen.findByRole("button", { name: /My notes/ }));
    expect(mockPush).toHaveBeenCalledWith("/notes");
  });

  it("says so when there are no notes", async () => {
    serve(routes({ [NOTES]: { notes: [], nextCursor: null } }));
    renderWithProviders(<MentorDashboard />);
    expect(await screen.findByText("No notes yet")).toBeTruthy();
  });

  it("a failed notes request leaves at-risk intact and Retry refetches only notes", async () => {
    serve(routes());
    get.mockImplementation((url: string) => {
      if (url === NOTES) return Promise.reject(new Error("boom"));
      const r = routes() as Record<string, unknown>;
      return url in r
        ? Promise.resolve({ data: { data: r[url] } })
        : Promise.reject(new Error(`not served: ${url}`));
    });
    renderWithProviders(<MentorDashboard />);
    expect(await screen.findByText("Couldn't load recent notes.")).toBeTruthy();
    expect(screen.getByText("Sara Student")).toBeTruthy();
    get.mockClear();
    serve(routes());
    fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(requested()).toEqual([NOTES]));
    expect(await screen.findByText("Sam Student")).toBeTruthy();
  });

  it.each([
    [ENGAGEMENT, "Couldn't load the at-risk list.", ["Sam Student"]],
    [FEED, "Couldn't load recent activity.", ["Sara Student", "Sam Student"]],
  ])("a failed %s request leaves the other sections intact and Retry refetches only it", async (failing, message, kept) => {
    get.mockImplementation((url: string) => {
      if (url === failing) return Promise.reject(new Error("boom"));
      const r = routes() as Record<string, unknown>;
      return url in r
        ? Promise.resolve({ data: { data: r[url] } })
        : Promise.reject(new Error(`not served: ${url}`));
    });
    renderWithProviders(<MentorDashboard />);
    expect(await screen.findByText(message)).toBeTruthy();
    for (const text of kept) expect(await screen.findByText(text)).toBeTruthy();
    get.mockClear();
    serve(routes());
    fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(requested()).toEqual([failing]));
    await waitFor(() => expect(screen.queryByText(message)).toBeNull());
  });

  it("pull to refresh refetches engagement, notes, activity and events", async () => {
    serve(routes());
    const view = renderWithProviders(<MentorDashboard />);
    await screen.findByText("Sam Student");
    await screen.findByText("Open day");
    get.mockClear();
    const scroll = view.UNSAFE_getAllByType(require("react-native").RefreshControl)[0];
    await act(async () => {
      scroll?.props.onRefresh();
    });
    await waitFor(() => {
      const r = requested();
      expect(r).toEqual(expect.arrayContaining([ENGAGEMENT, NOTES, FEED, EVENTS]));
    });
  });
});
