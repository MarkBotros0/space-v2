import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));
jest.mock("../design/ui/toaster", () => ({ toast: { success: jest.fn(), error: jest.fn() }, Toaster: () => null }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "41" }),
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));

import { toast } from "../design/ui/toaster";
import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderStacked } from "./helpers/render";
import QuizGradeScreen from "../../app/(app)/quiz/[id]/grade";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

const leaderSession = {
  user: {
    id: 5,
    name: "Test leader",
    email: "l@jpc.test",
    role: "LEADER" as const,
    avatarPath: null,
    hasPassword: true,
  },
  scopes: { seasonAdminIds: [], groupLeaderIds: [3], activeSeasonId: null, graduationYear: null },
};

function authoring(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 41,
    title: "Week 1 quiz",
    kind: "PAPER",
    seasonId: 7,
    seasonCode: "s26",
    sessionId: 12,
    sessionTitle: "Week 1",
    publishedAt: null,
    maxScore: 20,
    attemptCount: 0,
    gradeCount: 0,
    canEditStructure: false,
    canManage: false,
    resultsReleasedAt: null,
    canReleaseResults: false,
    questions: [],
    ...over,
  };
}

const attemptsPage = {
  id: 41,
  title: "Online quiz",
  kind: "ONLINE",
  maxScore: 7,
  hasEssays: true,
  studentCount: 2,
  items: [
    {
      attemptId: 900,
      studentUserId: 9,
      studentName: "Test student",
      attemptNumber: 1,
      status: "SUBMITTED",
      autoScore: 2,
      manualScore: null,
      totalScore: null,
      submittedAt: "2099-03-02T10:00:00.000Z",
      gradedByName: null,
      answers: [
        {
          questionId: 100,
          type: "MCQ",
          prompt: "Capital of France?",
          points: 2,
          options: ["London", "Paris"],
          correctIndex: 1,
          selectedIndex: 1,
          isCorrect: true,
          text: null,
          pointsAwarded: 2,
        },
        {
          questionId: 101,
          type: "ESSAY",
          prompt: "Discuss.",
          points: 5,
          options: [],
          correctIndex: null,
          selectedIndex: null,
          isCorrect: null,
          text: "Because of the river.",
          pointsAwarded: null,
        },
      ],
    },
  ],
  waiting: [{ studentUserId: 10, studentName: "Second student", startedAt: null }],
  nextCursor: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(leaderSession);
});

const openRow = (name: string) => fireEvent.press(screen.getByLabelText(new RegExp(`^${name}`)));

describe("grading screen — ONLINE", () => {
  beforeEach(() => {
    get.mockImplementation((url: string) =>
      url === "/api/v1/quizzes/41"
        ? Promise.resolve({
            data: {
              data: authoring({
                kind: "ONLINE",
                maxScore: 7,
                publishedAt: "2099-02-01T00:00:00.000Z",
                attemptCount: 1,
              }),
            },
          })
        : Promise.resolve({ data: { data: attemptsPage } }),
    );
  });

  it("lists submitted attempts, shows the key to the grader, and marks essays", async () => {
    post.mockResolvedValue({ data: { data: { attemptId: 900 } } });

    renderStacked(<QuizGradeScreen />);

    expect(await screen.findByText("Test student")).toBeTruthy();
    expect(screen.getByText("Attempt 1 · Awaiting grading · Mar 2, 2099")).toBeTruthy();
    expect(screen.getByText("Submitted")).toBeTruthy();
    expect(screen.queryByText("Because of the river.")).toBeNull();

    openRow("Test student");
    expect(await screen.findByText("Because of the river.")).toBeTruthy();
    // R103: the grader sees what was right. This is the audience the answer key
    // exists for — and the student contract has no field to carry it.
    // v1 names the right option only when the student missed it.
    expect(screen.getByText("Paris")).toBeTruthy();
    expect(screen.getByText("2/2")).toBeTruthy();
    expect(screen.queryByText(/correct:/)).toBeNull();

    fireEvent.changeText(screen.getByLabelText("Marks for Discuss."), "4");
    fireEvent.press(screen.getByText("Save marks"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/quizzes/41/attempts/900/grade", {
        awards: [{ questionId: 101, points: 4 }],
      }),
    );
  });

  it("shows students who have not finished rather than dropping them (R102, D5)", async () => {
    renderStacked(<QuizGradeScreen />);

    expect(await screen.findByText("WAITING")).toBeTruthy();
    expect(screen.getByText("Second student")).toBeTruthy();
    expect(screen.getByText("Not started")).toBeTruthy();
    // Waiting rows are not pressable: nothing to open, and no Reopen to offer.
    fireEvent.press(screen.getAllByText("Second student")[0]!);
    expect(screen.queryByText("Reopen retake")).toBeNull();
    expect(screen.queryByTestId("sheet")).toBeNull();
  });

  it("offers no Reopen for a student whose attempt is still open (server: 409 attempt_open)", async () => {
    get.mockImplementation((url: string) =>
      url === "/api/v1/quizzes/41"
        ? Promise.resolve({
            data: { data: authoring({ kind: "ONLINE", maxScore: 7, publishedAt: "2099-02-01T00:00:00.000Z" }) },
          })
        : Promise.resolve({
            data: {
              data: {
                ...attemptsPage,
                items: [],
                waiting: [{ studentUserId: 10, studentName: "Second student", startedAt: "2099-03-02T10:00:00.000Z" }],
              },
            },
          }),
    );
    renderStacked(<QuizGradeScreen />);

    expect(await screen.findByText("In progress since Mar 2, 2099")).toBeTruthy();
    expect(screen.queryByText("Reopen retake")).toBeNull();
  });

  it("pages through the class with Load more instead of stopping at 20", async () => {
    const second = {
      ...attemptsPage,
      items: [{ ...attemptsPage.items[0]!, attemptId: 950, studentUserId: 30, studentName: "Page two student" }],
      waiting: [{ studentUserId: 31, studentName: "Late student", startedAt: "2099-03-02T10:00:00.000Z" }],
      nextCursor: null,
    };
    get.mockImplementation((url: string) =>
      url === "/api/v1/quizzes/41"
        ? Promise.resolve({
            data: { data: authoring({ kind: "ONLINE", maxScore: 7, publishedAt: "2099-02-01T00:00:00.000Z" }) },
          })
        : url === "/api/v1/quizzes/41/attempts"
          ? Promise.resolve({ data: { data: { ...attemptsPage, nextCursor: 20 } } })
          : url === "/api/v1/quizzes/41/attempts?cursor=20"
            ? Promise.resolve({ data: { data: second } })
            : Promise.reject(new Error(`unexpected GET ${url}`)),
    );
    renderStacked(<QuizGradeScreen />);

    expect(await screen.findByText("Test student")).toBeTruthy();
    expect(screen.queryByText("Page two student")).toBeNull();
    fireEvent.press(screen.getByText("Load more"));

    expect(await screen.findByText("Page two student")).toBeTruthy();
    expect(screen.getByText("Test student")).toBeTruthy();
    // Waiting rows from both pages, the in-progress one ahead of never-started.
    const order = screen.UNSAFE_root.findAll(
      (n: { props: { children?: unknown } }) => typeof n.props.children === "string",
    ).map((n: { props: { children?: unknown } }) => n.props.children as string);
    expect(order.indexOf("Late student")).toBeLessThan(order.indexOf("Second student"));
    await waitFor(() => expect(screen.queryByText("Load more")).toBeNull());
  });

  it("lets a leader reopen a graded attempt", async () => {
    get.mockImplementation((url: string) =>
      url === "/api/v1/quizzes/41"
        ? Promise.resolve({
            data: {
              data: authoring({
                kind: "ONLINE",
                maxScore: 7,
                publishedAt: "2099-02-01T00:00:00.000Z",
                attemptCount: 1,
              }),
            },
          })
        : Promise.resolve({
            data: {
              data: {
                ...attemptsPage,
                items: [
                  {
                    ...attemptsPage.items[0],
                    status: "GRADED",
                    manualScore: 4,
                    totalScore: 6,
                    gradedByName: "Test leader",
                  },
                ],
              },
            },
          }),
    );
    post.mockResolvedValue({ data: { data: { attemptId: 901, attemptNumber: 2 } } });

    renderStacked(<QuizGradeScreen />);

    expect(await screen.findByText("Attempt 1 · 6/7 · Mar 2, 2099")).toBeTruthy();
    expect(screen.getByText("Graded")).toBeTruthy();
    openRow("Test student");
    expect(await screen.findByText("Save marks")).toBeTruthy();
    fireEvent.press(screen.getByText("Reopen retake"));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/quizzes/41/attempts/reopen", {
        studentUserId: 9,
      }),
    );
  });

  it("names the right option when the student missed it (v1)", async () => {
    const wrong = {
      ...attemptsPage,
      items: [
        {
          ...attemptsPage.items[0]!,
          answers: [{ ...attemptsPage.items[0]!.answers[0]!, selectedIndex: 0, isCorrect: false, pointsAwarded: 0 }],
        },
      ],
    };
    get.mockImplementation((url: string) =>
      url === "/api/v1/quizzes/41"
        ? Promise.resolve({
            data: { data: authoring({ kind: "ONLINE", maxScore: 7, publishedAt: "2099-02-01T00:00:00.000Z" }) },
          })
        : Promise.resolve({ data: { data: wrong } }),
    );
    renderStacked(<QuizGradeScreen />);
    await screen.findByText("Test student");
    openRow("Test student");
    expect(await screen.findByText("London (correct: Paris)")).toBeTruthy();
    expect(screen.getByText(" (correct: Paris)")).toBeTruthy();
    expect(screen.getByText("0/2")).toBeTruthy();
  });

  describe("attempt sheet drafts", () => {
    const axiosError = (message: string) =>
      Object.assign(new Error("400"), {
        isAxiosError: true,
        response: { status: 400, data: { error: { code: "bad_request", message } } },
      });
    const dismissSheet = () => fireEvent.press(screen.getByTestId("sheet-backdrop"));

    it("shows a failed save's message, and not again after dismiss and reopen", async () => {
      post.mockRejectedValue(axiosError("Marks are out of range."));
      renderStacked(<QuizGradeScreen />);
      await screen.findByText("Test student");

      openRow("Test student");
      fireEvent.changeText(await screen.findByLabelText("Marks for Discuss."), "9");
      fireEvent.press(screen.getByText("Save marks"));
      expect(await screen.findByText("Marks are out of range.")).toBeTruthy();

      dismissSheet();
      openRow("Test student");
      await waitFor(() => expect(screen.queryByText("Marks are out of range.")).toBeNull());
    });

    it("keeps a typed award across dismiss and reopen while the server's value is unchanged", async () => {
      renderStacked(<QuizGradeScreen />);
      await screen.findByText("Test student");

      openRow("Test student");
      fireEvent.changeText(await screen.findByLabelText("Marks for Discuss."), "3");
      dismissSheet();
      openRow("Test student");

      expect(await screen.findByDisplayValue("3")).toBeTruthy();
    });

    it("re-seeds from the server when the awarded points change after a refetch", async () => {
      post.mockResolvedValue({ data: { data: attemptsPage.items[0] } });
      renderStacked(<QuizGradeScreen />);
      await screen.findByText("Test student");

      openRow("Test student");
      fireEvent.changeText(await screen.findByLabelText("Marks for Discuss."), "3");
      // A co-grader's 4 lands before this save's refetch.
      const coGraded = {
        ...attemptsPage,
        items: [
          {
            ...attemptsPage.items[0]!,
            answers: [attemptsPage.items[0]!.answers[0]!, { ...attemptsPage.items[0]!.answers[1]!, pointsAwarded: 4 }],
          },
        ],
      };
      get.mockImplementation((url: string) =>
        url === "/api/v1/quizzes/41"
          ? Promise.resolve({
              data: { data: authoring({ kind: "ONLINE", maxScore: 7, publishedAt: "2099-02-01T00:00:00.000Z" }) },
            })
          : Promise.resolve({ data: { data: coGraded } }),
      );
      fireEvent.press(screen.getByText("Save marks"));
      await waitFor(() => expect(post).toHaveBeenCalled());
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Marks saved."));

      openRow("Test student");
      expect(await screen.findByDisplayValue("4")).toBeTruthy();
      expect(screen.queryByDisplayValue("3")).toBeNull();
    });
  });
});
