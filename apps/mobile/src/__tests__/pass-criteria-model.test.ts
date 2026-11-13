import type { PassingOutlook, PassingOutlookRow } from "@space/shared";

import {
  draftFrom,
  draftWeights,
  fieldOff,
  parseCriteria,
  splitEqually,
  stepDraft,
} from "../screens/season-passing/criteria-model";
import { criteriaNotes, outlookHeader, outlookRowView, outlookSections } from "../screens/season-passing/outlook-model";

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
  it("reads the weights, a blank or a stray character as 0", () => {
    expect(draftWeights(draft("40", "30", "30"))).toEqual({ attendance: 40, assignments: 30, quizzes: 30 });
    expect(draftWeights(draft("", "30", "x"))).toEqual({ attendance: 0, assignments: 30, quizzes: 0 });
    expect(draftWeights(draft("101", "30", "-5"))).toEqual({ attendance: 0, assignments: 30, quizzes: 0 });
  });

  it("splits equally over the numbers that are on, adding up to 100", () => {
    expect(splitEqually(all)).toEqual({ attendance: "34", assignments: "33", quizzes: "33" });
    expect(splitEqually(noQuizzes)).toEqual({ attendance: "50", assignments: "50", quizzes: "0" });
    // Nothing to count at all: every field is on.
    expect(splitEqually(none)).toEqual({ attendance: "34", assignments: "33", quizzes: "33" });
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
  it("counts the tiles and those not scored yet", () => {
    expect(outlookHeader(outlook())).toEqual({ onTrack: 14, below: 1, noScore: null });
    const o = outlook({ onTrack: 0, below: 2, rows: [row(), row({ userId: 2 }), row({ userId: 3, score: null })] });
    expect(outlookHeader(o)).toEqual({ onTrack: 0, below: 2, noScore: "1 not scored yet" });
  });

  it("splits the list into sections with their counts, leaving out an empty one", () => {
    const o = outlook({
      rows: [row(), row({ userId: 2, score: 70, pointsShort: null }), row({ userId: 3 })],
    });
    expect(outlookSections(o).map((s) => [s.header, s.rows.map((r) => r.userId)])).toEqual([
      ["Below the mark (2)", [1, 3]],
      ["On track (1)", [2]],
    ]);
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
      standing: "below",
      badge: "52.0",
      chip: { tone: "bad", label: "Below the mark" },
      lines: ["8 points short · Quizzes 45%", "Group A"],
    });
    expect(outlookRowView(row({ pointsShort: 0.5, score: 59.5 }), outlook()).lines[0]).toMatch(/^0.5 points short/);
    expect(outlookRowView(row({ pointsShort: 1, score: 59 }), outlook()).lines[0]).toMatch(/^1 point short /);
  });

  it("a row on track says how far above the mark; a row with no score says so", () => {
    expect(outlookRowView(row({ score: 72.5, pointsShort: null, groupName: null }), outlook())).toMatchObject({
      badge: "72.5",
      chip: { tone: "ok", label: "On track" },
      lines: ["12.5 points above the mark"],
    });
    expect(outlookRowView(row({ score: 60, pointsShort: null }), outlook()).lines[0]).toBe("Right at the mark");
    expect(outlookRowView(row({ score: null, pointsShort: null, weakest: null }), outlook())).toMatchObject({
      badge: "–",
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
    expect(outlookRowView(late, outlook()).lines).toEqual(["20 points above the mark", "Scored without attendance"]);
  });
});
