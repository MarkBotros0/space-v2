import type { PassCriteria, SeasonEndCheck } from "@space/shared";

import {
  buildEndRequest,
  clearAll,
  confirmCopy,
  fittedCriteria,
  initialSelection,
  reviewRowView,
  rowLabel,
  scoreRows,
  selectAllOnTrack,
  selectionFor,
} from "../screens/season-end/end-review-model";

type Student = SeasonEndCheck["students"][number];

const student = (userId: number, n: Partial<Student["numbers"]> = {}, over: Partial<Student> = {}): Student => ({
  userId,
  name: `Student ${userId}`,
  groupName: "Group A",
  attendancePct: 0,
  graduationYear: null,
  numbers: {
    attendance: { attended: 0, total: 0 },
    assignments: { submitted: 0, total: 0 },
    quizzes: { scored: 0, max: 0 },
    ...n,
  },
  ...over,
});

const CRITERIA: PassCriteria = { weights: { attendance: 40, assignments: 30, quizzes: 30 }, passMark: 60 };

// 8/10, 3/4, 6/10: 0.4*80 + 0.3*75 + 0.3*60 = 72.5
const onTrack = student(1, {
  attendance: { attended: 8, total: 10 },
  assignments: { submitted: 3, total: 4 },
  quizzes: { scored: 6, max: 10 },
});
// 5/10, 1/4, 2/10: 20 + 7.5 + 6 = 33.5
const below = student(2, {
  attendance: { attended: 5, total: 10 },
  assignments: { submitted: 1, total: 4 },
  quizzes: { scored: 2, max: 10 },
});
// no attendance of their own: (30*100 + 30*50) / 60 = 75, re-scaled
const rescaled = student(3, { assignments: { submitted: 4, total: 4 }, quizzes: { scored: 5, max: 10 } });
const noScore = student(4);

const check = (students: Student[], over: Partial<SeasonEndCheck> = {}): SeasonEndCheck => ({
  graduatesOnPass: false,
  criteria: CRITERIA,
  isDefault: false,
  available: { attendance: true, assignments: true, quizzes: true },
  blockers: { submissions: [], quizAttempts: [], attendance: [] },
  students,
  ...over,
});

describe("scoreRows", () => {
  it("scores each student with the shared formula and says who is on track", () => {
    expect(scoreRows([onTrack, below, rescaled, noScore], CRITERIA)).toEqual([
      { userId: 1, score: 72.5, rescaled: false, onTrack: true },
      { userId: 2, score: 33.5, rescaled: false, onTrack: false },
      { userId: 3, score: 75, rescaled: true, onTrack: true },
      { userId: 4, score: null, rescaled: true, onTrack: null },
    ]);
  });

  it("compares the rounded score with the mark", () => {
    // 1199 of 2000 is 59.95, shown 60.0: it reaches a mark of 60.
    const edge = student(5, { quizzes: { scored: 1199, max: 2000 } });
    const c: PassCriteria = { weights: { attendance: 0, assignments: 0, quizzes: 100 }, passMark: 60 };
    expect(scoreRows([edge], c)[0]).toMatchObject({ score: 60, onTrack: true });
  });
});

describe("selection", () => {
  const rows = scoreRows([onTrack, below, rescaled, noScore], CRITERIA);

  it("starts on track and no score as Passed, below the mark as Did not pass", () => {
    expect(initialSelection(rows)).toEqual({ 1: "PASSED", 2: "NOT_PASSED", 3: "PASSED", 4: "PASSED" });
  });

  it("Select all on track passes every on-track row and leaves the rest", () => {
    const sel = { 1: "NOT_PASSED", 2: "NOT_PASSED", 3: "NOT_PASSED", 4: "NOT_PASSED" } as const;
    expect(selectAllOnTrack(sel, rows)).toEqual({ 1: "PASSED", 2: "NOT_PASSED", 3: "PASSED", 4: "NOT_PASSED" });
  });

  it("Clear marks everyone Did not pass", () => {
    expect(clearAll(rows)).toEqual({ 1: "NOT_PASSED", 2: "NOT_PASSED", 3: "NOT_PASSED", 4: "NOT_PASSED" });
  });

  it("keeps a hand-set row and re-selects the rest from the score", () => {
    expect(selectionFor(rows, { 2: "PASSED", 99: "NOT_PASSED" })).toEqual({
      1: "PASSED",
      2: "PASSED",
      3: "PASSED",
      4: "PASSED",
    });
  });
});

describe("rowLabel", () => {
  it("labels a result chosen against the score", () => {
    expect(rowLabel("PASSED", false)).toBe("Passed below the mark");
    expect(rowLabel("NOT_PASSED", true)).toBe("Did not pass above the mark");
  });

  it("says nothing when the result follows the score, or there is no score", () => {
    expect(rowLabel("PASSED", true)).toBeNull();
    expect(rowLabel("NOT_PASSED", false)).toBeNull();
    expect(rowLabel("PASSED", null)).toBeNull();
    expect(rowLabel("NOT_PASSED", null)).toBeNull();
  });
});

describe("fittedCriteria", () => {
  it("moves an inherited weight on an empty number to the others in proportion", () => {
    const c = check([], { available: { attendance: true, assignments: true, quizzes: false } });
    expect(fittedCriteria(c)).toEqual({ weights: { attendance: 57, assignments: 43, quizzes: 0 }, passMark: 60 });
  });

  it("keeps the criteria when the season has nothing at all to count", () => {
    const c = check([], { available: { attendance: false, assignments: false, quizzes: false } });
    expect(fittedCriteria(c)).toEqual(CRITERIA);
  });
});

describe("buildEndRequest", () => {
  it("carries the weights, the mark, the scores shown, who doesn't pass and the notes", () => {
    const c = check([onTrack, below, rescaled]);
    const sel = { 1: "PASSED", 2: "PASSED", 3: "NOT_PASSED" } as const;
    expect(buildEndRequest(c, CRITERIA, sel, { 2: "  Caught up late  ", 3: "", 9: "gone" })).toEqual({
      notPassed: [{ userId: 3, reason: null }],
      passedNotes: [{ userId: 2, note: "Caught up late" }],
      weights: CRITERIA.weights,
      passMark: 60,
      reviewed: {
        graduatesOnPass: false,
        userIds: [1, 2, 3],
        scores: [
          { userId: 1, score: 72.5 },
          { userId: 2, score: 33.5 },
          { userId: 3, score: 75 },
        ],
      },
    });
  });

  it("sends a reason for a student who doesn't pass", () => {
    const c = check([below]);
    expect(buildEndRequest(c, CRITERIA, { 2: "NOT_PASSED" }, { 2: "Missed most sessions" }).notPassed).toEqual([
      { userId: 2, reason: "Missed most sessions" },
    ]);
  });
});

describe("reviewRowView", () => {
  const [row] = scoreRows([rescaled], CRITERIA);

  it("shows the score, the three numbers and a re-scaled score's missing number", () => {
    expect(reviewRowView(rescaled, row!, "PASSED", CRITERIA).lines).toEqual([
      "Group A",
      "Score 75.0, on track",
      "Assignments 100%, quizzes 50%",
      "Scored without attendance",
    ]);
  });

  it("says a result chosen against the score, and no score in words", () => {
    const [b] = scoreRows([below], CRITERIA);
    expect(reviewRowView(below, b!, "PASSED", CRITERIA).lines).toContain("Passed below the mark");
    const [n] = scoreRows([noScore], CRITERIA);
    expect(reviewRowView(noScore, n!, "PASSED", CRITERIA).lines).toContain("No score");
  });
});

describe("confirmCopy", () => {
  it("says how many pass and how many don't", () => {
    expect(confirmCopy({ title: "GBV 2026", pass: 18, notPass: 4, graduating: false, year: 2026 })).toEqual({
      title: "End GBV 2026?",
      description:
        "18 students pass, 4 don't. Their leaders and admins lose access. This ends the season for 22 people.",
    });
  });

  it("names the class on a graduating season, in the singular too", () => {
    expect(confirmCopy({ title: "GBV 2026", pass: 1, notPass: 1, graduating: true, year: 2026 }).description).toBe(
      "1 student passes, 1 doesn't. 1 student graduates as JPCS-26. Their leaders and admins lose access. This ends the season for 2 people.",
    );
  });
});
