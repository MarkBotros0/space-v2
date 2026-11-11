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
import { renderStacked } from "./helpers/render";
import { adminSession, authoring } from "./helpers/quiz-authoring-fixtures";
import QuizEditScreen from "../../app/(app)/quiz/[id]/edit";

const get = apiClient.get as jest.Mock;
const patch = apiClient.patch as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState(useSessionStore.getInitialState(), true);
  useSessionStore.setState(adminSession);
});

const openDetails = async () => {
  fireEvent.press(await screen.findByLabelText("Edit quiz details"));
  return screen.findByLabelText("Time limit in minutes");
};

describe("quiz details: timing", () => {
  it("sets a time limit", async () => {
    get.mockResolvedValue({ data: { data: authoring() } });
    patch.mockResolvedValue({ data: { data: { updated: true } } });
    renderStacked(<QuizEditScreen />);

    fireEvent.changeText(await openDetails(), "20");
    fireEvent.press(screen.getByText("Save"));
    await waitFor(() => expect(patch).toHaveBeenCalledWith("/api/v1/quizzes/41", { timeLimitMinutes: 20 }));
  });

  it("refuses a time limit outside 1 to 300 before calling the API", async () => {
    get.mockResolvedValue({ data: { data: authoring() } });
    renderStacked(<QuizEditScreen />);

    fireEvent.changeText(await openDetails(), "301");
    fireEvent.press(screen.getByText("Save"));
    expect(await screen.findByText("Time limit must be a whole number of minutes from 1 to 300.")).toBeTruthy();
    expect(patch).not.toHaveBeenCalled();
  });

  it("clears a time limit with an empty field", async () => {
    get.mockResolvedValue({ data: { data: authoring({ timeLimitMinutes: 20 }) } });
    patch.mockResolvedValue({ data: { data: { updated: true } } });
    renderStacked(<QuizEditScreen />);

    fireEvent.changeText(await openDetails(), "");
    fireEvent.press(screen.getByText("Save"));
    await waitFor(() => expect(patch).toHaveBeenCalledWith("/api/v1/quizzes/41", { timeLimitMinutes: null }));
  });

  it("time limit field is locked once attempts exist", async () => {
    get.mockResolvedValue({
      data: { data: authoring({ attemptCount: 1, canEditStructure: false, timeLimitMinutes: 20 }) },
    });
    renderStacked(<QuizEditScreen />);

    const field = await openDetails();
    expect(field.props.editable).toBe(false);
    expect(screen.getByText("Students have started this quiz, so its time limit can no longer change.")).toBeTruthy();
    // The window can still change: its fields stay live.
    expect(screen.getByLabelText("Can start from")).toBeTruthy();
  });

  it("clears a start window end and sends both ends", async () => {
    const from = "2099-03-01T09:00:00.000Z";
    const until = "2099-03-01T10:00:00.000Z";
    get.mockResolvedValue({ data: { data: authoring({ startsFrom: from, startsUntil: until }) } });
    patch.mockResolvedValue({ data: { data: { updated: true } } });
    renderStacked(<QuizEditScreen />);

    await openDetails();
    fireEvent.press(screen.getByLabelText("Clear can start until"));
    fireEvent.press(screen.getByText("Save"));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/quizzes/41", { startsFrom: from, startsUntil: null }),
    );
  });

  it("shows no timing for a paper quiz (the server refuses it: wrong_quiz_kind)", async () => {
    get.mockResolvedValue({
      data: { data: authoring({ kind: "PAPER", maxScore: 20, questions: [], canEditStructure: false }) },
    });
    renderStacked(<QuizEditScreen />);

    fireEvent.press(await screen.findByLabelText("Edit quiz details"));
    expect(await screen.findByLabelText("Quiz title")).toBeTruthy();
    expect(screen.queryByLabelText("Time limit in minutes")).toBeNull();
    expect(screen.queryByLabelText("Can start from")).toBeNull();
  });
});
