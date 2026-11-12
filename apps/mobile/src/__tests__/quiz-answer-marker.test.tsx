import type { QuizGradingAttempt } from "@space/shared";
import { fireEvent, screen } from "@testing-library/react-native";

import { initialMarks } from "../screens/quiz-grade/marking-model";
import { QuizAttemptAnswers } from "../screens/quiz-grade/quiz-answer-marker";
import { renderWithProviders } from "./helpers/render";

/*
 * Ruling C-a: a blank or essay the student left empty was marked wrong when the attempt closed.
 * The grader sees it as wrong, with no Right / Wrong to press; only what was written is marked.
 */
const attempt: QuizGradingAttempt = {
  attemptId: 900,
  studentUserId: 9,
  studentName: "Test student",
  attemptNumber: 1,
  status: "SUBMITTED",
  autoScore: 0,
  manualScore: null,
  totalScore: null,
  bestScore: null,
  adminScore: null,
  appScore: null,
  submittedAt: "2099-03-02T10:00:00.000Z",
  gradedByName: null,
  endReason: null,
  endedByName: null,
  deadlineAt: null,
  events: [],
  answers: [
    {
      questionId: 2,
      type: "FILL_BLANK",
      prompt: "{{blank}} and {{blank}}.",
      points: 4,
      pointsAwarded: null,
      blanks: [
        { blankId: 21, position: 0, expected: "Peter", text: "Peter", correct: null },
        { blankId: 22, position: 1, expected: "John", text: null, correct: false },
      ],
    },
    { questionId: 3, type: "ESSAY", prompt: "Discuss.", points: 5, pointsAwarded: 0, text: null, correct: false },
  ],
};

describe("QuizAttemptAnswers with items left empty", () => {
  it('shows each empty blank and essay as "Left empty, wrong" and offers Right / Wrong only for the answered blank', () => {
    renderWithProviders(
      <QuizAttemptAnswers attempt={attempt} marks={initialMarks(attempt)} onMark={jest.fn()} onPoints={jest.fn()} />,
    );
    expect(screen.getAllByText("Left empty, wrong")).toHaveLength(2);
    expect(screen.getAllByText("Right")).toHaveLength(1);
    expect(screen.getAllByText("Wrong")).toHaveLength(1);
  });

  it("offers an answered essay its points, one button per score, and saves the one pressed", () => {
    const answered: QuizGradingAttempt = {
      ...attempt,
      answers: [
        {
          questionId: 3,
          type: "ESSAY",
          prompt: "Discuss.",
          points: 2,
          pointsAwarded: null,
          text: "Mine.",
          correct: null,
        },
      ],
    };
    const onPoints = jest.fn();
    renderWithProviders(
      <QuizAttemptAnswers attempt={answered} marks={initialMarks(answered)} onMark={jest.fn()} onPoints={onPoints} />,
    );
    expect(screen.getByText("Points, out of 2")).toBeTruthy();
    expect(screen.getByLabelText("0 points of 2")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("1 point of 2"));
    expect(onPoints).toHaveBeenCalledWith(3, 1);
    expect(screen.queryByText("Right")).toBeNull();
  });

  it("gives a big essay a field with one point less and more", () => {
    const big: QuizGradingAttempt = {
      ...attempt,
      answers: [
        {
          questionId: 3,
          type: "ESSAY",
          prompt: "Discuss.",
          points: 10,
          pointsAwarded: 4,
          text: "Mine.",
          correct: false,
        },
      ],
    };
    const onPoints = jest.fn();
    renderWithProviders(
      <QuizAttemptAnswers attempt={big} marks={initialMarks(big)} onMark={jest.fn()} onPoints={onPoints} />,
    );
    expect(screen.getByLabelText("Points, out of 10").props.value).toBe("4");
    fireEvent.press(screen.getByLabelText("One point more"));
    expect(onPoints).toHaveBeenCalledWith(3, 5);
    fireEvent.press(screen.getByLabelText("One point less"));
    expect(onPoints).toHaveBeenCalledWith(3, 3);
  });
});
