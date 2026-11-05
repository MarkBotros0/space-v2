import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn() },
}));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";

import NotesScreen from "../../app/(app)/(tabs)/notes";

const get = apiClient.get as jest.Mock;

const emptyScopes = {
  seasonAdminIds: [] as number[],
  groupLeaderIds: [] as number[],
  activeSeasonId: null as number | null,
  graduationYear: null as number | null,
};
// Every required MeUser field, so typecheck (which covers tests) passes
// (ruling X11): avatarPath, and Plan 9's hasPassword.
const mentorSession = {
  user: {
    id: 2, name: "Test mentor", email: "men@jpc.test", role: "MENTOR" as const,
    avatarPath: null, hasPassword: true,
  },
  scopes: emptyScopes,
};
const studentSession = {
  user: {
    id: 9, name: "Test student", email: "stu@jpc.test", role: "STUDENT" as const,
    avatarPath: null, hasPassword: true,
  },
  scopes: emptyScopes,
};

const note = {
  id: 5,
  body: "Checked in after the session.",
  visibility: "MENTORS" as const,
  followUpFlagged: true,
  createdAt: "2099-03-01T18:00:00.000Z",
  updatedAt: "2099-03-01T18:00:00.000Z",
  edited: false,
  authorId: 2,
  authorName: "Test mentor",
  authorRole: "MENTOR" as const,
  seasonId: 7,
  seasonTitle: "Spring 2099",
  canEdit: true,
  student: { id: 21, name: "Sara Student", email: "sara@jpc.test" },
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("NotesScreen", () => {
  it("lists the notes this staff member wrote, with who they are about", async () => {
    useSessionStore.setState(mentorSession);
    get.mockResolvedValue({ data: { data: { notes: [note], nextCursor: null } } });

    renderWithProviders(<NotesScreen />);

    expect(await screen.findByText("Sara Student")).toBeTruthy();
    expect(screen.getByText("Checked in after the session.")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/me/notes");
  });

  it("labels visibility in the equality terms the API actually enforces", async () => {
    useSessionStore.setState(mentorSession);
    get.mockResolvedValue({ data: { data: { notes: [note], nextCursor: null } } });

    renderWithProviders(<NotesScreen />);

    // v1's composer promised "in addition to you and admins", which was false:
    // an ADMIN cannot read a MENTORS note (R36, D3). The copy tells the truth.
    expect(await screen.findByText("Visible to mentors only")).toBeTruthy();
  });

  it("shows the follow-up badge and the edited marker from server-derived fields", async () => {
    useSessionStore.setState(mentorSession);
    get.mockResolvedValue({
      data: { data: { notes: [{ ...note, edited: true }], nextCursor: null } },
    });

    renderWithProviders(<NotesScreen />);

    expect(await screen.findByText("Follow-up flagged")).toBeTruthy();
    expect(screen.getByText("Edited")).toBeTruthy();
  });

  it("gives Back to a leader, for whom My notes is not a tab, but not to a mentor, for whom it is", async () => {
    get.mockResolvedValue({ data: { data: { notes: [note], nextCursor: null } } });
    const { TabBarPresenceContext } = jest.requireActual("../design/layout/shell-context");

    useSessionStore.setState({ ...mentorSession, user: { ...mentorSession.user, role: "LEADER" as const } });
    const leader = renderWithProviders(
      <TabBarPresenceContext.Provider value={true}><NotesScreen /></TabBarPresenceContext.Provider>,
    );
    await screen.findByText("Sara Student");
    expect(screen.getAllByLabelText("Back").length).toBeGreaterThan(0);
    leader.unmount();

    useSessionStore.setState(mentorSession);
    renderWithProviders(
      <TabBarPresenceContext.Provider value={true}><NotesScreen /></TabBarPresenceContext.Provider>,
    );
    await screen.findByText("Sara Student");
    expect(screen.queryByLabelText("Back")).toBeNull();
  });

  it("marks each note row as opening the student with a chevron", async () => {
    useSessionStore.setState(mentorSession);
    get.mockResolvedValue({ data: { data: { notes: [note], nextCursor: null } } });

    renderWithProviders(<NotesScreen />);
    await screen.findByText("Sara Student");

    expect(screen.getAllByTestId("list-row-chevron", { includeHiddenElements: true }).length).toBe(1);
  });

  it("navigates to the student on press", async () => {
    useSessionStore.setState(mentorSession);
    get.mockResolvedValue({ data: { data: { notes: [note], nextCursor: null } } });

    renderWithProviders(<NotesScreen />);
    fireEvent.press(await screen.findByText("Sara Student"));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/student/[id]",
      params: { id: "21" },
    });
  });

  it("never renders a standalone separator node, and joins date and season in one string", async () => {
    useSessionStore.setState(mentorSession);
    get.mockResolvedValue({ data: { data: { notes: [note], nextCursor: null } } });

    renderWithProviders(<NotesScreen />);

    expect(await screen.findByText("Mar 1, 2099 · Spring 2099")).toBeTruthy();
    expect(screen.queryByText("·")).toBeNull();
  });

  it("has no trailing separator when the note has no season", async () => {
    useSessionStore.setState(mentorSession);
    get.mockResolvedValue({
      data: { data: { notes: [{ ...note, seasonId: null, seasonTitle: null }], nextCursor: null } },
    });

    renderWithProviders(<NotesScreen />);

    expect(await screen.findByText("Mar 1, 2099")).toBeTruthy();
    expect(screen.queryByText(/·/)).toBeNull();
  });

  it("shows a student their own empty branch without calling the API", async () => {
    useSessionStore.setState(studentSession);

    renderWithProviders(<NotesScreen />);

    // A STUDENT gets 403 from /me/notes; the screen must not fire a request it
    // knows will be refused.
    expect(await screen.findByText("Notes")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });

  it("shows an empty state when this author has written nothing", async () => {
    useSessionStore.setState(mentorSession);
    get.mockResolvedValue({ data: { data: { notes: [], nextCursor: null } } });

    renderWithProviders(<NotesScreen />);

    expect(await screen.findByText("No notes yet")).toBeTruthy();
  });

  it("follows nextCursor — the list is never silently capped at one page (R41)", async () => {
    useSessionStore.setState(mentorSession);
    const older = { ...note, id: 4, student: { id: 22, name: "Omar Older", email: "o@jpc.test" } };
    get.mockImplementation((url: string) =>
      Promise.resolve(
        url === "/api/v1/me/notes"
          ? { data: { data: { notes: [note], nextCursor: "5" } } }
          : { data: { data: { notes: [older], nextCursor: null } } },
      ),
    );

    renderWithProviders(<NotesScreen />);
    fireEvent.press(await screen.findByText("Load more"));

    expect(await screen.findByText("Omar Older")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/me/notes?cursor=5");
    // Last page reached: the control goes away.
    await waitFor(() => expect(screen.queryByText("Load more")).toBeNull());
  });
});
