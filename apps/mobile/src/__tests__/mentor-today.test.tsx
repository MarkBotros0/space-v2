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
import { EVENTS, UNREAD, events, get, requested, serve } from "./helpers/dashboard-fixtures";

const NOTES = "/api/v1/me/visible-notes?limit=5";
const SUMMARY = "/api/v1/me/mentor-summary";

const note = {
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
};

const routes = (over: Record<string, unknown> = {}) => ({
  [SUMMARY]: { followUpsDue: 2, absentLately: 3, notesThisWeek: 4, students: 120 },
  [NOTES]: { notes: [note], nextCursor: null },
  [EVENTS]: events,
  [UNREAD]: { unreadCount: 0 },
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("MENTOR"));
});

describe("MentorDashboard (owner, 2026-11-07)", () => {
  it("shows the four numbers, each opening its list", async () => {
    serve(routes());
    renderWithProviders(<MentorDashboard />);

    fireEvent.press(await screen.findByLabelText("Follow-ups due: 2"));
    expect(mockPush).toHaveBeenLastCalledWith("/follow-ups");
    fireEvent.press(screen.getByLabelText("Absent lately: 3"));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: "/students", params: { absent: "1" } });
    fireEvent.press(screen.getByLabelText(/^Notes this week/));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: "/notes", params: { range: "week" } });
    fireEvent.press(screen.getByLabelText(/^Students/));
    expect(mockPush).toHaveBeenLastCalledWith("/students");
  });

  it("asks for nothing season-shaped: no at-risk report, no activity feed", async () => {
    serve(routes());
    renderWithProviders(<MentorDashboard />);
    await screen.findByLabelText("Follow-ups due: 2");
    expect(requested().some((u) => u.startsWith("/api/v1/reports"))).toBe(false);
    expect(requested()).not.toContain("/api/v1/me/dashboard");
    expect(screen.queryByText(/at risk/i)).toBeNull();
  });

  it("says All clear on a quiet day", async () => {
    serve(routes({ [SUMMARY]: { followUpsDue: 0, absentLately: 0, notesThisWeek: 0, students: 120 } }));
    renderWithProviders(<MentorDashboard />);
    expect(await screen.findByLabelText("Follow-ups due: none, all clear")).toBeTruthy();
    expect(screen.getByLabelText("Absent lately: none, all clear")).toBeTruthy();
  });

  it("lists the newest notes and opens all of them", async () => {
    serve(routes());
    renderWithProviders(<MentorDashboard />);
    expect(await screen.findByText("Sam Student")).toBeTruthy();
    fireEvent.press(screen.getByText("All notes"));
    expect(mockPush).toHaveBeenLastCalledWith("/notes");
  });

  it("a failed summary leaves the notes intact, and Retry refetches only it", async () => {
    serve(routes());
    get.mockImplementation((url: string) =>
      url === SUMMARY
        ? Promise.reject(new Error("down"))
        : Promise.resolve({ data: { data: routes()[url as keyof ReturnType<typeof routes>] } }),
    );
    renderWithProviders(<MentorDashboard />);
    expect(await screen.findByText("Couldn't load your numbers.")).toBeTruthy();
    expect(await screen.findByText("Sam Student")).toBeTruthy();

    serve(routes());
    const before = requested().filter((u) => u === NOTES).length;
    await act(async () => {
      fireEvent.press(screen.getByText("Try again"));
    });
    expect(await screen.findByLabelText("Follow-ups due: 2")).toBeTruthy();
    await waitFor(() => expect(requested().filter((u) => u === NOTES).length).toBe(before));
  });
});
