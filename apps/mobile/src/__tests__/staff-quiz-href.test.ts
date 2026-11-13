import { staffQuizHref } from "../screens/quiz-detail/staff-quiz-href";

const online = { id: 7, kind: "ONLINE" as const, publishedAt: "2099-01-01T00:00:00.000Z" };

describe("staffQuizHref (owner, 2026-11-13)", () => {
  it("opens a published online quiz on its page for the admin and super: questions, Edit, Grade", () => {
    expect(staffQuizHref(online, true)).toEqual({ pathname: "/quiz/[id]", params: { id: "7" } });
  });

  it("opens a draft in the builder", () => {
    expect(staffQuizHref({ ...online, publishedAt: null }, true)).toEqual({
      pathname: "/quiz/[id]/edit",
      params: { id: "7" },
    });
  });

  it("opens grading for a paper quiz, and for a leader whatever the quiz", () => {
    const grade = { pathname: "/quiz/[id]/grade", params: { id: "7" } };
    expect(staffQuizHref({ ...online, kind: "PAPER" }, true)).toEqual(grade);
    expect(staffQuizHref(online, false)).toEqual(grade);
    expect(staffQuizHref({ ...online, publishedAt: null }, false)).toEqual(grade);
  });
});
