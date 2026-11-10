// Relative, not "@space/shared" — same emit trap routes/auth.ts documents.
import type { QuizQuestionAuthoring, quizQuestionRequestSchema } from "../../../../../packages/shared/src/index";
import type { z } from "zod";

import type { QuizOptionSide, QuizQuestionType } from "../../generated/prisma/enums";

export type QuizQuestionRequest = z.infer<typeof quizQuestionRequestSchema>;

export type OptionRow = {
  position: number;
  label: string;
  isCorrect: boolean;
  side: QuizOptionSide | null;
  /** MATCHING only: links a LEFT row to its RIGHT row; the writer turns it into `matchId` after insert. */
  matchKey?: number;
};

export type BlankRow = { position: number; expected: string };

/** A question as the authoring select returns it. */
export type AuthoringQuestionRow = {
  id: number;
  order: number;
  type: QuizQuestionType;
  prompt: string;
  points: number;
  quizOptions: {
    id: number;
    position: number;
    label: string;
    isCorrect: boolean;
    side: QuizOptionSide | null;
    matchId: number | null;
  }[];
  quizBlanks: { id: number; position: number; expected: string }[];
};

const NO_ROWS = { options: [] as OptionRow[], blanks: [] as BlankRow[] };

/** The option and blank rows a validated question request becomes. */
export function questionRowsFor(input: QuizQuestionRequest): { options: OptionRow[]; blanks: BlankRow[] } {
  switch (input.type) {
    case "SINGLE_CHOICE":
    case "MULTI_CHOICE":
      return {
        options: input.options.map((o, position) => ({ position, label: o.label, isCorrect: o.isCorrect, side: null })),
        blanks: [],
      };
    case "TRUE_FALSE":
      return {
        options: [
          { position: 0, label: "True", isCorrect: input.correct, side: null },
          { position: 1, label: "False", isCorrect: !input.correct, side: null },
        ],
        blanks: [],
      };
    case "MATCHING": {
      const n = input.pairs.length;
      return {
        options: [
          ...input.pairs.map((p, i) => ({
            position: i,
            label: p.left,
            isCorrect: false,
            side: "LEFT" as const,
            matchKey: i,
          })),
          ...input.pairs.map((p, i) => ({
            position: n + i,
            label: p.right,
            isCorrect: false,
            side: "RIGHT" as const,
            matchKey: i,
          })),
        ],
        blanks: [],
      };
    }
    case "FILL_BLANK":
      return { options: [], blanks: input.answers.map((expected, position) => ({ position, expected })) };
    case "ESSAY":
      return NO_ROWS;
  }
}

const byPosition = <T extends { position: number }>(rows: T[]): T[] =>
  [...rows].sort((a, b) => a.position - b.position);

/** A stored question as the authoring read shows it, answer key included. */
export function toAuthoringQuestion(row: AuthoringQuestionRow): QuizQuestionAuthoring {
  const base = { id: row.id, order: row.order, prompt: row.prompt, points: row.points };
  const options = byPosition(row.quizOptions);
  switch (row.type) {
    case "SINGLE_CHOICE":
    case "MULTI_CHOICE":
      return {
        ...base,
        type: row.type,
        options: options.map((o) => ({ id: o.id, label: o.label, isCorrect: o.isCorrect })),
      };
    case "TRUE_FALSE":
      return { ...base, type: "TRUE_FALSE", correct: options.some((o) => o.label === "True" && o.isCorrect) };
    case "MATCHING": {
      const rights = new Map(options.filter((o) => o.side === "RIGHT").map((o) => [o.id, o]));
      return {
        ...base,
        type: "MATCHING",
        pairs: options.flatMap((l) => {
          const right = l.side === "LEFT" && l.matchId !== null ? rights.get(l.matchId) : undefined;
          return right ? [{ leftId: l.id, left: l.label, rightId: right.id, right: right.label }] : [];
        }),
      };
    }
    case "FILL_BLANK":
      return {
        ...base,
        type: "FILL_BLANK",
        blanks: byPosition(row.quizBlanks).map((b) => ({ id: b.id, position: b.position, expected: b.expected })),
      };
    case "ESSAY":
      return { ...base, type: "ESSAY" };
    case "MCQ":
      throw new Error(`Question ${row.id} is a legacy MCQ; the quiz-types backfill should have converted it.`);
  }
}
