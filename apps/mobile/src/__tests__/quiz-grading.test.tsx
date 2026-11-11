import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";

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
    answersReleasedAt: null,
    shuffleQuestions: true,
    canReleaseResults: false,
    questions: [],
    ...over,
  };
}

const gradeSheet = {
  id: 41,
  title: "Week 1 quiz",
  kind: "PAPER",
  maxScore: 20,
  seasonId: 7,
  sessionTitle: "Week 1",
  studentCount: 2,
  rows: [
    {
      studentUserId: 9,
      studentName: "Test student",
      groupName: "Group A",
      score: null,
      notes: null,
      gradedAt: null,
      gradedByName: null,
    },
    {
      studentUserId: 10,
      studentName: "Second student",
      groupName: "Group A",
      score: 18,
      notes: "Good.",
      gradedAt: "2099-03-02T10:00:00.000Z",
      gradedByName: "Test leader",
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(leaderSession);
});

const openRow = (name: string) => fireEvent.press(screen.getByLabelText(new RegExp(`^${name}`)));
const dismiss = () => fireEvent.press(screen.getByTestId("sheet-backdrop"));

describe("grading screen — PAPER", () => {
  beforeEach(() => {
    get.mockImplementation((url: string) =>
      url === "/api/v1/quizzes/41"
        ? Promise.resolve({ data: { data: authoring() } })
        : Promise.resolve({ data: { data: gradeSheet } }),
    );
  });

  it("lists students as rows with their mark, and the graded count in the subtitle", async () => {
    renderStacked(<QuizGradeScreen />);

    expect(await screen.findByText("Test student")).toBeTruthy();
    expect(screen.getByText("Not graded")).toBeTruthy();
    expect(screen.getByText("18 / 20")).toBeTruthy();
    expect(screen.getByText("Good.")).toBeTruthy();
    expect(screen.getByText("Week 1 · Max score: 20 · 1 / 2 graded")).toBeTruthy();
    expect(screen.queryByLabelText("Score for Test student")).toBeNull();
  });

  it("opens a sheet from a row and saves exactly that student's entry", async () => {
    post.mockResolvedValue({ data: { data: gradeSheet } });
    renderStacked(<QuizGradeScreen />);
    await screen.findByText("Test student");

    openRow("Test student");
    fireEvent.changeText(await screen.findByLabelText("Score for Test student"), "15");
    fireEvent.press(screen.getByText("Save"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/quizzes/41/grades", {
        // One entry: the open row. The other student's mark is never re-sent,
        // which would restamp gradedBy and gradedAt on marks this caller never made.
        entries: [{ studentUserId: 9, score: 15, notes: null }],
      }),
    );
    expect(post).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Saved."));
  });

  it("Save on a row nobody typed in closes without a request, graded or not (M1)", async () => {
    renderStacked(<QuizGradeScreen />);
    await screen.findByText("Test student");

    openRow("Test student");
    fireEvent.press(await screen.findByText("Save"));
    await act(async () => {});

    openRow("Second student");
    expect((await screen.findByLabelText("Score for Second student")).props.value).toBe("18");
    fireEvent.press(screen.getByText("Save"));
    await act(async () => {});
    expect(post).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("a row typed back to what the server has sends nothing either (M1)", async () => {
    renderStacked(<QuizGradeScreen />);
    await screen.findByText("Test student");
    openRow("Second student");
    const field = await screen.findByLabelText("Score for Second student");
    fireEvent.changeText(field, "17");
    fireEvent.changeText(field, "18");
    fireEvent.press(screen.getByText("Save"));
    await act(async () => {});
    expect(post).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("speaks the score as 'N of max' and 'Not graded' on the rows (M2)", async () => {
    renderStacked(<QuizGradeScreen />);
    await screen.findByText("Test student");
    expect(screen.getByLabelText(/^Second student, Good\., 18 of 20$/)).toBeTruthy();
    expect(screen.getByLabelText(/^Test student, Not graded$/)).toBeTruthy();
  });

  it("sends the typed notes with the score", async () => {
    post.mockResolvedValue({ data: { data: gradeSheet } });
    renderStacked(<QuizGradeScreen />);
    await screen.findByText("Test student");

    openRow("Test student");
    fireEvent.changeText(await screen.findByLabelText("Score for Test student"), "12");
    fireEvent.changeText(screen.getByLabelText("Notes for Test student"), "Needs work.");
    fireEvent.press(screen.getByText("Save"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/quizzes/41/grades", {
        entries: [{ studentUserId: 9, score: 12, notes: "Needs work." }],
      }),
    );
  });

  it("has one back link, the frame's pinned bar; no in-content 'Back to session' (R23)", async () => {
    renderStacked(<QuizGradeScreen />);
    expect(await screen.findByText("Test student")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Back" })).toHaveLength(1);
    expect(screen.queryByText("Back to session")).toBeNull();
  });

  it("still has the pinned back bar when the quiz has no session", async () => {
    get.mockImplementation((url: string) =>
      url === "/api/v1/quizzes/41"
        ? Promise.resolve({ data: { data: authoring({ sessionId: null, sessionTitle: null }) } })
        : Promise.resolve({ data: { data: { ...gradeSheet, sessionTitle: null } } }),
    );
    renderStacked(<QuizGradeScreen />);
    expect(await screen.findByText("Max score: 20 · 1 / 2 graded")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Back" })).toHaveLength(1);
  });

  it("clears a grade when the field is emptied", async () => {
    post.mockResolvedValue({ data: { data: gradeSheet } });
    renderStacked(<QuizGradeScreen />);
    await screen.findByText("Second student");

    openRow("Second student");
    fireEvent.changeText(await screen.findByLabelText("Score for Second student"), "");
    fireEvent.press(screen.getByText("Save"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/quizzes/41/grades", {
        entries: [{ studentUserId: 10, score: null, notes: "Good." }],
      }),
    );
  });

  it("refuses a non-whole score with a message and sends nothing", async () => {
    renderStacked(<QuizGradeScreen />);
    await screen.findByText("Test student");

    openRow("Test student");
    fireEvent.changeText(await screen.findByLabelText("Score for Test student"), "abc");
    fireEvent.press(screen.getByText("Save"));

    expect(await screen.findByText("Score for Test student must be a whole number.")).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it("keeps a typed score when the sheet is dismissed and reopened", async () => {
    renderStacked(<QuizGradeScreen />);
    await screen.findByText("Test student");

    openRow("Test student");
    fireEvent.changeText(await screen.findByLabelText("Score for Test student"), "13");
    dismiss();
    openRow("Test student");

    expect(await screen.findByDisplayValue("13")).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it("surfaces the server's over-max refusal and keeps the typed score", async () => {
    // apiErrorMessage only trusts a real axios error (isAxiosError), so the
    // fixture carries that flag like the other screens' rejection fixtures.
    post.mockRejectedValue(
      Object.assign(new Error("400"), {
        isAxiosError: true,
        response: { status: 400, data: { error: { code: "score_exceeds_max", message: "This quiz is out of 20." } } },
      }),
    );
    renderStacked(<QuizGradeScreen />);
    await screen.findByText("Test student");

    openRow("Test student");
    fireEvent.changeText(await screen.findByLabelText("Score for Test student"), "25");
    fireEvent.press(screen.getByText("Save"));

    // v1's only bound was Math.min in the form, so an above-max score was
    // silently rewritten on the way in and nobody ever saw the mistake.
    expect(await screen.findByText("This quiz is out of 20.")).toBeTruthy();
    expect(screen.getByDisplayValue("25")).toBeTruthy();
  });
});
