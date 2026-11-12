import type { PassingOutlook, PassingOutlookRow } from "@space/shared";

import { draftFrom, draftTotal, fieldOff, parseCriteria, stepDraft } from "../screens/season-passing/criteria-model";
import { criteriaLines, criteriaNotes, outlookHeader, outlookRowView } from "../screens/season-passing/outlook-model";

const all = { attendance: true, assignments: true, quizzes: true };
const noQuizzes = { attendance: true, assignments: true, quizzes: false };
const none = { attendance: false, assignments: false, quizzes: false };
const draft = (attendance: string, assignments: string, quizzes: string, passMark = "60") => ({
  attendance,
  assignments,
  quizzes,
  passMark,
});

describe("criteria model", () => {
  it("adds the weights, reading a blank or a stray character as 0", () => {
    expect(draftTotal(draft("40", "30", "30"))).toBe(100);
    expect(draftTotal(draft("30", "30", "30"))).toBe(90);
    expect(draftTotal(draft("", "30", "x"))).toBe(30);
  });

  it("parses whole percentages that add up to 100", () => {
    expect(parseCriteria(draft("40", "30", "30", "60"), all)).toEqual({
      ok: true,
      criteria: { weights: { attendance: 40, assignments: 30, quizzes: 30 }, passMark: 60 },
    });
  });

  it("refuses weights that don't add up, and a pass mark out of range", () => {
    const parsed = parseCriteria(draft("30", "30", "30", "101"), all);
    expect(parsed).toEqual({
      ok: false,
      errors: { total: "The weights must add up to 100%.", passMark: "Enter a pass mark from 0 to 100." },
    });
    expect(parseCriteria(draft("40", "30", "30", ""), all)).toMatchObject({
      ok: false,
      errors: { passMark: "Enter a pass mark from 0 to 100." },
    });
    expect(parseCriteria(draft("40.5", "29.5", "30"), all)).toMatchObject({
      ok: false,
      errors: { attendance: "Enter a whole number from 0 to 100." },
    });
  });

  it("an unavailable number is off and counts as 0 whatever its field says", () => {
    expect(fieldOff("quizzes", noQuizzes)).toBe(true);
    expect(fieldOff("attendance", noQuizzes)).toBe(false);
    expect(parseCriteria(draft("60", "40", "30"), noQuizzes)).toEqual({
      ok: true,
      criteria: { weights: { attendance: 60, assignments: 40, quizzes: 0 }, passMark: 60 },
    });
  });

  it("a season with nothing to count leaves every field on", () => {
    expect(fieldOff("attendance", none)).toBe(false);
    expect(parseCriteria(draft("40", "30", "30"), none)).toMatchObject({ ok: true });
  });

  it("starts from the criteria, moving an unavailable number's weight to the others", () => {
    const c = { weights: { attendance: 40, assignments: 30, quizzes: 30 }, passMark: 60 };
    expect(draftFrom(c, all)).toEqual(draft("40", "30", "30", "60"));
    // 40 / 30 re-scaled to 100: 57.1 / 42.9.
    expect(draftFrom(c, noQuizzes)).toEqual(draft("57", "43", "0", "60"));
    const onlyQuizzesWeighted = { weights: { attendance: 0, assignments: 0, quizzes: 100 }, passMark: 50 };
    expect(draftFrom(onlyQuizzesWeighted, noQuizzes)).toEqual(draft("50", "50", "0", "50"));
    expect(draftFrom(c, none)).toEqual(draft("40", "30", "30", "60"));
  });

  it("steps a field by 5 within 0 and 100", () => {
    expect(stepDraft("40", 5)).toBe("45");
    expect(stepDraft("98", 5)).toBe("100");
    expect(stepDraft("3", -5)).toBe("0");
    expect(stepDraft("", 5)).toBe("5");
  });
});

const numbers = {
  attendance: { attended: 8, total: 10 },
  assignments: { submitted: 3, total: 4 },
  quizzes: { scored: 9, max: 20 },
};
const row = (over: Partial<PassingOutlookRow> = {}): PassingOutlookRow => ({
  userId: 1,
  name: "Sara",
  groupName: "Group A",
  numbers,
  score: 52,
  rescaled: false,
  pointsShort: 8,
  weakest: "quizzes",
  ...over,
});
const outlook = (over: Partial<PassingOutlook> = {}): PassingOutlook => ({
  criteria: { weights: { attendance: 40, assignments: 30, quizzes: 30 }, passMark: 60 },
  isDefault: false,
  available: all,
  weightsIgnored: [],
  canEditCriteria: true,
  onTrack: 14,
  below: 1,
  rows: [row()],
  ...over,
});

describe("outlook model", () => {
  it("counts on their own lines, with plurals", () => {
    expect(outlookHeader(outlook())).toEqual({ onTrack: "14 on track", below: "1 below the mark", noScore: null });
    const o = outlook({ onTrack: 0, below: 2, rows: [row(), row({ userId: 2 }), row({ userId: 3, score: null })] });
    expect(outlookHeader(o)).toEqual({ onTrack: "0 on track", below: "2 below the mark", noScore: "1 not scored yet" });
  });

  it("names the criteria in words", () => {
    expect(criteriaLines(outlook())).toEqual(["Attendance 40%", "Assignments 30%", "Quizzes 30%", "Pass mark 60"]);
  });

  it("says when the criteria are a default or a weight counts as 0", () => {
    expect(criteriaNotes(outlook())).toEqual([]);
    expect(criteriaNotes(outlook({ isDefault: true, weightsIgnored: ["quizzes"] }))).toEqual([
      "Suggested criteria: nobody has saved criteria for this season yet.",
      "Quizzes has nothing to count this season, so its 30% counts as 0.",
    ]);
  });

  it("a row below the mark says how far short and its weakest number", () => {
    expect(outlookRowView(row(), outlook())).toEqual({
      userId: 1,
      name: "Sara",
      chip: { tone: "bad", label: "Below the mark" },
      lines: ["8 points short", "Quizzes 45%", "Score 52.0", "Group A"],
    });
    expect(outlookRowView(row({ pointsShort: 0.5, score: 59.5 }), outlook()).lines[0]).toBe("0.5 points short");
    expect(outlookRowView(row({ pointsShort: 1, score: 59 }), outlook()).lines[0]).toBe("1 point short");
  });

  it("a row on track shows its score; a row with no score says so", () => {
    expect(outlookRowView(row({ score: 60, pointsShort: null, groupName: null }), outlook())).toMatchObject({
      chip: { tone: "ok", label: "On track" },
      lines: ["Score 60.0"],
    });
    expect(outlookRowView(row({ score: null, pointsShort: null, weakest: null }), outlook())).toMatchObject({
      chip: { tone: "neutral", label: "No score yet" },
      lines: ["Nothing to count for them yet", "Group A"],
    });
  });

  it("a re-scaled row says which number it was scored without", () => {
    const late = row({
      numbers: { ...numbers, attendance: { attended: 0, total: 0 } },
      rescaled: true,
      score: 80,
      pointsShort: null,
      weakest: "assignments",
      groupName: null,
    });
    expect(outlookRowView(late, outlook()).lines).toEqual(["Score 80.0", "Scored without attendance"]);
  });
});
