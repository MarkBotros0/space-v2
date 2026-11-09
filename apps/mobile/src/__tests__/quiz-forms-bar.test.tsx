import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { ScrollView } from "react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "41" }),
  useRouter: () => ({
    push: jest.fn(),
    replace: mockReplace,
    back: jest.fn(),
    dismissTo: jest.fn(),
    dismissAll: jest.fn(),
  }),
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
  seasons: [
    {
      id: 7,
      code: "s26",
      title: "Spring 2026",
      program: "TEST",
      year: 2026,
      status: "ACTIVE",
      startDate: "2026-01-01T00:00:00.000Z",
      endDate: "2026-12-31T00:00:00.000Z",
    },
  ],
};
const mcq = {
  id: 100,
  order: 0,
  type: "MCQ" as const,
  prompt: "Capital of France?",
  points: 2,
  options: ["London", "Paris"],
  correctIndex: 1,
};
const authoring = (over: Record<string, unknown> = {}) => ({
  id: 41,
  title: "Week 1 quiz",
  kind: "ONLINE",
  seasonId: 7,
  seasonCode: "s26",
  sessionId: null,
  sessionTitle: null,
  publishedAt: null,
  maxScore: 2,
  attemptCount: 0,
  gradeCount: 0,
  canEditStructure: true,
  canManage: true,
  resultsReleasedAt: null,
  canReleaseResults: true,
  questions: [mcq],
  ...over,
});
const bar = () => within(screen.getByTestId("save-bar"));
const sheetBar = () => within(screen.getByTestId("sheet-save-bar"));
const openDetails = async () => fireEvent.press(await screen.findByLabelText("Edit quiz details"));
const conflictError = () =>
  Object.assign(new Error("409"), {
    isAxiosError: true,
    response: { status: 409, data: { error: { code: "quiz_has_grades", message: "Grades exist." } } },
  });

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
    expect(screen.getByLabelText("Max score").props.accessibilityHint).toBe("Max score is required for paper quizzes.");
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

describe("quiz builder: Publish in the footer, details in a sheet (owner, 2026-11-07)", () => {
  const HINT = "Finish the question first.";
  const refresh = () =>
    act(async () => {
      await screen.UNSAFE_getByType(ScrollView).props.refreshControl.props.onRefresh();
    });

  it("a draft's footer is Publish quiz, outside the scroll view; a paper quiz has no footer", async () => {
    get.mockResolvedValue({ data: { data: authoring() } });
    renderStacked(<QuizEditScreen />);
    await screen.findByText("Capital of France?");
    expect(within(screen.getByTestId("screen-footer")).getByText("Publish quiz")).toBeTruthy();
    expect(within(screen.UNSAFE_getByType(ScrollView)).queryByTestId("save-bar")).toBeNull();
    expect(screen.queryByText("Save changes")).toBeNull();
  });

  it("Publish is drawn disabled with its reason while a question form is open, and with no questions", async () => {
    get.mockResolvedValue({ data: { data: authoring() } });
    renderStacked(<QuizEditScreen />);
    await screen.findByText("Capital of France?");
    expect(bar().getByRole("button", { name: "Publish quiz" })).toBeEnabled();
    fireEvent.press(screen.getByLabelText("Edit question 1"));
    expect(bar().getByRole("button", { name: "Publish quiz" })).toBeDisabled();
    expect(bar().getByText(HINT)).toBeTruthy();
    fireEvent.press(screen.getByText("Cancel"));
    expect(bar().queryByText(HINT)).toBeNull();
  });

  it("an empty draft says to add a question", async () => {
    get.mockResolvedValue({ data: { data: authoring({ questions: [], maxScore: 0 }) } });
    renderStacked(<QuizEditScreen />);
    await screen.findByText("No questions yet");
    expect(bar().getByRole("button", { name: "Publish quiz" })).toBeDisabled();
    expect(bar().getByText("Add a question to publish.")).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it("a question deleted elsewhere while its form is open no longer blocks Publish (final review I2)", async () => {
    get.mockResolvedValue({ data: { data: authoring() } });
    renderStacked(<QuizEditScreen />);
    fireEvent.press(await screen.findByLabelText("Edit question 1"));
    expect(bar().getByText(HINT)).toBeTruthy();

    get.mockResolvedValue({ data: { data: authoring({ questions: [] }) } });
    await refresh();
    // With its question gone the draft is empty: the block is now "add a question", not the open form.
    await waitFor(() => expect(bar().queryByText(HINT)).toBeNull(), { timeout: 20000 });
  });

  it("closing one of two open question forms keeps Publish blocked by the other (final review I2)", async () => {
    const mcq2 = {
      ...mcq,
      id: 101,
      order: 1,
      prompt: "Capital of Spain?",
      options: ["Madrid", "Paris"],
      correctIndex: 0,
    };
    get.mockResolvedValue({ data: { data: authoring({ questions: [mcq, mcq2] }) } });
    renderStacked(<QuizEditScreen />);
    await screen.findByText("Capital of Spain?");
    fireEvent.press(screen.getByLabelText("Edit question 1"));
    fireEvent.press(screen.getByLabelText("Edit question 2"));
    fireEvent.press(screen.getAllByText("Cancel")[0] as never);
    expect(bar().getByText(HINT)).toBeTruthy();
    fireEvent.press(screen.getByText("Cancel"));
    expect(bar().queryByText(HINT)).toBeNull();
  });

  it("the details sheet saves only what changed, and says nothing to send when untouched", async () => {
    get.mockResolvedValue({
      data: { data: authoring({ kind: "PAPER", maxScore: 20, questions: [], canEditStructure: false }) },
    });
    patch.mockResolvedValue({ data: { data: { updated: true } } });
    renderStacked(<QuizEditScreen />);
    await openDetails();
    expect(sheetBar().getByText("Save")).toBeTruthy();
    fireEvent.press(sheetBar().getByText("Save"));
    expect(patch).not.toHaveBeenCalled();

    await openDetails();
    fireEvent.changeText(await screen.findByLabelText("Max score"), "30");
    fireEvent.press(sheetBar().getByText("Save"));
    await waitFor(() => expect(patch).toHaveBeenCalledWith("/api/v1/quizzes/41", { maxScore: 30 }));
  });

  it("a blank title is refused on its field in the sheet", async () => {
    get.mockResolvedValue({ data: { data: authoring() } });
    renderStacked(<QuizEditScreen />);
    await openDetails();
    fireEvent.changeText(await screen.findByLabelText("Quiz title"), "  ");
    fireEvent.press(sheetBar().getByText("Save"));
    expect(await screen.findByText("Enter a title.")).toBeTruthy();
    expect(patch).not.toHaveBeenCalled();
  });

  it("a space-only title change sends nothing", async () => {
    get.mockResolvedValue({ data: { data: authoring() } });
    renderStacked(<QuizEditScreen />);
    await openDetails();
    fireEvent.changeText(await screen.findByLabelText("Quiz title"), "Week 1 quiz  ");
    fireEvent.press(sheetBar().getByText("Save"));
    expect(patch).not.toHaveBeenCalled();
  });

  it("the server's refusal shows in the sheet's bar", async () => {
    get.mockResolvedValue({ data: { data: authoring() } });
    patch.mockRejectedValue(conflictError());
    renderStacked(<QuizEditScreen />);
    await openDetails();
    fireEvent.changeText(await screen.findByLabelText("Quiz title"), "Renamed");
    fireEvent.press(sheetBar().getByText("Save"));
    expect(await sheetBar().findByText("Grades exist.")).toBeTruthy();
  });

  it("a graded paper quiz shows Max score read-only with why, and renames with only the title", async () => {
    get.mockResolvedValue({
      data: { data: authoring({ kind: "PAPER", maxScore: 20, questions: [], gradeCount: 3, canEditStructure: false }) },
    });
    patch.mockResolvedValue({ data: { data: { updated: true } } });
    renderStacked(<QuizEditScreen />);
    await openDetails();
    fireEvent.changeText(await screen.findByLabelText("Quiz title"), "Renamed");
    expect(screen.getByLabelText("Max score").props.editable).toBe(false);
    expect(screen.getByText("Max score is locked because grades have been entered.")).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText("Max score"), "99");
    fireEvent.press(sheetBar().getByText("Save"));
    await waitFor(() => expect(patch).toHaveBeenCalledWith("/api/v1/quizzes/41", { title: "Renamed" }));
  });

  it("a published quiz has no footer; Unpublish is a pill in the summary", async () => {
    get.mockResolvedValue({ data: { data: authoring({ publishedAt: "2099-02-01T00:00:00.000Z" }) } });
    post.mockResolvedValue({ data: { data: { published: false } } });
    renderStacked(<QuizEditScreen />);
    fireEvent.press(await screen.findByLabelText("Unpublish quiz"));
    expect(screen.queryByText("Publish quiz")).toBeNull();
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/quizzes/41/publish", { publish: false }));
  });

  it("a failed refetch over cached data shows an inline error with retry above the form", async () => {
    get.mockResolvedValueOnce({ data: { data: authoring() } });
    renderStacked(<QuizEditScreen />);
    await screen.findByText("Capital of France?");
    get.mockRejectedValue(new Error("offline"));
    await refresh();
    expect(await screen.findByText("Couldn't refresh this quiz.")).toBeTruthy();
    expect(screen.getByText("Capital of France?")).toBeTruthy();
    get.mockResolvedValue({ data: { data: authoring() } });
    const callsBeforeRetry = get.mock.calls.length;
    fireEvent.press(screen.getByText("Try again"));
    expect(get.mock.calls.length).toBe(callsBeforeRetry + 1);
    // This screen renders slowly on a loaded machine (full suite beside a build), so the wait is generous.
    await waitFor(() => expect(screen.queryByText("Couldn't refresh this quiz.")).toBeNull(), { timeout: 45000 });
  }, 60000);
});
