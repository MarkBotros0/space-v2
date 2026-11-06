import { ScrollView } from "react-native";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "21" }),
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));
jest.mock("../design/ui/toaster", () => ({ toast: { success: jest.fn(), error: jest.fn() }, Toaster: () => null }));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

import StudentDetailScreen from "../../app/(app)/student/[id]/index";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

const enrollment = {
  enrollmentId: 500,
  seasonId: 7,
  seasonCode: "S99",
  seasonTitle: "Spring 2099",
  seasonStatus: "ACTIVE" as const,
  startDate: "2099-01-01T00:00:00.000Z",
  endDate: "2099-12-31T00:00:00.000Z",
  groupName: "Group A",
  status: "ACTIVE" as const,
  enrolledAt: "2099-01-01T00:00:00.000Z",
  completedAt: null,
  droppedAt: null,
  dropReason: null,
  attendancePct: 83,
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
  faculty: "Engineering",
  universityGraduationYear: 2027,
  activeSeasonId: 7,
  activeSeasonTitle: "Spring 2099",
  activeSeasonCode: "S99",
};
const engagement = {
  score: 75, attendancePct: 50, submissionPct: 100, attendancePresent: 2, attendanceTotal: 4,
  submissionsCompleted: 2, submissionsExpected: 2, studentUserId: 21, seasonId: 7, seasonTitle: "Spring 2099", atRisk: true,
};
const mentorNote = {
  id: 1, body: "Checked in about the essay", visibility: "MENTORS", followUpFlagged: true,
  createdAt: "2099-02-01T10:00:00.000Z", updatedAt: "2099-02-01T10:00:00.000Z", edited: false,
  authorId: 2, authorName: "Mina Mentor", authorRole: "MENTOR", seasonId: 7, seasonTitle: "Spring 2099", canEdit: true,
};

const ok = (data: unknown) => Promise.resolve({ data: { data } });
function serveMentor() {
  get.mockImplementation((url: string) => {
    if (url === "/api/v1/students/21") return ok({ ...base, profile: publicProfile });
    if (url === "/api/v1/students/21/engagement") return ok(engagement);
    if (url === "/api/v1/students/21/attendance")
      return ok({ history: [{ sessionId: 1, sessionTitle: "Week 4", startsAt: "2099-04-01T16:00:00.000Z", seasonId: 7, seasonTitle: "Spring 2099", status: "LATE" }] });
    if (url === "/api/v1/students/21/submissions")
      return ok({ submissions: [{ publicId: "abc123defg", assignmentId: 41, assignmentTitle: "Essay one", status: "SUBMITTED", isLate: false, submittedAt: "2099-03-02T10:00:00.000Z", reviewedAt: null, seasonId: 7, seasonTitle: "Spring 2099" }] });
    if (url.startsWith("/api/v1/students/21/notes")) return ok({ notes: [mentorNote], nextCursor: null });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("StudentDetailScreen — MENTOR (v1 /mentor/students/[id])", () => {
  beforeEach(() => {
    useSessionStore.setState(makeSession("MENTOR"));
    serveMentor();
  });

  it("is the grouped page: name and email in the title, chips, tiles and the five tabs", async () => {
    renderWithProviders(<StudentDetailScreen />);
    expect(await screen.findByText("sara@jpc.test")).toBeTruthy();
    expect(screen.getAllByText("Sara Student").length).toBeGreaterThan(0);
    expect(screen.getByText("Spring 2099")).toBeTruthy();
    expect(screen.getByText("Group A")).toBeTruthy();
    expect(screen.getByText("Email")).toBeTruthy();
    for (const tab of ["Profile", "Seasons", "Attendance", "Submissions", "Notes"]) {
      expect(screen.getByText(tab)).toBeTruthy();
    }
    expect(screen.getByText("Cairo University")).toBeTruthy();
    expect(await screen.findByText("Attendance 2/4")).toBeTruthy();
    expect(screen.getByText("At risk")).toBeTruthy();
    // The legacy page's card heading.
    expect(screen.queryByText("Engagement (current season)")).toBeNull();
  });

  it("keeps the loaded page when a background refresh fails", async () => {
    renderWithProviders(<StudentDetailScreen />);
    await screen.findByText("sara@jpc.test");
    let refused = false;
    get.mockImplementation(() => {
      refused = true;
      return Promise.reject(new Error("offline"));
    });
    await act(async () => {
      await screen.UNSAFE_getByType(ScrollView).props.refreshControl.props.onRefresh();
    });
    await waitFor(() => expect(refused).toBe(true));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.getByText("sara@jpc.test")).toBeTruthy();
    expect(screen.queryByText("Try again")).toBeNull();
  });

  it("offers no action a mentor doesn't have, and no field the public arm doesn't carry", async () => {
    renderWithProviders(<StudentDetailScreen />);
    await screen.findByText("sara@jpc.test");
    for (const action of ["Edit profile", "Graduate", "Delete student", "Call"]) {
      expect(screen.queryByText(action)).toBeNull();
    }
    expect(screen.queryByText("Phone")).toBeNull();
    fireEvent.press(screen.getByText("Seasons"));
    expect(await screen.findByText("83% attendance")).toBeTruthy();
    expect(screen.getByText(/Jan 1, 2099 – Dec 31, 2099/)).toBeTruthy();
    expect(screen.queryByText("Drop")).toBeNull();
  });

  it("opens attendance and a submission as before", async () => {
    renderWithProviders(<StudentDetailScreen />);
    fireEvent.press(await screen.findByText("Attendance"));
    expect(await screen.findByText("Week 4")).toBeTruthy();
    fireEvent.press(screen.getByText("Submissions"));
    const essay = await screen.findByText("Essay one");
    expect(essay.props.numberOfLines).toBe(2);
    expect(screen.getByText(/submitted Mar 2, 2099/).props.numberOfLines).toBeUndefined();
    fireEvent.press(essay);
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/submission/[publicId]", params: { publicId: "abc123defg" } });
  });

  it("reads only the notes the server returns, and says who may see each", async () => {
    renderWithProviders(<StudentDetailScreen />);
    fireEvent.press(await screen.findByText("Notes"));
    expect(await screen.findByText("Checked in about the essay")).toBeTruthy();
    expect(screen.getByText(/Visible to mentors only/)).toBeTruthy();
    expect(screen.getByText("Follow up")).toBeTruthy();
    expect(get).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/v1\/students\/21\/notes/));
  });

  const openSheet = async () => {
    post.mockResolvedValue({ data: { data: { note: { id: 2 } } } });
    renderWithProviders(<StudentDetailScreen />);
    fireEvent.press(await screen.findByText("Notes"));
    await screen.findByText("Checked in about the essay");
    fireEvent.press(screen.getByText("Write a note"));
  };

  it("opens the note sheet on Mentors, and again on Mentors after a note is saved", async () => {
    await openSheet();
    post.mockResolvedValue({ data: { data: { note: mentorNote } } });
    const selected = (name: string) => screen.getByRole("tab", { name }).props.accessibilityState?.selected;
    expect(selected("Mentors")).toBe(true);
    expect(selected("Leaders")).toBe(false);
    for (const name of ["Leaders", "Mentors", "Admins only"]) {
      expect(screen.getByRole("tab", { name })).toBeTruthy();
    }
    fireEvent.changeText(await screen.findByLabelText("Note"), "Prayed together.");
    fireEvent.press(screen.getByRole("tab", { name: "Admins only" }));
    fireEvent.press(screen.getByText("Add note"));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    // Saved and dismissed; the sheet resets to the role's default, not the last choice.
    await waitFor(() => expect(screen.getByLabelText("Note").props.value).toBe(""));
    expect(selected("Mentors")).toBe(true);
    expect(selected("Admins only")).toBe(false);
  });

  it("sends MENTORS when the mentor keeps the default", async () => {
    await openSheet();
    post.mockResolvedValue({ data: { data: { note: mentorNote } } });
    fireEvent.changeText(await screen.findByLabelText("Note"), "Prayed together.");
    fireEvent.press(screen.getByText("Add note"));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0]![1]).toEqual(expect.objectContaining({ visibility: "MENTORS" }));
  });

  it("writes a note visible to mentors, flagged for follow-up", async () => {
    await openSheet();
    fireEvent.changeText(await screen.findByLabelText("Note"), "For mentors, flagged.");
    fireEvent.press(screen.getByRole("tab", { name: "Mentors" }));
    fireEvent.press(screen.getByLabelText("Flag for admin follow-up"));
    fireEvent.press(screen.getByText("Add note"));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/students/21/notes", {
        body: "For mentors, flagged.",
        visibility: "MENTORS",
        followUpFlagged: true,
      }),
    );
  });
});

describe("StudentDetailScreen — STUDENT on their own record", () => {
  it("keeps Profile and Seasons, with mail and call, and asks no staff endpoint", async () => {
    useSessionStore.setState(makeSession("STUDENT", { activeSeasonId: 7 }, { id: 21 }));
    get.mockImplementation((url: string) =>
      url === "/api/v1/students/21"
        ? ok({ ...base, profile: { ...publicProfile, phone: "+20 100", dateOfBirth: null } })
        : Promise.reject(new Error(`unexpected GET ${url}`)),
    );
    renderWithProviders(<StudentDetailScreen />);

    expect(await screen.findByText("sara@jpc.test")).toBeTruthy();
    expect(screen.getByText("Profile")).toBeTruthy();
    expect(screen.getByText("Seasons")).toBeTruthy();
    expect(screen.getByText("Call")).toBeTruthy();
    expect(screen.getByText("+20 100")).toBeTruthy();
    for (const hidden of ["Attendance", "Submissions", "Notes", "Write a note", "Attendance 2/4"]) {
      expect(screen.queryByText(hidden)).toBeNull();
    }
    expect(get.mock.calls.map(([u]) => u)).toEqual(["/api/v1/students/21"]);
  });
});
