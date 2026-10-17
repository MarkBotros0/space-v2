import { fireEvent, screen, waitFor } from "@testing-library/react-native";

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
const superSession = {
  user: { id: 1, name: "Test super", email: "sup@jpc.test", role: "SUPER" as const, avatarPath: null, hasPassword: true },
  scopes: emptyScopes,
};
const mentorSession = {
  user: { id: 2, name: "Test mentor", email: "men@jpc.test", role: "MENTOR" as const, avatarPath: null, hasPassword: true },
  scopes: emptyScopes,
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
  university: "Cairo University",
  year: "3rd",
  gifts: null,
  activeSeasonId: 7,
  activeSeasonTitle: "Spring 2099",
  activeSeasonCode: "S99",
};
const internalProfile = {
  ...publicProfile,
  phone: "+20 100 000 0000",
  dateOfBirth: null,
  spiritualBackground: null,
  notes: "Watch attendance",
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("StudentDetailScreen", () => {
  it("renders identity, internal notes and phone for SUPER", async () => {
    useSessionStore.setState(superSession);
    get.mockResolvedValue({ data: { data: { ...base, profile: internalProfile } } });

    renderWithProviders(<StudentDetailScreen />);

    expect((await screen.findAllByText("Sara Student")).length).toBeGreaterThan(0);
    // v1's hero Call button, and the Profile tab's phone and internal notes.
    expect(screen.getByText("Call")).toBeTruthy();
    expect(screen.getByText("+20 100 000 0000")).toBeTruthy();
    expect(screen.getByText("Watch attendance")).toBeTruthy();
    expect(screen.getByText("Staff only — the student never receives this field.")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/students/21");
  });

  it("renders enrollment history with the status label and drop reason", async () => {
    useSessionStore.setState(superSession);
    get.mockResolvedValue({ data: { data: { ...base, profile: internalProfile } } });

    renderWithProviders(<StudentDetailScreen />);

    fireEvent.press(await screen.findByText("Seasons"));
    expect((await screen.findAllByText("Spring 2099")).length).toBeGreaterThan(0);
    expect(screen.getByText("Dropped")).toBeTruthy();
    expect(screen.getByText("Moved away")).toBeTruthy();
  });

  it("shows no notes or phone to MENTOR — the public arm has no such fields", async () => {
    useSessionStore.setState(mentorSession);
    // The mentor arm's payload: dropReason nulled, profile is the public cut.
    get.mockResolvedValue({
      data: {
        data: {
          ...base,
          enrollments: [{ ...enrollment, dropReason: null }],
          profile: publicProfile,
        },
      },
    });

    renderWithProviders(<StudentDetailScreen />);

    expect((await screen.findAllByText("Sara Student")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Watch attendance")).toBeNull();
    expect(screen.queryByText(/\+20 100 000 0000/)).toBeNull();
    expect(screen.queryByText("Call")).toBeNull();
  });

  it("fails loudly when the server leaks a withheld field to a narrow role", async () => {
    useSessionStore.setState(mentorSession);
    // A server bug serving the INTERNAL payload to a mentor: the public arm
    // is .strict(), so the parse throws and the screen shows its error state
    // instead of quietly rendering someone's personal data.
    get.mockResolvedValue({ data: { data: { ...base, profile: internalProfile } } });

    renderWithProviders(<StudentDetailScreen />);

    expect(await screen.findByText("Something went wrong")).toBeTruthy();
  });
});

describe("StudentDetailScreen history (REG-83)", () => {
  const ok = (data: unknown) => Promise.resolve({ data: { data } });
  function serve(session: typeof superSession) {
    useSessionStore.setState(session);
    get.mockImplementation((url: string) => {
      if (url === "/api/v1/students/21")
        return ok({ ...base, enrollments: [{ ...enrollment, attendancePct: 83 }], profile: internalProfile });
      if (url === "/api/v1/students/21/attendance")
        return ok({
          history: [
            { sessionId: 1, sessionTitle: "Week 4", startsAt: "2099-04-01T16:00:00.000Z", seasonId: 7, seasonTitle: "Spring 2099", status: "LATE" },
          ],
        });
      if (url === "/api/v1/students/21/submissions")
        return ok({
          submissions: [
            { publicId: "abc123defg", assignmentId: 41, assignmentTitle: "Essay one", status: "SUBMITTED", isLate: true,
              submittedAt: "2099-04-02T10:00:00.000Z", reviewedAt: null, seasonId: 7, seasonTitle: "Spring 2099" },
          ],
        });
      if (url.includes("/engagement") || url.includes("/notes")) return Promise.reject(new Error("skip"));
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
  }

  it("shows the enrolment percentage, attendance history and submissions to staff", async () => {
    serve(superSession);
    renderWithProviders(<StudentDetailScreen />);

    // Each tab fetches when it opens (spec 06 §9).
    fireEvent.press(await screen.findByText("Seasons"));
    expect(await screen.findByText("83% attendance")).toBeTruthy();
    fireEvent.press(screen.getByText("Attendance"));
    expect(await screen.findByText("Week 4")).toBeTruthy();
    expect(screen.getByText("Late")).toBeTruthy();
    fireEvent.press(screen.getByText("Submissions"));
    fireEvent.press(await screen.findByText("Essay one"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/submission/[publicId]", params: { publicId: "abc123defg" } });
  });

  it("never asks a student's own record for the staff-only history", async () => {
    const studentSession = {
      user: { id: 21, name: "Sara Student", email: "sara@jpc.test", role: "STUDENT" as const, avatarPath: null, hasPassword: true },
      scopes: { ...emptyScopes, activeSeasonId: 7 },
    };
    useSessionStore.setState(studentSession);
    get.mockResolvedValue({
      data: { data: { ...base, profile: { ...publicProfile, phone: null, dateOfBirth: null, spiritualBackground: null } } },
    });
    renderWithProviders(<StudentDetailScreen />);
    await screen.findAllByText("Sara Student");
    expect(screen.queryByText("Attendance")).toBeNull();
    expect(get).not.toHaveBeenCalledWith("/api/v1/students/21/attendance");
    expect(get).not.toHaveBeenCalledWith("/api/v1/students/21/submissions");
    expect(screen.queryByText(/% attendance/)).toBeNull();
  });
});

describe("StudentDetailScreen — LEADER (v1 /leader/students/[id], B3-15)", () => {
  const leaderSession = {
    user: { id: 5, name: "Test leader", email: "lead@jpc.test", role: "LEADER" as const, avatarPath: null, hasPassword: true },
    scopes: { ...emptyScopes, groupLeaderIds: [3] },
  };
  const post = (apiClient as unknown as { post: jest.Mock }).post;
  const engagement = {
    score: 75, attendancePct: 50, submissionPct: 100, attendancePresent: 2, attendanceTotal: 4,
    submissionsCompleted: 2, submissionsExpected: 2, studentUserId: 21, seasonId: 7, seasonTitle: "Spring 2099", atRisk: false,
  };
  function serveLeader(over: { engagementError?: boolean } = {}) {
    get.mockImplementation((url: string) => {
      if (url === "/api/v1/students/21")
        return Promise.resolve({ data: { data: { ...base, enrollments: [{ ...enrollment, status: "ACTIVE", dropReason: null, droppedAt: null, attendancePct: 83 }], profile: publicProfile } } });
      if (url === "/api/v1/students/21/engagement")
        return over.engagementError
          ? Promise.reject(Object.assign(new Error("404"), { isAxiosError: true, response: { status: 404, data: { error: { code: "no_season", message: "x" } } } }))
          : Promise.resolve({ data: { data: engagement } });
      if (url === "/api/v1/students/21/submissions")
        return Promise.resolve({ data: { data: { submissions: [{ publicId: "abc123defg", assignmentId: 41, assignmentTitle: "Essay one", status: "SUBMITTED", isLate: false, submittedAt: "2099-03-02T10:00:00.000Z", reviewedAt: null, seasonId: 7, seasonTitle: "Spring 2099" }] } } });
      if (url.startsWith("/api/v1/students/21/notes")) return Promise.resolve({ data: { data: { notes: [], nextCursor: null } } });
      if (url === "/api/v1/students/21/attendance") return Promise.resolve({ data: { data: { history: [] } } });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
  }
  const requested = () => get.mock.calls.map(([u]) => u as string);

  it("shows v1's leader header and hero without the fields a leader doesn't receive", async () => {
    useSessionStore.setState(leaderSession);
    serveLeader();
    renderWithProviders(<StudentDetailScreen />);
    expect(await screen.findByText("sara@jpc.test · leader view")).toBeTruthy();
    expect(screen.getByText("Email")).toBeTruthy();
    expect(screen.queryByText("Call")).toBeNull();
    expect(screen.queryByText("Phone")).toBeNull();
    expect(screen.queryByText("Date of birth")).toBeNull();
    for (const label of ["University", "Year / faculty", "Gifts / interests"]) expect(screen.getByText(label)).toBeTruthy();
    expect(await screen.findByText("Engagement (current season)")).toBeTruthy();
    expect(screen.getByText("75%")).toBeTruthy();
    expect(screen.getByText("Attendance: 2/4 (50%)")).toBeTruthy();
  });

  it("fetches a tab's data only when the tab opens (spec 06 §9)", async () => {
    useSessionStore.setState(leaderSession);
    serveLeader();
    renderWithProviders(<StudentDetailScreen />);
    expect(await screen.findByText("sara@jpc.test · leader view")).toBeTruthy();
    expect(requested().some((u) => u.endsWith("/submissions") || u.endsWith("/attendance") || u.includes("/notes"))).toBe(false);

    fireEvent.press(screen.getByText("Submissions"));
    expect(await screen.findByText("Essay one")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/students/21/submissions");
    fireEvent.press(screen.getByText("Essay one"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/submission/[publicId]", params: { publicId: "abc123defg" } });

    fireEvent.press(screen.getByText("Seasons"));
    expect(await screen.findByText("83% attendance")).toBeTruthy();
  });

  it("writes a note with v1's composer: visibility, follow-up flag, and the empty-note check", async () => {
    useSessionStore.setState(leaderSession);
    serveLeader();
    post.mockResolvedValue({ data: { data: { note: { id: 1 } } } });
    renderWithProviders(<StudentDetailScreen />);
    fireEvent.press(await screen.findByText("Notes"));
    expect(await screen.findByText("No notes yet")).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText("Note"), "x");
    fireEvent.press(screen.getByText("Add note"));
    expect(await screen.findByText("Note can't be empty.")).toBeTruthy();
    expect(post).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByLabelText("Note"), "Prayed together after the session.");
    fireEvent.press(screen.getByLabelText("Visible to"));
    fireEvent.press(await screen.findByText("Admins only"));
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

  it("shows no engagement card when the student has no season (v1)", async () => {
    useSessionStore.setState(leaderSession);
    serveLeader({ engagementError: true });
    renderWithProviders(<StudentDetailScreen />);
    expect(await screen.findByText("sara@jpc.test · leader view")).toBeTruthy();
    await waitFor(() => expect(get).toHaveBeenCalledWith("/api/v1/students/21/engagement"));
    expect(screen.queryByText("Engagement (current season)")).toBeNull();
  });
});
