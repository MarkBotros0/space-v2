import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "41" }),
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import NewQuizScreen from "../../app/(app)/quiz/new";
import QuizEditScreen from "../../app/(app)/quiz/[id]/edit";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;
const patch = apiClient.patch as jest.Mock;
const put = apiClient.put as jest.Mock;
const del = apiClient.delete as jest.Mock;

const adminSession = {
  user: { id: 2, name: "Test admin", email: "a@jpc.test", role: "ADMIN" as const, avatarPath: null, hasPassword: true },
  scopes: { seasonAdminIds: [7], groupLeaderIds: [], activeSeasonId: null, graduationYear: null },
};
const leaderSession = {
  user: { id: 5, name: "Test leader", email: "l@jpc.test", role: "LEADER" as const, avatarPath: null, hasPassword: true },
  scopes: { seasonAdminIds: [], groupLeaderIds: [3], activeSeasonId: null, graduationYear: null },
};

const seasonsList = {
  data: { data: { seasons: [{
    id: 7, code: "s26", title: "Spring 2026", program: "TEST", year: 2026, status: "ACTIVE",
    startDate: "2026-01-01T00:00:00.000Z", endDate: "2026-12-31T00:00:00.000Z",
  }] } },
};
const sessionsList = {
  data: { data: { sessions: [{
    id: 12, title: "Week 1", startsAt: "2099-03-01T18:00:00.000Z", dayKey: "2099-03-01",
    startTime: "20:00", // required since Plan 6 (org wall-clock start, X13)
    durationMinutes: 60, location: null, recurrenceGroupId: null, attendanceMarked: false,
    seasonId: 7, seasonCode: "s26", seasonTitle: "Spring 2026",
    checkInToken: null, checkInOpenAt: null, checkInClosedAt: null,
  }] } },
};

const mcq = {
  id: 100, order: 0, type: "MCQ" as const, prompt: "Capital of France?", points: 2,
  options: ["London", "Paris"], correctIndex: 1,
};
const essay = {
  id: 101, order: 1, type: "ESSAY" as const, prompt: "Discuss.", points: 5,
  options: [] as string[], correctIndex: null,
};

function authoring(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 41, title: "Week 1 quiz", kind: "ONLINE", seasonId: 7, seasonCode: "s26",
    sessionId: 12, sessionTitle: "Week 1", publishedAt: null, maxScore: 7,
    attemptCount: 0, gradeCount: 0, canEditStructure: true, canManage: true,
    questions: [mcq, essay], ...over,
  };
}

const conflict = (code: string, message: string) =>
  Object.assign(new Error("409"), {
    isAxiosError: true,
    response: { status: 409, data: { error: { code, message } } },
  });

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("NewQuizScreen", () => {
  beforeEach(() => {
    useSessionStore.setState(adminSession);
    get.mockImplementation((url: string) =>
      url === "/api/v1/seasons"
        ? Promise.resolve(seasonsList)
        : url === "/api/v1/seasons/7/sessions"
          ? Promise.resolve(sessionsList)
          : Promise.reject(new Error(`unexpected GET ${url}`)),
    );
  });

  it("creates an ONLINE quiz on a session in the current season and opens the builder", async () => {
    post.mockResolvedValue({ data: { data: { id: 77 } } });
    renderWithProviders(<NewQuizScreen />);

    fireEvent.changeText(await screen.findByLabelText("Title"), "Week 3 quiz");
    fireEvent.press(screen.getByText("Online"));
    fireEvent.press(await screen.findByText("Week 1"));
    fireEvent.press(screen.getByText("Create & add questions"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/quizzes", {
        seasonId: 7, sessionId: 12, title: "Week 3 quiz", kind: "ONLINE",
      }),
    );
    expect(mockReplace).toHaveBeenCalledWith({ pathname: "/quiz/[id]/edit", params: { id: "77" } });
  });

  it("creates a PAPER quiz with v1's default max score and opens its grade sheet", async () => {
    post.mockResolvedValue({ data: { data: { id: 78 } } });
    renderWithProviders(<NewQuizScreen />);

    fireEvent.changeText(await screen.findByLabelText("Title"), "Paper quiz");
    fireEvent.press(screen.getByText("Create quiz"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/quizzes", {
        seasonId: 7, sessionId: null, title: "Paper quiz", kind: "PAPER", maxScore: 100,
      }),
    );
    expect(mockReplace).toHaveBeenCalledWith({ pathname: "/quiz/[id]/grade", params: { id: "78" } });
  });

  it("refuses a PAPER quiz with no max score before calling the API", async () => {
    renderWithProviders(<NewQuizScreen />);

    fireEvent.changeText(await screen.findByLabelText("Title"), "Paper quiz");
    fireEvent.changeText(screen.getByLabelText("Max score"), "");
    fireEvent.press(screen.getByText("Create quiz"));

    expect(await screen.findByText("Max score is required for paper quizzes.")).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it("is not available to a leader and fetches nothing", async () => {
    useSessionStore.setState(leaderSession);
    get.mockReset();
    renderWithProviders(<NewQuizScreen />);
    expect(await screen.findByText("Not available")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });
});

describe("QuizEditScreen (the builder)", () => {
  beforeEach(() => {
    useSessionStore.setState(adminSession);
  });

  it("lists questions in order with the answer key", async () => {
    get.mockResolvedValue({ data: { data: authoring() } });
    renderWithProviders(<QuizEditScreen />);

    expect(await screen.findByText("1. Capital of France?")).toBeTruthy();
    expect(screen.getByText("2. Discuss.")).toBeTruthy();
    expect(screen.getByText("Correct answer: Paris")).toBeTruthy();
    expect(screen.getByText("Draft · 7 points")).toBeTruthy();
  });

  it("adds an MCQ through the editor and sends exactly the form's question", async () => {
    get.mockResolvedValue({ data: { data: authoring() } });
    post.mockResolvedValue({
      data: { data: { id: 102, order: 2, type: "MCQ", prompt: "2 + 2?", points: 2, options: ["3", "4"], correctIndex: 1 } },
    });
    renderWithProviders(<QuizEditScreen />);

    fireEvent.press(await screen.findByText("Add question"));
    fireEvent.changeText(screen.getByLabelText("Question prompt"), "2 + 2?");
    fireEvent.changeText(screen.getByLabelText("Points"), "2");
    fireEvent.changeText(screen.getByLabelText("Option 1"), "3");
    fireEvent.changeText(screen.getByLabelText("Option 2"), "4");
    fireEvent.press(screen.getByLabelText("Mark option 2 correct"));
    fireEvent.press(screen.getByText("Save question"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/quizzes/41/questions", {
        type: "MCQ", prompt: "2 + 2?", points: 2, options: ["3", "4"], correctIndex: 1,
      }),
    );
  });

  it("refuses an MCQ with no correct answer marked, locally, with the schema's message", async () => {
    get.mockResolvedValue({ data: { data: authoring() } });
    renderWithProviders(<QuizEditScreen />);

    fireEvent.press(await screen.findByText("Add question"));
    fireEvent.changeText(screen.getByLabelText("Question prompt"), "2 + 2?");
    fireEvent.changeText(screen.getByLabelText("Option 1"), "3");
    fireEvent.changeText(screen.getByLabelText("Option 2"), "4");
    fireEvent.press(screen.getByText("Save question"));

    expect(await screen.findByText("Mark the correct answer.")).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it("edits a question in place", async () => {
    get.mockResolvedValue({ data: { data: authoring() } });
    patch.mockResolvedValue({ data: { data: { ...mcq, prompt: "Capital of Italy?" } } });
    renderWithProviders(<QuizEditScreen />);

    fireEvent.press(await screen.findByLabelText("Edit question 1"));
    fireEvent.changeText(screen.getByLabelText("Question prompt"), "Capital of Italy?");
    fireEvent.press(screen.getByText("Save question"));

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/quizzes/41/questions/100", {
        type: "MCQ", prompt: "Capital of Italy?", points: 2, options: ["London", "Paris"], correctIndex: 1,
      }),
    );
  });

  it("reorders by sending the full permutation", async () => {
    get.mockResolvedValue({ data: { data: authoring() } });
    put.mockResolvedValue({ data: { data: { questions: [{ ...essay, order: 0 }, { ...mcq, order: 1 }] } } });
    renderWithProviders(<QuizEditScreen />);

    fireEvent.press(await screen.findByLabelText("Move question 2 up"));

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith("/api/v1/quizzes/41/questions/order", { questionIds: [101, 100] }),
    );
  });

  it("deletes only on a second, confirming press", async () => {
    get.mockResolvedValue({ data: { data: authoring() } });
    del.mockResolvedValue({ data: { data: { deleted: true } } });
    renderWithProviders(<QuizEditScreen />);

    fireEvent.press(await screen.findByLabelText("Delete question 1"));
    expect(del).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText("Really delete question 1"));
    await waitFor(() => expect(del).toHaveBeenCalledWith("/api/v1/quizzes/41/questions/100"));
  });

  it("publishes, and shows the server's refusal verbatim", async () => {
    get.mockResolvedValue({ data: { data: authoring() } });
    post.mockRejectedValue(conflict("mcq_without_answer", "Every multiple-choice question needs a correct answer."));
    renderWithProviders(<QuizEditScreen />);

    fireEvent.press(await screen.findByText("Publish"));

    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/quizzes/41/publish", { publish: true }));
    expect(await screen.findByText("Every multiple-choice question needs a correct answer.")).toBeTruthy();
  });

  it("locks the structure once a student has started (canEditStructure: false — spec D3)", async () => {
    get.mockResolvedValue({
      data: { data: authoring({ canEditStructure: false, attemptCount: 1, publishedAt: "2099-02-01T00:00:00.000Z" }) },
    });
    renderWithProviders(<QuizEditScreen />);

    expect(await screen.findByText("Students have started this quiz, so its questions can no longer change.")).toBeTruthy();
    expect(screen.queryByText("Add question")).toBeNull();
    expect(screen.queryByLabelText("Edit question 1")).toBeNull();
    expect(screen.queryByLabelText("Move question 2 up")).toBeNull();
    // Publishing state can still change; D4's guard is the server's.
    expect(screen.getByText("Unpublish")).toBeTruthy();
  });

  it("renames a PAPER quiz and shows no question builder", async () => {
    get.mockResolvedValue({
      data: { data: authoring({ kind: "PAPER", maxScore: 20, questions: [], canEditStructure: false }) },
    });
    patch.mockResolvedValue({ data: { data: { updated: true } } });
    renderWithProviders(<QuizEditScreen />);

    expect(await screen.findByText("This is a paper quiz — it has no questions. Grade it from the grade sheet.")).toBeTruthy();
    expect(screen.queryByText("Add question")).toBeNull();
    fireEvent.changeText(screen.getByLabelText("Quiz title"), "Renamed");
    fireEvent.press(screen.getByText("Save title"));
    await waitFor(() => expect(patch).toHaveBeenCalledWith("/api/v1/quizzes/41", { title: "Renamed" }));
  });

  it("is not available to a leader and fetches nothing", async () => {
    useSessionStore.setState(leaderSession);
    renderWithProviders(<QuizEditScreen />);
    expect(await screen.findByText("Not available")).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });
});
