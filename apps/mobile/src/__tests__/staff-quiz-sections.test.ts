import type { QuizSummary } from "@space/shared";

import { quizSections, quizSubtitle } from "../screens/staff-work/quiz-sections";

function quiz(over: Partial<QuizSummary>): QuizSummary {
  return {
    id: 1,
    title: "Quiz",
    kind: "ONLINE",
    publishedAt: "2099-03-01T10:00:00.000Z",
    questionCount: 3,
    maxScore: 3,
    sessionId: 12,
    sessionTitle: "Week 1",
    sessionDate: "2099-03-01T18:00:00.000Z",
    seasonId: 7,
    seasonCode: "s26",
    gradedCount: 0,
    studentCount: 8,
    answersReleasedAt: null,
    createdAt: "2099-02-20T10:00:00.000Z",
    ...over,
  };
}

describe("staff Work: quiz sections", () => {
  it("puts unpublished online quizzes in Drafts and the rest in Published, newest created first", () => {
    const rows = [
      quiz({ id: 1, createdAt: "2099-02-01T10:00:00.000Z" }),
      quiz({ id: 2, publishedAt: null, createdAt: "2099-02-02T10:00:00.000Z" }),
      quiz({ id: 3, kind: "PAPER", publishedAt: null, createdAt: "2099-02-05T10:00:00.000Z" }),
      quiz({ id: 4, publishedAt: null, createdAt: "2099-02-09T10:00:00.000Z" }),
      quiz({ id: 5, createdAt: "2099-02-01T10:00:00.000Z" }),
    ];
    const { drafts, published } = quizSections(rows);
    expect(drafts.map((q) => q.id)).toEqual([4, 2]);
    expect(published.map((q) => q.id)).toEqual([3, 5, 1]);
  });

  it("says the kind, the session and when it was added", () => {
    expect(quizSubtitle(quiz({ questionCount: 1 }))).toBe("Online · 1 question · Week 1 · Added Feb 20, 2099");
    expect(quizSubtitle(quiz({ kind: "PAPER", sessionTitle: null }))).toBe("Paper · No session · Added Feb 20, 2099");
  });
});
