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

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderStacked } from "./helpers/render";
import { NOT_ENDED, waitingRow } from "./quiz-grading-fixtures";
import QuizGradeScreen from "../../app/(app)/quiz/[id]/grade";
import { expectQuietSuccess } from "./helpers/quiet-success";

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
    ...{ canEditStructure: false, canManage: false, answersReleasedAt: null, shuffleQuestions: true },
    canReleaseResults: false,
    questions: [],
    ...{ startsFrom: null, startsUntil: null, timeLimitMinutes: null },
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
      bestScore: null,
      submittedAt: "2099-03-02T10:00:00.000Z",
      gradedByName: null,
      ...NOT_ENDED,
      answers: [
        {
          questionId: 100,
          type: "SINGLE_CHOICE",
          prompt: "Capital of France?",
          points: 2,
          pointsAwarded: 2,
          options: [
            { id: 1, label: "London", isCorrect: false },
            { id: 2, label: "Paris", isCorrect: true },
          ],
          selectedOptionId: 2,
        },
        {
          questionId: 101,
          type: "ESSAY",
          prompt: "Discuss.",
          points: 5,
          pointsAwarded: null,
          text: "Because of the river.",
          correct: null,
        },
      ],
    },
  ],
  waiting: [waitingRow(10, "Second student", null)],
  nextCursor: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(leaderSession);
});

const openRow = (name: string) => fireEvent.press(screen.getByLabelText(new RegExp(`^${name}`)));
const [baseAttempt] = attemptsPage.items as [(typeof attemptsPage.items)[number]];
const [choiceAnswer, essayAnswer] = baseAttempt.answers as [object, object];
const radios = (name: string) => screen.getAllByRole("radio", { name });
const right = () => radios("Right");
const wrong = () => radios("Wrong");
/** The essay (5 points) as a row of scores, 0 to 5. */
const essayScore = (n: number) => radios(`${n === 1 ? "1 point" : `${n} points`} of 5`)[0]!;

/** The quiz read and the attempts page; `items` replaces the page's attempts. */
function serve(items: unknown[] = attemptsPage.items, over: Partial<Record<string, unknown>> = {}) {
  get.mockImplementation((url: string) =>
    url === "/api/v1/quizzes/41"
      ? Promise.resolve({
          data: {
            data: authoring({
              kind: "ONLINE",
              maxScore: 7,
              publishedAt: "2099-02-01T00:00:00.000Z",
              attemptCount: 1,
              ...over,
            }),
          },
        })
      : Promise.resolve({ data: { data: { ...attemptsPage, items } } }),
  );
}
const withAnswers = (answers: object[], over: object = {}) => [{ ...baseAttempt, ...over, answers }];

describe("grading screen — ONLINE", () => {
  beforeEach(() => serve());

  it("lists submitted attempts, shows the key to the grader, and gives an essay part of its points", async () => {
    post.mockResolvedValue({ data: { data: baseAttempt } });

    renderStacked(<QuizGradeScreen />);
    expect(await screen.findByText("Test student")).toBeTruthy();
    expect(screen.getByText("Attempt 1 · Awaiting grading · Mar 2, 2099")).toBeTruthy();
    expect(screen.getByText("Submitted")).toBeTruthy();
    expect(screen.queryByText("Because of the river.")).toBeNull();

    openRow("Test student");
    expect(await screen.findByText("Because of the river.")).toBeTruthy();
    // R103: the grader sees what was right.
    expect(screen.getByText("Paris")).toBeTruthy();
    expect(screen.getByText("Picked, right")).toBeTruthy();
    expect(screen.getByText("2 / 2 pts")).toBeTruthy();
    expect(screen.getByText("Waiting for marking")).toBeTruthy();
    expect(screen.getByText("To mark")).toBeTruthy();
    expect(screen.getByText("0 of 1 marked")).toBeTruthy();

    expect(screen.getByText("Points, out of 5")).toBeTruthy();
    fireEvent.press(essayScore(3));
    expect(screen.getByText("1 of 1 marked")).toBeTruthy();
    fireEvent.press(screen.getByText("Save marks"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/quizzes/41/attempts/900/grade", {
        marks: [{ questionId: 101, blankId: null, points: 3 }],
      }),
    );
  });

  it("marking two of three blanks right posts three marks", async () => {
    const blanks = {
      questionId: 102,
      type: "FILL_BLANK",
      prompt: "Water is [[1]], ice is [[2]] and steam is [[3]].",
      points: 3,
      pointsAwarded: null,
      blanks: [
        { blankId: 1, position: 0, expected: "wet", text: "wet", correct: null },
        { blankId: 2, position: 1, expected: "cold", text: "cool", correct: null },
        { blankId: 3, position: 2, expected: "hot", text: "warm", correct: null },
      ],
    };
    serve(withAnswers([choiceAnswer, blanks]));
    post.mockResolvedValue({ data: { data: baseAttempt } });
    renderStacked(<QuizGradeScreen />);
    await screen.findByText("Test student");
    openRow("Test student");

    // The student's text beside the expected answer, per blank.
    expect(await screen.findByText("Student's answer: cool")).toBeTruthy();
    expect(screen.getByText("Expected: cold")).toBeTruthy();
    fireEvent.press(right()[0]!);
    fireEvent.press(right()[1]!);
    // Save waits for every blank.
    fireEvent.press(screen.getByText("Save marks"));
    expect(post).not.toHaveBeenCalled();
    expect(screen.getByText("2 of 3 marked")).toBeTruthy();
    fireEvent.press(wrong()[2]!);
    fireEvent.press(screen.getByText("Save marks"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/quizzes/41/attempts/900/grade", {
        marks: [
          { questionId: 102, blankId: 1, correct: true },
          { questionId: 102, blankId: 2, correct: true },
          { questionId: 102, blankId: 3, correct: false },
        ],
      }),
    );
  });

  it("an essay marked with part of its points shows them and can be marked again", async () => {
    serve(withAnswers([choiceAnswer, { ...essayAnswer, pointsAwarded: 3, correct: false }], { status: "GRADED" }));
    renderStacked(<QuizGradeScreen />);
    await screen.findByText("Test student");
    openRow("Test student");
    await screen.findByText("Because of the river.");
    expect(essayScore(3).props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByText("Save marks")).toBeTruthy();
    expect(screen.getByText("Allow a retake")).toBeTruthy();
  });

  it("release card says Release answers, and only to whoever may release", async () => {
    serve(attemptsPage.items, { canReleaseResults: true });
    renderStacked(<QuizGradeScreen />);
    expect(await screen.findByText("Answers")).toBeTruthy();
    expect(screen.getByText("Held")).toBeTruthy();
    fireEvent.press(screen.getByText("Release answers"));
    expect(
      await screen.findByText("Students will see every question with the right answers. This can't be undone."),
    ).toBeTruthy();
  });

  it("shows students who have not finished rather than dropping them (R102, D5)", async () => {
    renderStacked(<QuizGradeScreen />);
    expect(await screen.findByText("NOT SUBMITTED")).toBeTruthy();
    expect(screen.getByText("Second student")).toBeTruthy();
    expect(screen.getByText("Not started")).toBeTruthy();
    // Waiting rows are not pressable: nothing to open, and no Reopen to offer.
    fireEvent.press(screen.getAllByText("Second student")[0]!);
    expect(screen.queryByText("Allow a retake")).toBeNull();
    expect(screen.queryByTestId("sheet")).toBeNull();
    // A leader sees the answers are held, but has no button.
    expect(screen.getByText("Held")).toBeTruthy();
    expect(screen.queryByText("Release answers")).toBeNull();
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
                waiting: [waitingRow(10, "Second student", "2099-03-02T10:00:00.000Z")],
              },
            },
          }),
    );
    renderStacked(<QuizGradeScreen />);
    expect(await screen.findByText("In progress since Mar 2, 2099")).toBeTruthy();
    expect(screen.queryByText("Allow a retake")).toBeNull();
  });

  it("pages through the class with Load more instead of stopping at 20", async () => {
    const second = {
      ...attemptsPage,
      items: [{ ...baseAttempt, attemptId: 950, studentUserId: 30, studentName: "Page two student" }],
      waiting: [waitingRow(31, "Late student", "2099-03-02T10:00:00.000Z")],
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
    // Not-submitted rows from both pages, in the server's (name) order: page one's, then page two's.
    const order = screen.UNSAFE_root.findAll(
      (n: { props: { children?: unknown } }) => typeof n.props.children === "string",
    ).map((n: { props: { children?: unknown } }) => n.props.children as string);
    expect(order.indexOf("Second student")).toBeLessThan(order.indexOf("Late student"));
    await waitFor(() => expect(screen.queryByText("Load more")).toBeNull());
  });

  it("lets a leader reopen a graded attempt", async () => {
    serve(
      withAnswers([choiceAnswer, { ...essayAnswer, pointsAwarded: 5, correct: true }], {
        status: "GRADED",
        manualScore: 5,
        totalScore: 6.67, // shown to two places at most, like every quiz score (plan 4)
        bestScore: 6.67,
        gradedByName: "Test leader",
      }),
    );
    post.mockResolvedValue({ data: { data: { attemptId: 901, attemptNumber: 2 } } });

    renderStacked(<QuizGradeScreen />);
    expect(await screen.findByText("Attempt 1 · 6.67/7 · Mar 2, 2099")).toBeTruthy();
    expect(screen.getByText("Graded")).toBeTruthy();
    openRow("Test student");
    expect(await screen.findByText("6.67 / 7")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "5 points of 5", checked: true })).toBeTruthy();
    fireEvent.press(screen.getByText("Allow a retake"));
    expect(screen.getByText(/Give Test student a fresh attempt\?/)).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText("Allow a retake"));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/quizzes/41/attempts/reopen", {
        studentUserId: 9,
      }),
    );
  });

  it("names the right option when the student missed it", async () => {
    serve(withAnswers([{ ...choiceAnswer, selectedOptionId: 1, pointsAwarded: 0 }]));
    renderStacked(<QuizGradeScreen />);
    await screen.findByText("Test student");
    openRow("Test student");
    expect(await screen.findByText("Picked, wrong")).toBeTruthy();
    expect(screen.getByText("Correct answer, not picked")).toBeTruthy();
    expect(screen.getByText("0 / 2 pts")).toBeTruthy();
  });

  describe("attempt sheet drafts", () => {
    const axiosError = (message: string) =>
      Object.assign(new Error("400"), {
        isAxiosError: true,
        response: { status: 400, data: { error: { code: "bad_request", message } } },
      });
    const dismissSheet = () => fireEvent.press(screen.getByTestId("sheet-backdrop"));

    it("shows a failed save's message, and not again after dismiss and reopen", async () => {
      post.mockRejectedValue(axiosError("That mark is not for this attempt."));
      renderStacked(<QuizGradeScreen />);
      await screen.findByText("Test student");
      openRow("Test student");
      await screen.findByText("Because of the river.");
      fireEvent.press(essayScore(5));
      fireEvent.press(screen.getByText("Save marks"));
      expect(await screen.findByText("That mark is not for this attempt.")).toBeTruthy();

      dismissSheet();
      openRow("Test student");
      await waitFor(() => expect(screen.queryByText("That mark is not for this attempt.")).toBeNull());
    });

    it("keeps a mark across dismiss and reopen while the server's marks are unchanged", async () => {
      renderStacked(<QuizGradeScreen />);
      await screen.findByText("Test student");
      openRow("Test student");
      await screen.findByText("Because of the river.");
      fireEvent.press(essayScore(2));
      dismissSheet();
      openRow("Test student");

      expect(await screen.findByRole("radio", { name: "2 points of 5", checked: true })).toBeTruthy();
    });

    it("re-seeds from the server when the marks change after a refetch", async () => {
      post.mockResolvedValue({ data: { data: baseAttempt } });
      renderStacked(<QuizGradeScreen />);
      await screen.findByText("Test student");
      openRow("Test student");
      await screen.findByText("Because of the river.");
      fireEvent.press(essayScore(5));
      // A co-grader's 0 lands before this save's refetch.
      serve(withAnswers([choiceAnswer, { ...essayAnswer, pointsAwarded: 0, correct: false }]));
      fireEvent.press(screen.getByText("Save marks"));
      await waitFor(() => expect(post).toHaveBeenCalled());
      await expectQuietSuccess();

      openRow("Test student");
      expect(await screen.findByRole("radio", { name: "0 points of 5", checked: true })).toBeTruthy();
      expect(screen.queryByRole("radio", { name: "5 points of 5", checked: true })).toBeNull();
    });
  });
});
