import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));
jest.mock("../design/ui/toaster", () => ({ toast: { success: jest.fn(), error: jest.fn() }, Toaster: () => null }));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "41" }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

import { toast } from "../design/ui/toaster";
import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderStacked } from "./helpers/render";
import QuizGradeScreen from "../../app/(app)/quiz/[id]/grade";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

const quiz = {
  id: 41,
  title: "Week 1 quiz",
  kind: "ONLINE",
  seasonId: 7,
  seasonCode: "s26",
  sessionId: 12,
  sessionTitle: "Week 1",
  publishedAt: "2099-02-01T00:00:00.000Z",
  maxScore: 7,
  attemptCount: 1,
  gradeCount: 0,
  canEditStructure: false,
  canManage: false,
  answersReleasedAt: null,
  shuffleQuestions: true,
  canReleaseResults: false,
  questions: [],
  startsFrom: null,
  startsUntil: null,
  timeLimitMinutes: 20,
};

const page = (waiting: unknown[]) => ({
  id: 41,
  title: "Week 1 quiz",
  kind: "ONLINE",
  maxScore: 7,
  hasEssays: false,
  studentCount: 2,
  items: [],
  waiting,
  nextCursor: null,
});

const conflict = (code: string, message: string) =>
  Object.assign(new Error("409"), {
    isAxiosError: true,
    response: { status: 409, data: { error: { code, message } } },
  });

let attemptsServed = 0;
/** The dialog's confirm: rendered after the row's pill, which shows the same words. */
const confirmEnd = () => screen.getAllByRole("button", { name: "End attempt" }).at(-1)!;

beforeEach(() => {
  jest.clearAllMocks();
  attemptsServed = 0;
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState({
    user: { id: 5, name: "L", email: "l@jpc.test", role: "LEADER", avatarPath: null, hasPassword: true },
    scopes: { seasonAdminIds: [], groupLeaderIds: [3], activeSeasonId: null, graduationYear: null },
  });
  get.mockImplementation((url: string) => {
    if (url === "/api/v1/quizzes/41") return Promise.resolve({ data: { data: quiz } });
    attemptsServed += 1;
    return Promise.resolve({
      data: {
        data: page([
          {
            studentUserId: 10,
            studentName: "Second student",
            startedAt: "2099-03-02T10:00:00.000Z",
            endReason: null,
            endedByName: null,
            deadlineAt: null,
          },
          {
            studentUserId: 11,
            studentName: "Third student",
            startedAt: null,
            endReason: null,
            endedByName: null,
            deadlineAt: null,
          },
        ]),
      },
    });
  });
});

describe("grading screen: staff End", () => {
  it("End attempt posts and refreshes", async () => {
    post.mockResolvedValue({ data: { data: { attemptId: 900, status: "GRADED" } } });
    renderStacked(<QuizGradeScreen />);

    // Only the open attempt has the button; a student who never started has nothing to end.
    const end = await screen.findByLabelText("End Second student's attempt");
    expect(screen.queryByLabelText("End Third student's attempt")).toBeNull();
    fireEvent.press(end);

    expect(await screen.findByText("End Second student's attempt?")).toBeTruthy();
    expect(screen.getByText("Their saved answers are submitted.")).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
    fireEvent.press(confirmEnd());

    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/quizzes/41/attempts/end", { studentUserId: 10 }));
    await waitFor(() => expect(attemptsServed).toBe(2));
    expect(toast.success).toHaveBeenCalledWith("Attempt ended.");
  });

  it("shows the server's refusal and still refreshes", async () => {
    post.mockRejectedValue(conflict("attempt_closed", "This attempt is already closed."));
    renderStacked(<QuizGradeScreen />);

    fireEvent.press(await screen.findByLabelText("End Second student's attempt"));
    await screen.findByText("End Second student's attempt?");
    fireEvent.press(confirmEnd());

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("This attempt is already closed."));
    await waitFor(() => expect(attemptsServed).toBe(2));
  });
});
