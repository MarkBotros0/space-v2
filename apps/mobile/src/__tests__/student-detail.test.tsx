import { fireEvent, screen } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn() },
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

    expect(await screen.findByText("Sara Student")).toBeTruthy();
    expect(screen.getByText(/\+20 100 000 0000/)).toBeTruthy();
    expect(screen.getByText("Watch attendance")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("/api/v1/students/21");
  });

  it("renders enrollment history with the status label and drop reason", async () => {
    useSessionStore.setState(superSession);
    get.mockResolvedValue({ data: { data: { ...base, profile: internalProfile } } });

    renderWithProviders(<StudentDetailScreen />);

    expect(await screen.findByText("Spring 2099")).toBeTruthy();
    expect(screen.getByText(/Dropped/)).toBeTruthy();
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

    expect(await screen.findByText("Sara Student")).toBeTruthy();
    expect(screen.queryByText("Watch attendance")).toBeNull();
    expect(screen.queryByText(/\+20 100 000 0000/)).toBeNull();
  });

  it("fails loudly when the server leaks a withheld field to a narrow role", async () => {
    useSessionStore.setState(mentorSession);
    // A server bug serving the INTERNAL payload to a mentor: the public arm
    // is .strict(), so the parse throws and the screen shows its error state
    // instead of quietly rendering someone's personal data.
    get.mockResolvedValue({ data: { data: { ...base, profile: internalProfile } } });

    renderWithProviders(<StudentDetailScreen />);

    expect(await screen.findByText(/Couldn't load this student/)).toBeTruthy();
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

    expect(await screen.findByText("83% attendance")).toBeTruthy();
    expect(await screen.findByText("Week 4 · Late")).toBeTruthy();
    expect(await screen.findByText("Essay one · Submitted · Late")).toBeTruthy();

    fireEvent.press(screen.getByText("Essay one · Submitted · Late"));
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
    await screen.findByText("Sara Student");
    expect(get).not.toHaveBeenCalledWith("/api/v1/students/21/attendance");
    expect(get).not.toHaveBeenCalledWith("/api/v1/students/21/submissions");
    expect(screen.queryByText(/% attendance/)).toBeNull();
  });
});
