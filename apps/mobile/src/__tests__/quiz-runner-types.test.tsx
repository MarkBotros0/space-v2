import { StyleSheet } from "react-native";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), put: jest.fn(), patch: jest.fn(), post: jest.fn() },
}));
jest.mock("../design/ui/toaster", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
  Toaster: () => null,
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "41" }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));
// The phone the blanks lay out on: inline on a roomy screen, fields under the sentence on a small one.
const mockWindow = { width: 390, height: 844, scale: 3, fontScale: 1 };
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => mockWindow,
}));

import { apiClient } from "../lib/api-client";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import QuizDetailScreen from "../../app/(app)/quiz/[id]/index";

const get = apiClient.get as jest.Mock;
const patch = apiClient.patch as jest.Mock;
const post = apiClient.post as jest.Mock;

const base = { order: 0, points: 3, review: null, pointsAwarded: null };
const opts = (labels: string[], from: number) => labels.map((label, i) => ({ id: from + i, label }));

function inProgress(questions: unknown[]) {
  return {
    id: 41,
    title: "Types quiz",
    kind: "ONLINE",
    seasonId: 7,
    maxScore: 3,
    sessionTitle: null,
    attemptId: 900,
    attemptNumber: 1,
    readOnly: false,
    status: "IN_PROGRESS",
    stage: "in_progress",
    totalScore: null,
    submittedAt: null,
    gradedAt: null,
    answersReleased: false,
    questions,
  };
}

async function open(question: unknown, answered = 0) {
  get.mockResolvedValue({ data: { data: inProgress([question]) } });
  patch.mockResolvedValue({ data: { data: { saved: 1 } } });
  renderWithProviders(<QuizDetailScreen />);
  await screen.findByText(new RegExp(`${answered} of 1 answered`));
}

async function saved() {
  act(() => {
    jest.advanceTimersByTime(1000);
  });
  await waitFor(() => expect(patch).toHaveBeenCalled());
  return patch.mock.calls[0][1].answers[0];
}

const style = (node: { props: { style?: unknown } }) => StyleSheet.flatten(node.props.style as never) ?? {};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  Object.assign(mockWindow, { width: 390, fontScale: 1 });
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState({
    user: { id: 9, name: "S", email: "s@jpc.test", role: "STUDENT" as const, avatarPath: null, hasPassword: true },
    scopes: { seasonAdminIds: [], groupLeaderIds: [], activeSeasonId: 7, graduationYear: null },
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("quiz runner, every question type", () => {
  it("choose-N disables a fourth tick when N is 3", async () => {
    await open({
      ...base,
      id: 200,
      type: "MULTI_CHOICE",
      prompt: "Pick the three primes.",
      choose: 3,
      options: opts(["2", "3", "4", "5"], 2001),
      answer: { optionIds: [] },
    });

    expect(screen.getByText("Choose 3 · 0 selected")).toBeTruthy();
    for (const n of [1, 2, 4])
      fireEvent.press(screen.getByLabelText(`Answer 1 option ${n}: ${["2", "3", "4", "5"][n - 1]}`));
    expect(screen.getByText("Choose 3 · 3 selected")).toBeTruthy();

    const fourth = screen.getByLabelText("Answer 1 option 3: 4");
    expect(fourth.props.accessibilityState).toEqual(expect.objectContaining({ checked: false, disabled: true }));
    fireEvent.press(fourth);
    expect(screen.getByText("Choose 3 · 3 selected")).toBeTruthy();

    expect(await saved()).toEqual({ type: "MULTI_CHOICE", questionId: 200, optionIds: [2001, 2002, 2004] });
  });

  it("matching: tap left then right pairs them and saves pairs", async () => {
    await open({
      ...base,
      id: 300,
      type: "MATCHING",
      prompt: "Match each animal with its sound.",
      left: opts(["Cat", "Dog"], 3001),
      right: opts(["Woof", "Meow"], 3101),
      answer: { pairs: [] },
    });

    fireEvent.press(screen.getByLabelText("Match Cat with …"));
    expect(screen.getByLabelText("Match Cat with …").props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
    fireEvent.press(screen.getByText("Meow"));
    // Both items of the pair carry the same number.
    expect(screen.getAllByText("1")).toHaveLength(2);
    expect(screen.getByLabelText("Cat, matched with Meow")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Match Dog with …"));
    fireEvent.press(screen.getByText("Woof"));
    expect(screen.getByText(/1 of 1 answered/)).toBeTruthy();

    expect(await saved()).toEqual({
      type: "MATCHING",
      questionId: 300,
      pairs: [
        { leftId: 3001, rightId: 3102 },
        { leftId: 3002, rightId: 3101 },
      ],
    });

    // A paired left item unpairs on a tap.
    fireEvent.press(screen.getByLabelText("Cat, matched with Meow"));
    expect(screen.getByLabelText("Match Cat with …")).toBeTruthy();
    expect(screen.getByText(/0 of 1 answered/)).toBeTruthy();
  });

  const animals = (prompt: string, left = ["Cat", "Dog"], right = ["Woof", "Meow"]) => ({
    ...base,
    id: 300,
    type: "MATCHING",
    prompt,
    left: opts(left, 3001),
    right: opts(right, 3101),
    answer: { pairs: [] },
  });

  it("matching: a right item paired again moves to its new left, and a paired left can be chosen", async () => {
    await open(animals("Match each animal with its sound."));

    fireEvent.press(screen.getByLabelText("Match Cat with …"));
    fireEvent.press(screen.getByText("Meow"));
    fireEvent.press(screen.getByLabelText("Match Dog with …"));
    fireEvent.press(screen.getByText("Meow"));
    expect(screen.getByLabelText("Match Cat with …")).toBeTruthy();
    expect(screen.getByLabelText("Dog, matched with Meow")).toBeTruthy();
    expect(await saved()).toEqual({ type: "MATCHING", questionId: 300, pairs: [{ leftId: 3002, rightId: 3102 }] });

    // With an item chosen, a tap on a paired one chooses it instead of unpairing it.
    fireEvent.press(screen.getByLabelText("Match Cat with …"));
    fireEvent.press(screen.getByLabelText("Dog, matched with Meow"));
    expect(screen.getByLabelText("Dog, matched with Meow").props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText("Match Cat with …").props.accessibilityState.selected).toBe(false);
    // Tapping the chosen item again clears the choice and keeps the pair.
    fireEvent.press(screen.getByLabelText("Dog, matched with Meow"));
    expect(screen.getByLabelText("Dog, matched with Meow").props.accessibilityState.selected).toBe(false);
  });

  it("matching: the columns swap sides for an Arabic question", async () => {
    await open(animals("صل كل حيوان بصوته.", ["قطة", "كلب"], ["هوهو", "مواء"]));
    expect(screen.getByTestId("matching-columns").props.style).toEqual(
      expect.objectContaining({ flexDirection: "row-reverse" }),
    );
  });

  it("fill blank typing saves blanks", async () => {
    await open({
      ...base,
      id: 400,
      type: "FILL_BLANK",
      prompt: "The capital of France is {{blank}} and of Italy {{blank}}.",
      blanks: [
        { id: 4001, position: 0 },
        { id: 4002, position: 1 },
      ],
      answer: { blanks: [] },
    });

    // Inline on a roomy phone: no "Blank 1" field label under the sentence.
    expect(screen.queryByText("Blank 1")).toBeNull();
    const first = screen.getByLabelText("Blank 1");
    expect(first.props.autoCorrect).toBe(false);
    expect(first.props.spellCheck).toBe(false);
    fireEvent.changeText(first, "Paris");
    fireEvent.changeText(screen.getByLabelText("Blank 2"), "Rome");
    expect(screen.getByText(/1 of 1 answered/)).toBeTruthy();

    expect(await saved()).toEqual({
      type: "FILL_BLANK",
      questionId: 400,
      blanks: [
        { blankId: 4001, text: "Paris" },
        { blankId: 4002, text: "Rome" },
      ],
    });
  });

  it("fill blank: an inline gap in an Arabic sentence types right to left", async () => {
    await open({
      ...base,
      id: 400,
      type: "FILL_BLANK",
      prompt: "عاصمة مصر هي {{blank}}.",
      blanks: [{ id: 4001, position: 0 }],
      answer: { blanks: [] },
    });
    expect(style(screen.getByLabelText("Blank 1"))).toEqual(
      expect.objectContaining({ writingDirection: "rtl", textAlign: "right" }),
    );
  });

  it("fill blank falls back to labelled fields under the sentence on a small phone", async () => {
    Object.assign(mockWindow, { width: 360, fontScale: 1.3 });
    await open({
      ...base,
      id: 400,
      type: "FILL_BLANK",
      prompt: "The capital of France is {{blank}}.",
      blanks: [{ id: 4001, position: 0 }],
      answer: { blanks: [] },
    });

    expect(screen.getByText("Blank 1")).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText("Blank 1"), "Paris");
    expect(screen.getByText(/1 of 1 answered/)).toBeTruthy();
  });

  it("true/false shows True then False", async () => {
    await open({
      ...base,
      id: 500,
      type: "TRUE_FALSE",
      prompt: "The earth is round.",
      options: opts(["True", "False"], 5001),
      answer: { optionId: null },
    });

    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.props.accessibilityLabel)).toEqual([
      "Answer 1 option 1: True",
      "Answer 1 option 2: False",
    ]);
    fireEvent.press(screen.getByLabelText("Answer 1 option 2: False"));
    expect(screen.getByLabelText("Answer 1 option 2: False").props.accessibilityState.selected).toBe(true);
    expect(await saved()).toEqual({ type: "TRUE_FALSE", questionId: 500, optionId: 5002 });
  });

  it("Arabic prompt renders right-aligned", async () => {
    await open({
      ...base,
      id: 600,
      type: "ESSAY",
      prompt: "اشرح معنى المحبة.",
      answer: { text: "" },
    });

    const prompt = style(screen.getByText("اشرح معنى المحبة."));
    expect(prompt).toEqual(expect.objectContaining({ writingDirection: "rtl", textAlign: "right" }));
    // The answer box takes the direction of the question.
    const box = screen.getByLabelText("Answer 1");
    expect(style(box)).toEqual(expect.objectContaining({ writingDirection: "rtl", textAlign: "right" }));
    expect(box.props.autoCorrect).toBe(false);
  });

  it("options of an Arabic question put their radio on the right, the label beside it", async () => {
    await open({
      ...base,
      id: 700,
      type: "TRUE_FALSE",
      prompt: "الأرض كروية.",
      options: opts(["True", "False"], 7001),
      answer: { optionId: null },
    });
    for (const radio of screen.getAllByRole("radio")) {
      expect(style(radio)).toEqual(expect.objectContaining({ flexDirection: "row-reverse" }));
    }
    // An English label in an Arabic question still sits against its radio.
    expect(style(screen.getByText("True"))).toEqual(expect.objectContaining({ textAlign: "right" }));
  });

  it("options of an English question keep their radio on the left, even with an Arabic label", async () => {
    await open({
      ...base,
      id: 701,
      type: "SINGLE_CHOICE",
      prompt: "Which verse?",
      options: opts(["يوحنا 3:16", "John 14:6"], 7011),
      answer: { optionId: null },
    });
    for (const radio of screen.getAllByRole("radio")) {
      expect(style(radio)).toEqual(expect.objectContaining({ flexDirection: "row" }));
    }
    // Its own direction for shaping, aligned to the radio's side.
    expect(style(screen.getByText("يوحنا 3:16"))).toEqual(
      expect.objectContaining({ writingDirection: "rtl", textAlign: "left" }),
    );
  });

  it("locks the answers while the quiz is being handed in", async () => {
    post.mockReturnValue(new Promise(() => {}));
    await open({ ...base, id: 600, type: "ESSAY", prompt: "Discuss.", answer: { text: "Done." } }, 1);
    expect(screen.getByLabelText("Answer 1").props.editable).toBe(true);

    fireEvent.press(screen.getByText("Submit quiz"));
    fireEvent.press(await screen.findByText("Submit"));
    await waitFor(() => expect(post).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByLabelText("Answer 1").props.editable).toBe(false));
  });
});
