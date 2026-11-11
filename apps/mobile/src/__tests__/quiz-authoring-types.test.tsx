import { fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "41" }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { adminSession, authoring } from "./helpers/quiz-authoring-fixtures";
import QuizEditScreen from "../../app/(app)/quiz/[id]/edit";

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;
const patch = apiClient.patch as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(adminSession);
});

describe("QuizEditScreen, question types and the shuffle switch", () => {
  it("creates a matching question with 4 pairs", async () => {
    get.mockResolvedValue({ data: { data: authoring() } });
    post.mockResolvedValue({
      data: {
        data: {
          id: 103,
          order: 2,
          type: "MATCHING",
          prompt: "Match the books",
          points: 4,
          pairs: [1, 2, 3, 4].map((n) => ({ leftId: n, left: `L${n}`, rightId: n + 10, right: `R${n}` })),
        },
      },
    });
    renderWithProviders(<QuizEditScreen />);

    fireEvent.press(await screen.findByText("Add question"));
    fireEvent.press(screen.getByLabelText("Matching"));
    fireEvent.changeText(screen.getByLabelText("Question prompt"), "Match the books");
    fireEvent.changeText(screen.getByLabelText("Points"), "4");
    fireEvent.press(screen.getByText("Add pair"));
    fireEvent.press(screen.getByText("Add pair"));
    for (const n of [1, 2, 3, 4]) {
      fireEvent.changeText(screen.getByLabelText(`Left item ${n}`), `L${n}`);
      fireEvent.changeText(screen.getByLabelText(`Right item ${n}`), `R${n}`);
    }
    fireEvent.press(screen.getByText("Add question"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/quizzes/41/questions", {
        type: "MATCHING",
        prompt: "Match the books",
        points: 4,
        pairs: [1, 2, 3, 4].map((n) => ({ left: `L${n}`, right: `R${n}` })),
      }),
    );
  });

  it("fill blank editor shows one answer field per blank", async () => {
    get.mockResolvedValue({ data: { data: authoring() } });
    post.mockResolvedValue({
      data: {
        data: {
          id: 104,
          order: 2,
          type: "FILL_BLANK",
          prompt: "In the {{blank}} was the {{blank}}",
          points: 2,
          blanks: [
            { id: 1, position: 0, expected: "beginning" },
            { id: 2, position: 1, expected: "Word" },
          ],
        },
      },
    });
    renderWithProviders(<QuizEditScreen />);

    fireEvent.press(await screen.findByText("Add question"));
    fireEvent.press(screen.getByLabelText("Fill in the blank"));
    expect(screen.queryByLabelText("Answer for blank 1")).toBeNull();
    fireEvent.changeText(screen.getByLabelText("Question prompt"), "In the  was the ");
    fireEvent(screen.getByLabelText("Question prompt"), "selectionChange", {
      nativeEvent: { selection: { start: 7, end: 7 } },
    });
    fireEvent.press(screen.getByLabelText("Insert blank"));
    expect(screen.getByLabelText("Answer for blank 1")).toBeTruthy();
    expect(screen.queryByLabelText("Answer for blank 2")).toBeNull();
    fireEvent.press(screen.getByLabelText("Insert blank"));
    expect(screen.getByLabelText("Answer for blank 2")).toBeTruthy();
    // The cursor sat after the first blank; move it to the end for the second.
    fireEvent.changeText(screen.getByLabelText("Question prompt"), "In the {{blank}} was the {{blank}}");
    fireEvent.changeText(screen.getByLabelText("Answer for blank 1"), "beginning");
    fireEvent.changeText(screen.getByLabelText("Answer for blank 2"), "Word");
    fireEvent.changeText(screen.getByLabelText("Points"), "2");
    fireEvent.press(screen.getByText("Add question"));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/quizzes/41/questions", {
        type: "FILL_BLANK",
        prompt: "In the {{blank}} was the {{blank}}",
        points: 2,
        answers: ["beginning", "Word"],
      }),
    );
  });

  it("refuses a fill in the blank question with no blank, at the answers, with the schema's message", async () => {
    get.mockResolvedValue({ data: { data: authoring() } });
    renderWithProviders(<QuizEditScreen />);

    fireEvent.press(await screen.findByText("Add question"));
    fireEvent.press(screen.getByLabelText("Fill in the blank"));
    fireEvent.changeText(screen.getByLabelText("Question prompt"), "No gaps here");
    fireEvent.press(screen.getByText("Add question"));

    expect(await screen.findByText("Add at least one blank to the question.")).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it("turns question shuffling off from the details sheet", async () => {
    get.mockResolvedValue({ data: { data: authoring() } });
    patch.mockResolvedValue({ data: { data: { updated: true } } });
    renderWithProviders(<QuizEditScreen />);

    fireEvent.press(await screen.findByLabelText("Edit quiz details"));
    fireEvent.press(await screen.findByLabelText("Shuffle questions"));
    fireEvent.press(screen.getByText("Save"));
    await waitFor(() => expect(patch).toHaveBeenCalledWith("/api/v1/quizzes/41", { shuffleQuestions: false }));
  });

  it("locks the shuffle switch once a student has started", async () => {
    get.mockResolvedValue({ data: { data: authoring({ attemptCount: 1, canEditStructure: false }) } });
    renderWithProviders(<QuizEditScreen />);

    fireEvent.press(await screen.findByLabelText("Edit quiz details"));
    const toggle = await screen.findByLabelText("Shuffle questions");
    expect(toggle.props.accessibilityState).toMatchObject({ disabled: true });
    expect(
      screen.getByText("Students have started this quiz, so its question order can no longer change."),
    ).toBeTruthy();
  });
});
