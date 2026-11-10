import { Prisma } from "../generated/prisma/client";
import { round2, sumScores, toScore } from "../lib/quizzes/score";

describe("quiz score helpers", () => {
  it.each([
    [1 / 3, 0.33],
    [2 / 3, 0.67],
    [0.125, 0.13],
  ])("round2(%s) is %s", (n, want) => {
    expect(round2(n)).toBe(want);
  });

  it("sumScores rounds once at the end", () => {
    expect(sumScores([0.33, 0.33, 0.33])).toBe(0.99);
    expect(sumScores([1, null, 2.5])).toBe(3.5);
  });

  it("toScore converts Decimal, number and null", () => {
    expect(toScore(null)).toBeNull();
    expect(toScore(new Prisma.Decimal("7.50"))).toBe(7.5);
    expect(toScore(2)).toBe(2);
  });
});
