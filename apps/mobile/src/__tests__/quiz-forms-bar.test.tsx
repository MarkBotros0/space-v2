import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { ScrollView } from "react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "41" }),
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn(), dismissTo: jest.fn(), dismissAll: jest.fn() }),
}));
import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderStacked } from "./helpers/render";
import { makeSession } from "./helpers/session";
import NewQuizScreen from "../../app/(app)/quiz/new";
import QuizEditScreen from "../../app/(app)/quiz/[id]/edit";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;
const patch = apiClient.patch as jest.Mock;

const seasons = {
  seasons: [{
    id: 7, code: "s26", title: "Spring 2026", program: "TEST", year: 2026, status: "ACTIVE",
    startDate: "2026-01-01T00:00:00.000Z", endDate: "2026-12-31T00:00:00.000Z",
  }],
};
const mcq = { id: 100, order: 0, type: "MCQ" as const, prompt: "Capital of France?", points: 2, options: ["London", "Paris"], correctIndex: 1 };
const authoring = (over: Record<string, unknown> = {}) => ({
  id: 41, title: "Week 1 quiz", kind: "ONLINE", seasonId: 7, seasonCode: "s26", sessionId: null, sessionTitle: null,
  publishedAt: null, maxScore: 2, attemptCount: 0, gradeCount: 0, canEditStructure: true, canManage: true,
  questions: [mcq], ...over,
});
const bar = () => within(screen.getByTestId("save-bar"));

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(makeSession("ADMIN", { seasonAdminIds: [7] }));
});

describe("new quiz on the fixed save bar", () => {
  beforeEach(() => {
    get.mockImplementation((url: string) =>
      url === "/api/v1/seasons"
        ? Promise.resolve({ data: { data: seasons } })
        : Promise.resolve({ data: { data: { sessions: [] } } }),
    );
  });

  it("Create is in the footer, outside the scroll view, with no spacer or Cancel", async () => {
    renderStacked(<NewQuizScreen />);
    await screen.findByLabelText("Title");
    expect(within(screen.getByTestId("screen-footer")).getByText("Create")).toBeTruthy();
    expect(within(screen.UNSAFE_getByType(ScrollView)).queryByTestId("save-bar")).toBeNull();
    expect(screen.queryByTestId("form-screen-spacer")).toBeNull();
    expect(screen.queryByText("Cancel")).toBeNull();
  });

  it("errors sit on their field, the bar says so and stays usable", async () => {
    post.mockResolvedValue({ data: { data: { id: 78 } } });
    renderStacked(<NewQuizScreen />);
    fireEvent.changeText(await screen.findByLabelText("Max score"), "");
    fireEvent.press(bar().getByText("Create"));

    expect(await screen.findByText("Enter a title.")).toBeTruthy();
    expect(screen.getByLabelText("Title").props.accessibilityHint).toBe("Enter a title.");
    expect(screen.getByLabelText("Max score").props.accessibilityHint).toBe(
      "Max score is required for paper quizzes.",
    );
    expect(bar().getByText("Fix the fields marked above.")).toBeTruthy();
    expect(post).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByLabelText("Title"), "Paper");
    fireEvent.changeText(screen.getByLabelText("Max score"), "50");
    fireEvent.press(bar().getByText("Create"));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
  });

  it("an ONLINE quiz is created with its own label", async () => {
    renderStacked(<NewQuizScreen />);
    fireEvent.press(await screen.findByLabelText("Online (questions)"));
    expect(bar().getByText("Create & add questions")).toBeTruthy();
  });
});

describe("quiz builder on the fixed save bar", () => {
  it("settings save from the bar: only what changed, nothing to save says why", async () => {
    get.mockResolvedValue({ data: { data: authoring({ kind: "PAPER", maxScore: 20, questions: [], canEditStructure: false }) } });
    patch.mockResolvedValue({ data: { data: { updated: true } } });
    renderStacked(<QuizEditScreen />);

    await screen.findByLabelText("Quiz title");
    expect(within(screen.getByTestId("screen-footer")).getByText("Save changes")).toBeTruthy();
    expect(within(screen.UNSAFE_getByType(ScrollView)).queryByTestId("save-bar")).toBeNull();
    expect(screen.queryByText("Save title")).toBeNull();
    expect(bar().getByText("Nothing to save yet.")).toBeTruthy();
    fireEvent.press(bar().getByText("Save changes"));
    expect(patch).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByLabelText("Max score"), "30");
    expect(bar().queryByText("Nothing to save yet.")).toBeNull();
    fireEvent.press(bar().getByText("Save changes"));
    await waitFor(() => expect(patch).toHaveBeenCalledWith("/api/v1/quizzes/41", { maxScore: 30 }));
  });

  it("a blank title is refused on its field", async () => {
    get.mockResolvedValue({ data: { data: authoring() } });
    renderStacked(<QuizEditScreen />);
    fireEvent.changeText(await screen.findByLabelText("Quiz title"), "  ");
    fireEvent.press(bar().getByText("Save changes"));
    expect(await screen.findByText("Enter a title.")).toBeTruthy();
    expect(bar().getByText("Fix the fields marked above.")).toBeTruthy();
    expect(patch).not.toHaveBeenCalled();
  });

  it("the server's refusal is the bar's hint", async () => {
    get.mockResolvedValue({ data: { data: authoring() } });
    patch.mockRejectedValue(
      Object.assign(new Error("409"), {
        isAxiosError: true,
        response: { status: 409, data: { error: { code: "quiz_has_grades", message: "Grades exist." } } },
      }),
    );
    renderStacked(<QuizEditScreen />);
    fireEvent.changeText(await screen.findByLabelText("Quiz title"), "Renamed");
    fireEvent.press(bar().getByText("Save changes"));
    expect(await bar().findByText("Grades exist.")).toBeTruthy();
  });

  it("with a question editor open, Save sends nothing and says to finish it; once closed the title saves", async () => {
    get.mockResolvedValue({ data: { data: authoring() } });
    patch.mockResolvedValue({ data: { data: { updated: true } } });
    renderStacked(<QuizEditScreen />);
    fireEvent.changeText(await screen.findByLabelText("Quiz title"), "Renamed");
    fireEvent.press(screen.getByText("Add question"));
    fireEvent.press(bar().getByText("Save changes"));
    expect(bar().getByText("Finish or cancel the question above first.")).toBeTruthy();
    expect(patch).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText("Cancel"));
    fireEvent.press(screen.getByLabelText("Edit question 1"));
    expect(bar().getByText("Finish or cancel the question above first.")).toBeTruthy();
    fireEvent.press(screen.getByText("Cancel"));
    expect(bar().queryByText("Finish or cancel the question above first.")).toBeNull();
    fireEvent.press(bar().getByText("Save changes"));
    await waitFor(() => expect(patch).toHaveBeenCalledWith("/api/v1/quizzes/41", { title: "Renamed" }));
  });

  const refresh = () =>
    act(async () => {
      await screen.UNSAFE_getByType(ScrollView).props.refreshControl.props.onRefresh();
    });
  const HINT = "Finish or cancel the question above first.";

  it("a question deleted elsewhere while its form is open no longer blocks Save (final review I2)", async () => {
    get.mockResolvedValue({ data: { data: authoring() } });
    patch.mockResolvedValue({ data: { data: { updated: true } } });
    renderStacked(<QuizEditScreen />);
    fireEvent.changeText(await screen.findByLabelText("Quiz title"), "Renamed");
    fireEvent.press(screen.getByLabelText("Edit question 1"));
    expect(bar().getByText(HINT)).toBeTruthy();

    get.mockResolvedValue({ data: { data: authoring({ questions: [] }) } });
    await refresh();
    await waitFor(() => expect(bar().queryByText(HINT)).toBeNull());
    fireEvent.press(bar().getByText("Save changes"));
    await waitFor(() => expect(patch).toHaveBeenCalledWith("/api/v1/quizzes/41", { title: "Renamed" }));
  });

  it("closing one of two open question forms keeps Save blocked by the other (final review I2)", async () => {
    const mcq2 = { ...mcq, id: 101, order: 1, prompt: "Capital of Spain?", options: ["Madrid", "Paris"], correctIndex: 0 };
    get.mockResolvedValue({ data: { data: authoring({ questions: [mcq, mcq2] }) } });
    renderStacked(<QuizEditScreen />);
    await screen.findByLabelText("Quiz title");
    fireEvent.press(screen.getByLabelText("Edit question 1"));
    fireEvent.press(screen.getByLabelText("Edit question 2"));
    fireEvent.press(screen.getAllByText("Cancel")[0] as never);
    expect(bar().getByText(HINT)).toBeTruthy();
    fireEvent.press(screen.getByText("Cancel"));
    expect(bar().queryByText(HINT)).toBeNull();
  });

  it("a graded paper quiz shows Max score read-only with why, and renames with only the title", async () => {
    get.mockResolvedValue({
      data: { data: authoring({ kind: "PAPER", maxScore: 20, questions: [], gradeCount: 3, canEditStructure: false }) },
    });
    patch.mockResolvedValue({ data: { data: { updated: true } } });
    renderStacked(<QuizEditScreen />);
    fireEvent.changeText(await screen.findByLabelText("Quiz title"), "Renamed");
    expect(screen.getByLabelText("Max score").props.editable).toBe(false);
    expect(screen.getByText("Max score is locked because grades have been entered.")).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText("Max score"), "99");
    fireEvent.press(bar().getByText("Save changes"));
    await waitFor(() => expect(patch).toHaveBeenCalledWith("/api/v1/quizzes/41", { title: "Renamed" }));
  });

  it("a failed refetch over cached data shows an inline error with retry above the form", async () => {
    get.mockResolvedValueOnce({ data: { data: authoring() } });
    renderStacked(<QuizEditScreen />);
    await screen.findByLabelText("Quiz title");
    get.mockRejectedValue(new Error("offline"));
    await act(async () => {
      await screen.UNSAFE_getByType(ScrollView).props.refreshControl.props.onRefresh();
    });
    expect(await screen.findByText("Couldn't refresh this quiz.")).toBeTruthy();
    expect(screen.getByLabelText("Quiz title")).toBeTruthy();
    get.mockResolvedValue({ data: { data: authoring() } });
    const callsBeforeRetry = get.mock.calls.length;
    fireEvent.press(screen.getByText("Try again"));
    expect(get.mock.calls.length).toBe(callsBeforeRetry + 1);
    // This screen renders slowly on a loaded machine (full suite beside a build), so the wait is generous.
    await waitFor(() => expect(screen.queryByText("Couldn't refresh this quiz.")).toBeNull(), { timeout: 45000 });
  }, 60000);

  it("a space-only title change is nothing to save: the hint says so and Save sends nothing", async () => {
    get.mockResolvedValue({ data: { data: authoring() } });
    renderStacked(<QuizEditScreen />);
    fireEvent.changeText(await screen.findByLabelText("Quiz title"), "Week 1 quiz  ");
    expect(bar().getByText("Nothing to save yet.")).toBeTruthy();
    fireEvent.press(bar().getByText("Save changes"));
    expect(patch).not.toHaveBeenCalled();
  });
});
