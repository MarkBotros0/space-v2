import { Prisma } from "../generated/prisma/client";
import { bestGraded, bestScoreByStudent, countingScore } from "../lib/quizzes/best-attempt";

const attempt = (attemptNumber: number, status: string, totalScore: number | null) => ({
  attemptNumber,
  status,
  totalScore,
});

describe("bestGraded", () => {
  it("picks the higher of two graded attempts", () => {
    expect(bestGraded([attempt(1, "GRADED", 8), attempt(2, "GRADED", 5)])?.attemptNumber).toBe(1);
    expect(bestGraded([attempt(1, "GRADED", 5), attempt(2, "GRADED", 8)])?.attemptNumber).toBe(2);
  });

  it("ignores SUBMITTED and IN_PROGRESS attempts", () => {
    const best = bestGraded([attempt(1, "GRADED", 3), attempt(2, "SUBMITTED", 9), attempt(3, "IN_PROGRESS", null)]);
    expect(best?.attemptNumber).toBe(1);
  });

  it("is null when nothing is graded", () => {
    expect(bestGraded([attempt(1, "SUBMITTED", null), attempt(2, "IN_PROGRESS", null)])).toBeNull();
    expect(bestGraded([])).toBeNull();
  });

  it("gives a tie to the later attempt", () => {
    expect(bestGraded([attempt(2, "GRADED", 6), attempt(1, "GRADED", 6)])?.attemptNumber).toBe(2);
  });
});

describe("bestScoreByStudent", () => {
  it("maps each student to their best graded total, leaving out students with none", () => {
    const rows = [
      { studentUserId: 1, ...attempt(1, "GRADED", 8) },
      { studentUserId: 1, ...attempt(2, "GRADED", 5) },
      { studentUserId: 2, ...attempt(1, "SUBMITTED", null) },
      { studentUserId: 3, ...attempt(1, "GRADED", 0) },
    ];
    const best = bestScoreByStudent(rows);
    expect(best.get(1)).toBe(8);
    expect(best.has(2)).toBe(false);
    expect(best.get(3)).toBe(0);
  });
});

describe("countingScore", () => {
  it("is the admin's score whenever one exists, even below a graded attempt", () => {
    expect(countingScore({ score: 4 }, [attempt(1, "GRADED", 9)])).toEqual({ score: 4, source: "manual" });
    expect(countingScore({ score: new Prisma.Decimal("7.5") }, [])).toEqual({ score: 7.5, source: "manual" });
    expect(countingScore({ score: 0 }, [attempt(1, "SUBMITTED", null)])).toEqual({ score: 0, source: "manual" });
  });

  it("is the best graded attempt without one", () => {
    expect(countingScore(null, [attempt(1, "GRADED", 9), attempt(2, "GRADED", 6)])).toEqual({
      score: 9,
      source: "attempt",
    });
  });

  it("treats a row with no score as no admin score", () => {
    expect(countingScore({ score: null }, [attempt(1, "GRADED", 9)])).toEqual({ score: 9, source: "attempt" });
  });

  it("is null with neither", () => {
    expect(countingScore(null, [attempt(1, "SUBMITTED", null), attempt(2, "IN_PROGRESS", null)])).toBeNull();
    expect(countingScore(null, [])).toBeNull();
  });
});

describe("bestScoreByStudent with admin scores", () => {
  it("lets the admin's score win, and adds a student with only an admin score", () => {
    const rows = [{ studentUserId: 1, ...attempt(1, "GRADED", 9) }];
    const best = bestScoreByStudent(
      rows,
      new Map([
        [1, 4],
        [2, 6.5],
      ]),
    );
    expect(best.get(1)).toBe(4);
    expect(best.get(2)).toBe(6.5);
  });
});
