// The option rows a question write inserts, with the database mocked. Serial
// ids follow insertion order, so inserting in author order would let a
// student read the key off the ids (final review C1): a matching question's
// right id was always its left id + pairs, and choice ids undid the shuffle.

type CreatedOption = { position: number; label: string; side: string | null };

const mockCreated: CreatedOption[] = [];
const mockMatches: { id: number; matchId: number }[] = [];
const mockTx = {
  quizQuestion: {
    count: jest.fn(async () => 0),
    create: jest.fn(async () => ({ id: 50 })),
    update: jest.fn(async () => ({ id: 50 })),
    aggregate: jest.fn(async () => ({ _sum: { points: 4 } })),
    findUniqueOrThrow: jest.fn(async () => ({
      id: 50,
      order: 0,
      type: "ESSAY",
      prompt: "P",
      points: 4,
      quizOptions: [],
      quizBlanks: [],
    })),
  },
  quiz: { update: jest.fn(async () => ({})) },
  quizOption: {
    deleteMany: jest.fn(async () => ({ count: 0 })),
    create: jest.fn(async ({ data }: { data: CreatedOption }) => {
      mockCreated.push(data);
      return { id: mockCreated.length };
    }),
    update: jest.fn(async ({ where, data }: { where: { id: number }; data: { matchId: number } }) => {
      mockMatches.push({ id: where.id, matchId: data.matchId });
      return {};
    }),
  },
  quizBlank: { deleteMany: jest.fn(async () => ({ count: 0 })), createMany: jest.fn(async () => ({ count: 0 })) },
};
jest.mock("../db/client", () => ({
  db: { $transaction: (fn: (tx: typeof mockTx) => unknown) => fn(mockTx) },
}));

const mockRandomOrder = jest.fn();
jest.mock("../lib/quizzes/shuffle", () => {
  const actual = jest.requireActual("../lib/quizzes/shuffle");
  return {
    ...actual,
    randomOrder: (items: unknown[]) => {
      mockRandomOrder(items);
      return actual.randomOrder(items);
    },
  };
});

import { addQuizQuestion, updateQuizQuestion } from "../lib/quizzes/questions";
import type { QuizQuestionRequest } from "../lib/quizzes/question-rows";

const matching: QuizQuestionRequest = {
  type: "MATCHING",
  prompt: "Match",
  points: 4,
  pairs: [
    { left: "France", right: "Paris" },
    { left: "Italy", right: "Rome" },
    { left: "Spain", right: "Madrid" },
  ],
};
const choice: QuizQuestionRequest = {
  type: "SINGLE_CHOICE",
  prompt: "Pick",
  points: 1,
  options: [
    { label: "a", isCorrect: false },
    { label: "b", isCorrect: true },
    { label: "c", isCorrect: false },
  ],
};

/** A fixed, non-trivial permutation: the order is [2, 0, 5, 3, 1, 4] for six rows, rotated for fewer. */
function fixedShuffle<T>(items: readonly T[]): T[] {
  const order = [2, 0, 5, 3, 1, 4].filter((i) => i < items.length);
  return order.map((i) => items[i] as T);
}

const idOf = (label: string) => mockCreated.findIndex((o) => o.label === label) + 1;

beforeEach(() => {
  jest.clearAllMocks();
  mockCreated.length = 0;
  mockMatches.length = 0;
});

describe("question writes insert option rows in a shuffled order", () => {
  it("inserts in the order the shuffle gives, keeping position as the author's order", async () => {
    await addQuizQuestion(9, matching, fixedShuffle);
    expect(mockCreated.map((o) => o.label)).toEqual(["Spain", "France", "Madrid", "Paris", "Italy", "Rome"]);
    // position is still the author's order, so every reader is unchanged.
    expect(mockCreated.map((o) => o.position)).toEqual([2, 0, 5, 3, 1, 4]);
  });

  it("still links each left row to its own right row", async () => {
    await addQuizQuestion(9, matching, fixedShuffle);
    expect([...mockMatches].sort((a, b) => a.id - b.id)).toEqual(
      [
        { id: idOf("France"), matchId: idOf("Paris") },
        { id: idOf("Italy"), matchId: idOf("Rome") },
        { id: idOf("Spain"), matchId: idOf("Madrid") },
      ].sort((a, b) => a.id - b.id),
    );
    const offsets = new Set(mockMatches.map((m) => m.matchId - m.id));
    expect(offsets.size).toBeGreaterThan(1);
  });

  it("shuffles choice options on an edit too", async () => {
    await updateQuizQuestion(9, 50, choice, fixedShuffle);
    expect(mockCreated.map((o) => o.label)).toEqual(["c", "a", "b"]);
    expect(mockCreated.map((o) => o.position)).toEqual([2, 0, 1]);
  });

  it("uses the crypto shuffle when none is given", async () => {
    await addQuizQuestion(9, matching);
    expect(mockRandomOrder).toHaveBeenCalledTimes(1);
    expect(mockCreated.map((o) => o.label).sort()).toEqual(["France", "Italy", "Madrid", "Paris", "Rome", "Spain"]);
  });
});
