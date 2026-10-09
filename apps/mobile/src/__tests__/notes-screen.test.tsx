import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";

import NotesScreen from "../../app/(app)/notes";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

const PICKER = "/api/v1/me/notes/students";
const pickerStudents = [
  { id: 21, name: "Sara Student", email: "sara@jpc.test" },
  { id: 30, name: "Yusuf Alumnus", email: "yusuf@jpc.test" },
];

/** Serves the picker and routes every other GET to `notesFor(url)`. */
function serve(notesFor: (url: string) => unknown) {
  get.mockImplementation((url: string) =>
    Promise.resolve(
      url === PICKER
        ? { data: { data: { students: pickerStudents } } }
        : { data: { data: notesFor(url) } },
    ),
  );
}

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
const adminSession = {
  user: {
    id: 3, name: "Test admin", email: "adm@jpc.test", role: "ADMIN" as const,
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
  // Org-day from the server (R90) — deliberately not createdAt's UTC date.
  createdDayKey: "2099-03-02",
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
    serve(() => ({ notes: [note], nextCursor: null }));

    renderWithProviders(<NotesScreen />);

    expect(await screen.findByText("Sara Student")).toBeTruthy();
    expect(screen.getByText("Checked in after the session.")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/me/notes");
  });

  it("shows the server's org-day and season, never the device-zone date (R90)", async () => {
    useSessionStore.setState(mentorSession);
    serve(() => ({ notes: [note], nextCursor: null }));

    renderWithProviders(<NotesScreen />);

    expect(await screen.findByText("Mar 2, 2099 · Spring 2099")).toBeTruthy();
  });

  it("labels visibility in the equality terms the API actually enforces", async () => {
    useSessionStore.setState(mentorSession);
    serve(() => ({ notes: [note], nextCursor: null }));

    renderWithProviders(<NotesScreen />);

    // v1's composer promised "in addition to you and admins", which was false:
    // an ADMIN cannot read a MENTORS note (R36, D3). The copy tells the truth.
    expect(await screen.findByText("Visible to mentors only")).toBeTruthy();
  });

  it("shows the follow-up badge and the edited marker from server-derived fields", async () => {
    useSessionStore.setState(mentorSession);
    serve(() => ({ notes: [{ ...note, edited: true }], nextCursor: null }));

    renderWithProviders(<NotesScreen />);

    expect(await screen.findByText("Follow-up flagged")).toBeTruthy();
    expect(screen.getByText("Edited")).toBeTruthy();
  });

  it("navigates to the student on press", async () => {
    useSessionStore.setState(mentorSession);
    serve(() => ({ notes: [note], nextCursor: null }));

    renderWithProviders(<NotesScreen />);
    fireEvent.press(await screen.findByText("Sara Student"));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/student/[id]",
      params: { id: "21" },
    });
  });

  it.each([
    ["a student", studentSession],
    ["an admin", adminSession],
  ])("shows %s the not-yours branch without calling the API (MENTOR only, R44)", async (_label, session) => {
    useSessionStore.setState(session);

    renderWithProviders(<NotesScreen />);

    // Only MENTOR may call /me/notes (v1 src/app/mentor/notes/page.tsx:21);
    // the screen must not fire a request it knows will be refused.
    expect(await screen.findByText("Notes")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });

  it("shows an empty state when this author has written nothing", async () => {
    useSessionStore.setState(mentorSession);
    serve(() => ({ notes: [], nextCursor: null }));

    renderWithProviders(<NotesScreen />);

    expect(await screen.findByText("No notes yet")).toBeTruthy();
  });

  it("follows nextCursor — the list is never silently capped at one page (R41)", async () => {
    useSessionStore.setState(mentorSession);
    const older = { ...note, id: 4, student: { id: 22, name: "Omar Older", email: "o@jpc.test" } };
    serve((url) =>
      url === "/api/v1/me/notes"
        ? { notes: [note], nextCursor: "5" }
        : { notes: [older], nextCursor: null },
    );

    renderWithProviders(<NotesScreen />);
    fireEvent.press(await screen.findByText("Load more"));

    expect(await screen.findByText("Omar Older")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/me/notes?cursor=5");
    // Last page reached: the control goes away.
    await waitFor(() => expect(screen.queryByText("Load more")).toBeNull());
  });

  it("writes a MENTORS note for the picked student, with the follow-up flag (R12, R45)", async () => {
    useSessionStore.setState(mentorSession);
    serve(() => ({ notes: [], nextCursor: null }));
    post.mockResolvedValue({ data: { data: { note: { ...note, student: undefined } } } });

    renderWithProviders(<NotesScreen />);

    fireEvent.changeText(await screen.findByLabelText("Student"), "yus");
    // Alumni are in the picker, as v1's role-STUDENT, non-deleted list.
    fireEvent.press(await screen.findByLabelText("Yusuf Alumnus, yusuf@jpc.test"));
    fireEvent.changeText(screen.getByLabelText("Note"), "Prayed together after class.");
    fireEvent(screen.getAllByLabelText("Flag for admin follow-up")[0]!, "valueChange", true);
    fireEvent.press(screen.getByText("Add note"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/students/30/notes", {
        body: "Prayed together after class.",
        visibility: "MENTORS",
        followUpFlagged: true,
      }),
    );
    expect(get).toHaveBeenCalledWith(PICKER);
  });

  it("refuses to save without a student, as v1's composer", async () => {
    useSessionStore.setState(mentorSession);
    serve(() => ({ notes: [], nextCursor: null }));

    renderWithProviders(<NotesScreen />);

    fireEvent.changeText(await screen.findByLabelText("Note"), "Something");
    fireEvent.press(screen.getByText("Add note"));

    expect(await screen.findByText("Pick a student.")).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it("filters the authored list by the picked student (v1 ?student, R45)", async () => {
    useSessionStore.setState(mentorSession);
    serve(() => ({ notes: [note], nextCursor: null }));

    renderWithProviders(<NotesScreen />);

    fireEvent.changeText(await screen.findByLabelText("Filter by student"), "sara");
    fireEvent.press(await screen.findByLabelText("Sara Student, sara@jpc.test"));

    await waitFor(() => expect(get).toHaveBeenCalledWith("/api/v1/me/notes?studentId=21"));
  });
});
