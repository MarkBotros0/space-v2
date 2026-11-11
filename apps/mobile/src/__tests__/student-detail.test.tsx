import { fireEvent, screen } from "@testing-library/react-native";

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
  user: {
    id: 1,
    name: "Test super",
    email: "sup@jpc.test",
    role: "SUPER" as const,
    avatarPath: null,
    hasPassword: true,
  },
  scopes: emptyScopes,
};
const mentorSession = {
  user: {
    id: 2,
    name: "Test mentor",
    email: "men@jpc.test",
    role: "MENTOR" as const,
    avatarPath: null,
    hasPassword: true,
  },
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
  phone: "+20 100 000 0000",
  university: "Cairo University",
  faculty: "Engineering",
  universityGraduationYear: 2027,
  activeSeasonId: 7,
  activeSeasonTitle: "Spring 2099",
  activeSeasonCode: "S99",
};
const internalProfile = {
  ...publicProfile,
  dateOfBirth: null,
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
    expect(screen.getByText("Internal notes · staff only")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/students/21");
  });

  it("renders enrollment history with the status label and drop reason", async () => {
    useSessionStore.setState(superSession);
    get.mockResolvedValue({ data: { data: { ...base, profile: internalProfile } } });

    renderWithProviders(<StudentDetailScreen />);

    fireEvent.press(await screen.findByText("Seasons"));
    expect((await screen.findAllByText("Spring 2099")).length).toBeGreaterThan(0);
    expect(screen.getByText("Dropped")).toBeTruthy();
    // Meta lines join through one subtitle now.
    expect(screen.getByText(/Moved away/)).toBeTruthy();
  });

  it("shows MENTOR the phone with Call, but no internal notes — the public arm has no such field", async () => {
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
    expect(screen.getByText("+20 100 000 0000")).toBeTruthy();
    expect(screen.getByLabelText("Call +20 100 000 0000")).toBeTruthy();
    expect(screen.queryByText("Internal notes · staff only")).toBeNull();
    expect(screen.queryByText("Date of birth")).toBeNull();
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
            {
              sessionId: 1,
              sessionTitle: "Week 4",
              startsAt: "2099-04-01T16:00:00.000Z",
              seasonId: 7,
              seasonTitle: "Spring 2099",
              status: "LATE",
            },
          ],
        });
      if (url === "/api/v1/students/21/submissions")
        return ok({
          submissions: [
            {
              publicId: "abc123defg",
              assignmentId: 41,
              assignmentTitle: "Essay one",
              status: "SUBMITTED",
              isLate: true,
              submittedAt: "2099-04-02T10:00:00.000Z",
              reviewedAt: null,
              seasonId: 7,
              seasonTitle: "Spring 2099",
            },
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
    expect(await screen.findByText(/83% attendance/)).toBeTruthy();
    fireEvent.press(screen.getByText("Attendance"));
    expect(await screen.findByText("Week 4")).toBeTruthy();
    expect(screen.getAllByText("Late").length).toBeGreaterThan(0);
    fireEvent.press(screen.getByText("Submissions"));
    fireEvent.press(await screen.findByText("Essay one"));
    // A history row is the whole Submission, not one essay: it opens the assignment's progress.
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/assignment/[id]", params: { id: "41" } });
  });

  it("never asks a student's own record for the staff-only history", async () => {
    const studentSession = {
      user: {
        id: 21,
        name: "Sara Student",
        email: "sara@jpc.test",
        role: "STUDENT" as const,
        avatarPath: null,
        hasPassword: true,
      },
      scopes: { ...emptyScopes, activeSeasonId: 7 },
    };
    useSessionStore.setState(studentSession);
    get.mockResolvedValue({
      data: { data: { ...base, profile: { ...publicProfile, phone: null, dateOfBirth: null } } },
    });
    renderWithProviders(<StudentDetailScreen />);
    await screen.findAllByText("Sara Student");
    expect(screen.queryByText("Attendance")).toBeNull();
    expect(get).not.toHaveBeenCalledWith("/api/v1/students/21/attendance");
    expect(get).not.toHaveBeenCalledWith("/api/v1/students/21/submissions");
    expect(screen.queryByText(/% attendance/)).toBeNull();
  });
});
