import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "21" }),
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";

import StudentDetailScreen from "../../app/(app)/student/[id]/index";

const get = apiClient.get as jest.Mock;

const emptyScopes = {
  seasonAdminIds: [] as number[],
  groupLeaderIds: [] as number[],
  activeSeasonId: null as number | null,
  graduationYear: null as number | null,
};

const enrollment = {
  enrollmentId: 500,
  seasonId: 7,
  seasonCode: "S99",
  seasonTitle: "Spring 2099",
  seasonStatus: "ACTIVE" as const,
  startDate: "2099-01-01T00:00:00.000Z",
  endDate: "2099-12-31T00:00:00.000Z",
  groupName: "Group A",
  status: "WITHDRAWN" as const,
  enrolledAt: "2099-01-01T00:00:00.000Z",
  completedAt: null,
  droppedAt: "2099-06-01T00:00:00.000Z",
  dropReason: "Moved away",
  attendancePct: null,
};

const base = {
  id: 21,
  name: "Sara Student",
  email: "sara@jpc.test",
  avatarPath: null,
  graduationYear: null,
  currentGroup: { id: 3, name: "Group A" },
  enrollments: [enrollment],
};

const publicProfile = {
  phone: "+20 100 000 0000",
  university: "Cairo University",
  faculty: "Engineering",
  universityGraduationYear: 2027,
  activeSeasonId: 7,
  activeSeasonTitle: "Spring 2099",
  activeSeasonCode: "S99",
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("StudentDetailScreen — LEADER (v1 /leader/students/[id], B3-15)", () => {
  const leaderSession = {
    user: {
      id: 5,
      name: "Test leader",
      email: "lead@jpc.test",
      role: "LEADER" as const,
      avatarPath: null,
      hasPassword: true,
    },
    scopes: { ...emptyScopes, groupLeaderIds: [3] },
  };
  const post = (apiClient as unknown as { post: jest.Mock }).post;
  const engagement = {
    score: 75,
    attendancePct: 50,
    submissionPct: 100,
    attendancePresent: 2,
    attendanceTotal: 4,
    submissionsCompleted: 2,
    submissionsExpected: 2,
    studentUserId: 21,
    seasonId: 7,
    seasonTitle: "Spring 2099",
    atRisk: false,
    quizzesGiven: 2,
    quizzesTaken: 1,
    quizPct: 50,
  };
  const progress = {
    seasonId: 7,
    seasonTitle: "Spring 2099",
    seasonActive: true,
    canMark: true,
    available: { attendance: true, assignments: true, quizzes: true },
    numbers: {
      attendance: { attended: 2, total: 4 },
      assignments: { submitted: 2, total: 2 },
      quizzes: { scored: 5, max: 10 },
    },
    assignments: [],
    quizzes: [],
  };
  function serveLeader(over: { engagementError?: boolean } = {}) {
    get.mockImplementation((url: string) => {
      if (url === "/api/v1/students/21/progress")
        return over.engagementError
          ? Promise.reject(
              Object.assign(new Error("404"), {
                isAxiosError: true,
                response: { status: 404, data: { error: { code: "no_season", message: "x" } } },
              }),
            )
          : Promise.resolve({ data: { data: progress } });
      if (url === "/api/v1/students/21")
        return Promise.resolve({
          data: {
            data: {
              ...base,
              enrollments: [{ ...enrollment, status: "ACTIVE", dropReason: null, droppedAt: null, attendancePct: 83 }],
              profile: publicProfile,
            },
          },
        });
      if (url === "/api/v1/students/21/engagement")
        return over.engagementError
          ? Promise.reject(
              Object.assign(new Error("404"), {
                isAxiosError: true,
                response: { status: 404, data: { error: { code: "no_season", message: "x" } } },
              }),
            )
          : Promise.resolve({ data: { data: engagement } });
      if (url === "/api/v1/students/21/submissions")
        return Promise.resolve({
          data: {
            data: {
              submissions: [
                {
                  publicId: "abc123defg",
                  assignmentId: 41,
                  assignmentTitle: "Essay one",
                  status: "SUBMITTED",
                  isLate: false,
                  submittedAt: "2099-03-02T10:00:00.000Z",
                  reviewedAt: null,
                  seasonId: 7,
                  seasonTitle: "Spring 2099",
                },
              ],
            },
          },
        });
      if (url.startsWith("/api/v1/students/21/notes"))
        return Promise.resolve({ data: { data: { notes: [], nextCursor: null } } });
      if (url === "/api/v1/students/21/attendance") return Promise.resolve({ data: { data: { history: [] } } });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
  }
  const requested = () => get.mock.calls.map(([u]) => u as string);

  it("shows the leader header and hero without the fields a leader doesn't receive", async () => {
    useSessionStore.setState(leaderSession);
    serveLeader();
    renderWithProviders(<StudentDetailScreen />);
    // The subtitle is the group, never the email (owner, 2026-11-07).
    expect(await screen.findByText("Group A")).toBeTruthy();
    expect(screen.queryByText("sara@jpc.test")).toBeNull();
    expect(screen.queryByText(/leader view/)).toBeNull();
    expect(screen.queryByText("Email")).toBeNull();
    // A leader sees the phone (4999d4cf) but not the date of birth or internal notes.
    expect(screen.getByText("Phone")).toBeTruthy();
    expect(screen.getByLabelText("Call +20 100 000 0000")).toBeTruthy();
    expect(screen.queryByText("Date of birth")).toBeNull();
    expect(screen.queryByText("Internal notes · staff only")).toBeNull();
    for (const label of ["University", "Faculty", "Graduation year"]) expect(screen.getByText(label)).toBeTruthy();
    expect(await screen.findByLabelText("Attendance 50%, 2 of 4 sessions")).toBeTruthy();
    expect(screen.getByLabelText("Assignments 100%, 2 of 2 submitted")).toBeTruthy();
    expect(screen.getByLabelText("Quizzes 50%, 5 of 10 marks")).toBeTruthy();
    expect(screen.queryByText("At risk")).toBeNull();
  });

  it("fetches a tab's data only when the tab opens (spec 06 §9)", async () => {
    useSessionStore.setState(leaderSession);
    serveLeader();
    renderWithProviders(<StudentDetailScreen />);
    expect(await screen.findByText("Group A")).toBeTruthy();
    // Submissions is the first tab (owner, 2026-11-07), so it opens and fetches at once;
    // the others wait until opened.
    expect(await screen.findByText("Essay one")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/students/21/submissions");
    expect(requested().some((u) => u.endsWith("/attendance") || u.includes("/notes"))).toBe(false);
    fireEvent.press(screen.getByText("Essay one"));
    // A history row is the whole Submission, not one essay: it opens the assignment's progress.
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/assignment/[id]", params: { id: "41" } });

    fireEvent.press(screen.getByText("Seasons"));
    expect(await screen.findByText(/83% attendance/)).toBeTruthy();
  });

  it("writes a note from the sheet: visibility, follow-up flag, and the empty-note check", async () => {
    useSessionStore.setState(leaderSession);
    serveLeader();
    post.mockResolvedValue({ data: { data: { note: { id: 1 } } } });
    renderWithProviders(<StudentDetailScreen />);
    fireEvent.press(await screen.findByText("Notes"));
    expect(await screen.findByText("No notes yet")).toBeTruthy();
    expect(screen.queryByLabelText("Note")).toBeNull();

    fireEvent.press(screen.getByText("Write a note"));
    fireEvent.changeText(await screen.findByLabelText("Note"), "x");
    fireEvent.press(screen.getByText("Add note"));
    expect(await within(await screen.findByTestId("sheet-save-bar")).findByText("Note can't be empty.")).toBeTruthy();
    expect(post).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByLabelText("Note"), "Prayed together after the session.");
    fireEvent.press(screen.getByRole("tab", { name: "Admins only" }));
    fireEvent.press(screen.getByLabelText("Flag for admin follow-up"));
    fireEvent.press(screen.getByText("Add note"));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/students/21/notes", {
        body: "Prayed together after the session.",
        visibility: "ADMINS",
        followUpFlagged: true,
      }),
    );
  });

  it("opens the note sheet on Leaders for a leader", async () => {
    useSessionStore.setState(leaderSession);
    serveLeader();
    renderWithProviders(<StudentDetailScreen />);
    fireEvent.press(await screen.findByText("Notes"));
    await screen.findByText("No notes yet");
    fireEvent.press(screen.getByText("Write a note"));
    await screen.findByLabelText("Note");
    expect(screen.getByRole("tab", { name: "Leaders" }).props.accessibilityState?.selected).toBe(true);
    expect(screen.getByRole("tab", { name: "Mentors" }).props.accessibilityState?.selected).toBe(false);
  });

  it("shows an at-risk chip when the engagement says so", async () => {
    useSessionStore.setState(leaderSession);
    serveLeader();
    const orig = get.getMockImplementation()!;
    get.mockImplementation((url: string) =>
      url === "/api/v1/students/21/engagement"
        ? Promise.resolve({ data: { data: { ...engagement, atRisk: true } } })
        : orig(url),
    );
    renderWithProviders(<StudentDetailScreen />);
    expect(await screen.findByText("At risk")).toBeTruthy();
  });

  it("shows no progress card when the student has no season (v1)", async () => {
    useSessionStore.setState(leaderSession);
    serveLeader({ engagementError: true });
    renderWithProviders(<StudentDetailScreen />);
    expect(await screen.findByText("Group A")).toBeTruthy();
    await waitFor(() => expect(get).toHaveBeenCalledWith("/api/v1/students/21/progress"));
    await waitFor(() => expect(screen.queryByTestId("season-progress-loading")).toBeNull());
    expect(screen.queryByText("Season progress")).toBeNull();
  });
});
