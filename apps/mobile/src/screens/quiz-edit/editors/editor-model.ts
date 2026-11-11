/**
 * The question editor's pure model: a draft is the request the editor sends
 * (`QuizQuestionInput`), so what the form holds and what the server parses are
 * one shape. Validation is `quizQuestionRequestSchema` itself; `fieldErrors`
 * only places its issues at the fields they name.
 */
import {
  BLANK_TOKEN,
  countBlanks,
  type QuizQuestionAuthoring,
  type QuizQuestionInput,
  type QuizQuestionType,
} from "@space/shared";

import { plural } from "../../../lib/plural";
import { questionTypeLabel } from "../../quiz-detail/questions";

/** The type picker's order. */
export const QUESTION_TYPES: readonly QuizQuestionType[] = [
  "SINGLE_CHOICE",
  "MULTI_CHOICE",
  "TRUE_FALSE",
  "MATCHING",
  "FILL_BLANK",
  "ESSAY",
];

/** quizQuestionRequestSchema's bounds, for the editors' add and remove buttons. */
export const OPTION_RANGE = { SINGLE_CHOICE: [2, 6], MULTI_CHOICE: [3, 8] } as const;
export const PAIR_RANGE = [2, 6] as const;

type Choice = Extract<QuizQuestionInput, { type: "SINGLE_CHOICE" | "MULTI_CHOICE" }>;
type Option = Choice["options"][number];

const blankOption = (): Option => ({ label: "", isCorrect: false });
const blankOptions = (n: number): Option[] => Array.from({ length: n }, blankOption);

export function emptyDraft(type: QuizQuestionType): QuizQuestionInput {
  const base = { prompt: "", points: 1 };
  switch (type) {
    case "SINGLE_CHOICE":
    case "MULTI_CHOICE":
      return { ...base, type, options: blankOptions(OPTION_RANGE[type][0]) };
    case "TRUE_FALSE":
      return { ...base, type, correct: true };
    case "MATCHING":
      return { ...base, type, pairs: [0, 1].map(() => ({ left: "", right: "" })) };
    case "FILL_BLANK":
      return { ...base, type, answers: [] };
    case "ESSAY":
      return { ...base, type };
  }
}

/** Single to multiple keeps the marks; multiple to single keeps them only when exactly one is correct. */
function carryOptions(options: Option[], to: Choice["type"]): Option[] {
  const correct = options.filter((o) => o.isCorrect).length;
  const kept = to === "SINGLE_CHOICE" && correct !== 1 ? options.map((o) => ({ ...o, isCorrect: false })) : options;
  const min = OPTION_RANGE[to][0];
  return kept.length >= min ? kept : [...kept, ...blankOptions(min - kept.length)];
}

/** A new type keeps the prompt and points; single and multiple choice carry their option labels between them. */
export function switchType(draft: QuizQuestionInput, type: QuizQuestionType): QuizQuestionInput {
  if (draft.type === type) return draft;
  const kept = { prompt: draft.prompt, points: draft.points };
  if ((type === "SINGLE_CHOICE" || type === "MULTI_CHOICE") && "options" in draft) {
    return { ...kept, type, options: carryOptions(draft.options, type) };
  }
  if (type === "FILL_BLANK") return { ...kept, type, answers: syncBlankAnswers(draft.prompt, []) };
  return { ...emptyDraft(type), ...kept };
}

/** Puts a blank at the cursor; the cursor lands after it. */
export function insertBlank(prompt: string, cursor: number): { prompt: string; cursor: number } {
  const at = Math.max(0, Math.min(cursor, prompt.length));
  return { prompt: prompt.slice(0, at) + BLANK_TOKEN + prompt.slice(at), cursor: at + BLANK_TOKEN.length };
}

/** One answer per blank in the prompt, keeping the existing answers by index. */
export function syncBlankAnswers(prompt: string, answers: string[]): string[] {
  return Array.from({ length: countBlanks(prompt) }, (_, i) => answers[i] ?? "");
}

/** The authoring read (with ids) as the request the editor sends back. */
export function fromAuthoring(q: QuizQuestionAuthoring): QuizQuestionInput {
  const base = { prompt: q.prompt, points: q.points };
  switch (q.type) {
    case "SINGLE_CHOICE":
    case "MULTI_CHOICE":
      return { ...base, type: q.type, options: q.options.map(({ label, isCorrect }) => ({ label, isCorrect })) };
    case "TRUE_FALSE":
      return { ...base, type: q.type, correct: q.correct };
    case "MATCHING":
      return { ...base, type: q.type, pairs: q.pairs.map(({ left, right }) => ({ left, right })) };
    case "FILL_BLANK":
      return {
        ...base,
        type: q.type,
        answers: [...q.blanks].sort((a, b) => a.position - b.position).map((b) => b.expected),
      };
    case "ESSAY":
      return { ...base, type: q.type };
  }
}

type Issue = { code: string; path: PropertyKey[]; message: string };

/**
 * The schema's own refinement messages stand as written ("Mark exactly one
 * correct answer."). Its bare bounds (`min`, `max`, a wrong type) carry Zod's
 * generic wording, so those get a sentence that names the field's rule.
 */
function boundMessage(field: string, issue: Issue, type: QuizQuestionType): string {
  switch (field) {
    case "prompt":
      return "Write the question, from 2 to 2000 characters.";
    case "points":
      return "Points must be a whole number from 1 to 100.";
    case "options": {
      const [min, max] = type === "MULTI_CHOICE" ? OPTION_RANGE.MULTI_CHOICE : OPTION_RANGE.SINGLE_CHOICE;
      return `Give ${min} to ${max} options.`;
    }
    case "options.#.label":
      return "Fill in this option.";
    case "pairs":
      return "Give 2 to 6 pairs.";
    case "pairs.#.left":
    case "pairs.#.right":
      return "Fill in this item.";
    case "answers":
      return issue.code === "too_big" ? "Use at most 10 blanks." : "Add at least one blank to the question.";
    case "answers.#":
      return "Give the answer for this blank.";
    default:
      return issue.message;
  }
}

/** The first message per field path ("prompt", "options", "options.2.label", "pairs.0.left", "answers.1"). */
export function fieldErrors(
  issues: readonly Issue[],
  type: QuizQuestionType = "SINGLE_CHOICE",
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".") || "form";
    if (key in out) continue;
    const field = issue.path.map((p) => (typeof p === "number" ? "#" : String(p))).join(".");
    out[key] = issue.code === "custom" ? issue.message : boundMessage(field, issue, type);
  }
  return out;
}

/** The builder row's lines: the type, what it holds, and its answer key where one line can show it. */
export function questionSummary(q: QuizQuestionAuthoring): {
  type: string;
  count: string | null;
  key: string | null;
} {
  const type = questionTypeLabel(q);
  switch (q.type) {
    case "SINGLE_CHOICE":
    case "MULTI_CHOICE": {
      const correct = q.options.filter((o) => o.isCorrect).map((o) => o.label);
      return { type, count: plural(q.options.length, "option"), key: correct.length ? correct.join(", ") : null };
    }
    case "TRUE_FALSE":
      return { type, count: null, key: q.correct ? "True" : "False" };
    case "MATCHING":
      return { type, count: plural(q.pairs.length, "pair"), key: null };
    case "FILL_BLANK":
      return { type, count: plural(q.blanks.length, "blank"), key: null };
    case "ESSAY":
      return { type, count: null, key: null };
  }
}
