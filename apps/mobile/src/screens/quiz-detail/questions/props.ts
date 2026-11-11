import type { QuizQuestionStudent } from "@space/shared";

/** What every question input takes: its question, its answer (the matching shape), and where the next answer goes. */
export type QuestionProps<T extends QuizQuestionStudent["type"]> = {
  /** SINGLE_CHOICE and TRUE_FALSE share one shape, so they are asked for together. */
  question: Extract<QuizQuestionStudent, { type: T }>;
  /** The question's place in the quiz, from 0; it names the controls for a screen reader. */
  index: number;
  answer: Extract<QuizQuestionStudent, { type: T }>["answer"];
  onChange: (next: Extract<QuizQuestionStudent, { type: T }>["answer"]) => void;
  disabled?: boolean;
};

/**
 * Answer inputs never autocorrect, spell-check, autofill or offer the paste menu: what the student
 * types is what is marked. (A hardware-keyboard paste cannot be blocked from React Native.)
 */
export const ANSWER_INPUT = {
  autoCorrect: false,
  spellCheck: false,
  contextMenuHidden: true,
  autoComplete: "off",
  importantForAutofill: "no",
  textContentType: "none",
} as const;
