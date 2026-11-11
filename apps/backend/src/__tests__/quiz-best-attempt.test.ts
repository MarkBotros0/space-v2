import { bestGraded, bestScoreByStudent } from "../lib/quizzes/best-attempt";

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
