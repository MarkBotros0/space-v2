import { fireEvent, screen } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));
jest.mock("../design/ui/toaster", () => ({ toast: { success: jest.fn(), error: jest.fn() }, Toaster: () => null }));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "41" }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { formatSessionTime } from "../lib/format";
import { useSessionStore } from "../store/session";
import { endReasonLine, exitLogLines } from "../screens/quiz-grade/exit-log-model";
import { renderStacked } from "./helpers/render";
import QuizGradeScreen from "../../app/(app)/quiz/[id]/grade";

const get = apiClient.get as jest.Mock;

const LEFT_1 = "2099-03-02T10:14:00.000Z";
const LEFT_2 = "2099-03-02T10:20:00.000Z";
const LEFT_3 = "2099-03-02T10:25:00.000Z";
const at = (iso: string) => formatSessionTime(iso);

const events = [
  { kind: "EXIT", leftAt: LEFT_1, returnedAt: "2099-03-02T10:14:42.000Z" },
  { kind: "SCREENSHOT", leftAt: LEFT_2, returnedAt: null },
  { kind: "RELAUNCH", leftAt: LEFT_2, returnedAt: "2099-03-02T10:22:05.000Z" },
  { kind: "EXIT", leftAt: LEFT_3, returnedAt: null },
] as const;

describe("exit log model", () => {
  it("one line per event, each exit with how long the student was away", () => {
    expect(exitLogLines([...events], "ENDED_BY_EXITS")).toEqual([
      `Left ${at(LEFT_1)} · away 0:42`,
      `Screenshot ${at(LEFT_2)}`,
      `Closed the app ${at(LEFT_2)} · away 2:05`,
      `Left ${at(LEFT_3)} · ended the attempt`,
    ]);
  });

  it("an exit never reported back, on an attempt still running or ended otherwise", () => {
    expect(exitLogLines([events[3]], null)).toEqual([`Left ${at(LEFT_3)} · didn't come back`]);
  });

  it("how the attempt ended", () => {
    expect(endReasonLine("SUBMITTED", null)).toBe("Submitted");
    expect(endReasonLine("TIMED_OUT", null)).toBe("Timed out");
    expect(endReasonLine("ENDED_BY_EXITS", null)).toBe("Ended · left the quiz");
    expect(endReasonLine("ENDED_BY_STAFF", "Test leader")).toBe("Ended by Test leader");
    expect(endReasonLine("ENDED_BY_STAFF", null)).toBe("Ended by staff");
    expect(endReasonLine(null, null)).toBeNull();
  });
});

describe("attempt sheet: exit log", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSessionStore.setState(useSessionStore.getInitialState(), true);
    useSessionStore.setState({
      user: { id: 5, name: "L", email: "l@jpc.test", role: "LEADER", avatarPath: null, hasPassword: true },
      scopes: { seasonAdminIds: [], groupLeaderIds: [3], activeSeasonId: null, graduationYear: null },
    });
  });

  const serve = (attempt: Record<string, unknown>) =>
    get.mockImplementation((url: string) =>
      Promise.resolve({
        data: {
          data:
            url === "/api/v1/quizzes/41"
              ? {
                  id: 41,
                  title: "Week 1 quiz",
                  kind: "ONLINE",
                  ...{ seasonId: 7, seasonCode: "s26", sessionId: 12, sessionTitle: "Week 1" },
                  publishedAt: "2099-02-01T00:00:00.000Z",
                  ...{ maxScore: 2, attemptCount: 1, gradeCount: 0, canEditStructure: false, canManage: false },
                  ...{ answersReleasedAt: null, shuffleQuestions: true, canReleaseResults: false, questions: [] },
                  ...{ startsFrom: null, startsUntil: null, timeLimitMinutes: 20 },
                }
              : {
                  ...{ id: 41, title: "Week 1 quiz", kind: "ONLINE", maxScore: 2, hasEssays: false, studentCount: 1 },
                  items: [
                    {
                      ...{ attemptId: 900, studentUserId: 9, studentName: "Test student", attemptNumber: 1 },
                      ...{ status: "GRADED", autoScore: 2, manualScore: null, totalScore: 2, bestScore: 2 },
                      ...{ submittedAt: LEFT_3, gradedByName: null, endedByName: null, deadlineAt: null },
                      answers: [],
                      ...attempt,
                    },
                  ],
                  waiting: [],
                  nextCursor: null,
                },
        },
      }),
    );

  it("exit log lists each exit with duration, and how it ended", async () => {
    serve({ endReason: "ENDED_BY_EXITS", events: [...events] });
    renderStacked(<QuizGradeScreen />);
    fireEvent.press(await screen.findByLabelText(/^Test student/));

    expect(await screen.findByText("Exit log")).toBeTruthy();
    expect(screen.getByText(`Left ${at(LEFT_1)} · away 0:42`)).toBeTruthy();
    expect(screen.getByText(`Closed the app ${at(LEFT_2)} · away 2:05`)).toBeTruthy();
    expect(screen.getByText(`Left ${at(LEFT_3)} · ended the attempt`)).toBeTruthy();
    expect(screen.getByText("Ended · left the quiz")).toBeTruthy();
  });

  it("an attempt that never left says so", async () => {
    serve({ endReason: "SUBMITTED", events: [] });
    renderStacked(<QuizGradeScreen />);
    fireEvent.press(await screen.findByLabelText(/^Test student/));

    expect(await screen.findByText("Exit log")).toBeTruthy();
    expect(screen.getByText("Never left the quiz")).toBeTruthy();
    expect(screen.getByText("Submitted")).toBeTruthy();
  });
});
