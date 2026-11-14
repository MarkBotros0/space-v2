import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import type { AssignmentDetail, AssignmentProgress, StudentProgress } from "@space/shared";

jest.mock("../lib/api-client", () => ({ apiClient: { get: jest.fn(), put: jest.fn(), delete: jest.fn() } }));
jest.mock("../design/ui/toaster", () => ({ toast: { success: jest.fn(), error: jest.fn() }, Toaster: () => null }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));

import { apiClient } from "../lib/api-client";
import { StudentWorkTab } from "../screens/student-detail/work-tab";
import { quizChip, stateOnly } from "../screens/student-detail/work-model";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeSession } from "./helpers/session";

const get = apiClient.get as jest.Mock;

const progress: StudentProgress = {
  seasonId: 7,
  seasonTitle: "Spring 2099",
  seasonActive: true,
  canMark: true,
  available: { attendance: true, assignments: true, quizzes: true },
  numbers: {
    attendance: { attended: 3, total: 5 },
    assignments: { submitted: 1, total: 2 },
    quizzes: { scored: 0.7, max: 1 },
  },
  assignments: [
    { id: 41, title: "Week four", dueAt: null, submitted: null, staffMark: null },
    { id: 43, title: "Week one", dueAt: null, submitted: "app", staffMark: null },
  ],
  quizzes: [
    { id: 91, title: "Quiz two", kind: "ONLINE", score: 7, maxScore: 10 },
    { id: 92, title: "Paper quiz", kind: "PAPER", score: null, maxScore: 10 },
  ],
};

const detail: AssignmentDetail = {
  id: 43,
  seasonId: 7,
  seasonCode: "s7",
  seasonTitle: "Spring 2099",
  title: "Week one",
  description: null,
  dueAt: null,
  dueOrgDay: null,
  dueOrgTime: null,
  isOverdue: false,
  reminder: { enabled: false, days: 2, anchor: "NEXT_SESSION", time: "09:00" },
  reminderLine: null,
  parts: [
    {
      id: 1,
      position: 0,
      kind: "VIDEO",
      title: "The talk",
      youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
      videoId: "dQw4w9WgXcQ",
      blockSkipping: false,
      durationSeconds: 600,
    },
    {
      id: 2,
      position: 1,
      kind: "ESSAY",
      prompt: "<p>Reflect</p>",
      minWords: null,
      maxWords: null,
      maxFileSizeMb: null,
      allowedMimeCategories: [],
    },
  ],
  my: null,
  canManage: false,
  readOnly: false,
};

const assignmentProgress: AssignmentProgress = {
  canMark: true,
  rows: [
    {
      studentUserId: 21,
      name: "Sara Student",
      avatarPath: null,
      submittedAt: "2099-03-01T10:00:00.000Z",
      staffMark: null,
      parts: [
        {
          partId: 1,
          kind: "VIDEO",
          status: "DONE",
          video: { watchedSeconds: 600, durationSeconds: 600, answered: 0, questionCount: 0, correct: 0 },
        },
        {
          partId: 2,
          kind: "ESSAY",
          status: "DONE",
          essay: { publicId: "ess-1", wordCount: 120, reviewStatus: "SUBMITTED", feedback: null },
        },
      ],
    },
  ],
};

function serve() {
  get.mockImplementation((url: string) => {
    if (url === "/api/v1/students/21/progress") return Promise.resolve({ data: { data: progress } });
    if (url === "/api/v1/assignments/43") return Promise.resolve({ data: { data: detail } });
    if (url === "/api/v1/assignments/43/progress") return Promise.resolve({ data: { data: assignmentProgress } });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("LEADER"));
});

describe("work-model", () => {
  it("a part's chip keeps only its state", () => {
    expect(stateOnly("Essay 2: waiting review")).toBe("Waiting review");
    expect(stateOnly("Video 6/18 min")).toBe("Video 6/18 min");
  });

  it("a quiz says its marks and percent, or that it has no score yet", () => {
    expect(quizChip(progress.quizzes[0]!)).toEqual({ tone: "ok", label: "7 / 10 · 70%" });
    expect(quizChip(progress.quizzes[1]!)).toEqual({ tone: "neutral", label: "No score yet" });
  });
});

describe("StudentWorkTab (owner 2026-11-14: the essay lives inside its assignment)", () => {
  it("lists the season's assignments and quizzes, each saying what the student did", async () => {
    serve();
    renderWithProviders(<StudentWorkTab studentId={21} studentName="Sara Student" />);
    expect(await screen.findByText("ASSIGNMENTS (2)")).toBeTruthy();
    expect(screen.getByText("QUIZZES (2)")).toBeTruthy();
    expect(screen.getByText("Not submitted")).toBeTruthy();
    expect(screen.getByText("Submitted")).toBeTruthy();
    expect(screen.getByText("7 / 10 · 70%")).toBeTruthy();
    expect(screen.getByText("No score yet")).toBeTruthy();
  });

  it("an assignment opens a pop-up with its parts, and the handed-in essay opens for review", async () => {
    serve();
    renderWithProviders(<StudentWorkTab studentId={21} studentName="Sara Student" />);
    fireEvent.press(await screen.findByText("Week one"));
    expect(await screen.findByText("The talk")).toBeTruthy();
    expect(screen.getByText("Part 1 · Video")).toBeTruthy();
    expect(screen.getByText("Watched")).toBeTruthy();
    expect(screen.getByText("Reflect")).toBeTruthy();
    expect(screen.getByText("Waiting review")).toBeTruthy();
    fireEvent.press(screen.getByText("Reflect"));
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({ pathname: "/submission/[publicId]", params: { publicId: "ess-1" } }),
    );
  });

  it("a quiz opens a pop-up with its score and the way to a better one", async () => {
    serve();
    renderWithProviders(<StudentWorkTab studentId={21} studentName="Sara Student" />);
    fireEvent.press(await screen.findByText("Quiz two"));
    expect(await screen.findByText("Allow a retake")).toBeTruthy();
    fireEvent.press(screen.getByText("Allow a retake"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/quiz/[id]/grade", params: { id: "91" } });
  });
});
