// apps/backend/src/__tests__/integration/season-workbook.test.ts
import type { Workbook } from "exceljs";

import { db } from "../../db/client";
import { newPublicId } from "../../lib/public-id";
import { buildSeasonWorkbook, summariseSeasonWorkbook } from "../../lib/exports/season-workbook";
import { cleanupTestData, createTestSeason, createTestUser } from "./fixtures";

jest.setTimeout(60000);

let seasonId: number;
let deletedSeasonId: number;
let groupAId: number;
let aliceId: number;
let bobId: number;

/** Read a sheet's rows as arrays of cell values, header first. */
function sheetRows(workbook: Workbook, name: string): unknown[][] {
  const sheet = workbook.getWorksheet(name);
  if (!sheet) throw new Error(`missing sheet ${name}`);
  const out: unknown[][] = [];
  sheet.eachRow((row) => {
    // row.values is 1-indexed with a leading undefined.
    out.push((row.values as unknown[]).slice(1));
  });
  return out;
}

beforeAll(async () => {
  await cleanupTestData();

  const season = await createTestSeason();
  seasonId = season.id;
  const deleted = await createTestSeason();
  deletedSeasonId = deleted.id;
  await db.season.update({ where: { id: deletedSeasonId }, data: { deletedAt: new Date() } });

  const alice = await createTestUser("wb-alice", "STUDENT");
  const bob = await createTestUser("wb-bob", "STUDENT");
  aliceId = alice.id;
  bobId = bob.id;

  const gA = await db.group.create({ data: { seasonId, name: "Group A" }, select: { id: true } });
  const gB = await db.group.create({ data: { seasonId, name: "Group B" }, select: { id: true } });
  groupAId = gA.id;

  const s1 = await db.session.create({
    data: {
      seasonId,
      title: "Opening",
      startsAt: new Date("2020-03-01T18:00:00.000Z"),
      durationMinutes: 60,
    },
    select: { id: true },
  });
  const s2 = await db.session.create({
    data: {
      seasonId,
      title: "Week two",
      startsAt: new Date("2020-03-08T18:00:00.000Z"),
      durationMinutes: 60,
    },
    select: { id: true },
  });
  await db.session.create({
    data: {
      seasonId,
      title: "Not yet",
      startsAt: new Date("2999-01-01T00:00:00.000Z"),
      durationMinutes: 60,
    },
  });

  await db.seasonEnrollment.createMany({
    data: [
      {
        seasonId,
        studentUserId: alice.id,
        groupId: gA.id,
        status: "ACTIVE",
        enrolledAt: new Date("2020-01-01T00:00:00.000Z"),
      },
      {
        seasonId,
        studentUserId: bob.id,
        groupId: gB.id,
        status: "ACTIVE",
        enrolledAt: new Date("2020-01-01T00:00:00.000Z"),
      },
    ],
  });

  await db.attendance.createMany({
    data: [
      { sessionId: s1.id, studentUserId: alice.id, status: "PRESENT" },
      // A LATE row WITH minutes recorded. v1 printed the 12 into the cell.
      { sessionId: s2.id, studentUserId: alice.id, status: "LATE", lateMinutes: 12 },
      { sessionId: s1.id, studentUserId: bob.id, status: "ABSENT" },
      // bob has no row at all for s2 — the blank case.
    ],
  });

  // A published PAPER quiz, an UNPUBLISHED ONLINE quiz, and a zero-max quiz.
  const paper = await db.quiz.create({
    data: { seasonId, title: "Paper one", kind: "PAPER", maxScore: 20 },
    select: { id: true },
  });
  await db.quiz.create({
    data: { seasonId, title: "Draft online", kind: "ONLINE", maxScore: 10, publishedAt: null },
  });
  await db.quiz.create({
    data: { seasonId, title: "Zero max", kind: "PAPER", maxScore: 0 },
  });
  await db.quizGrade.create({
    data: { quizId: paper.id, studentUserId: alice.id, score: 15 },
  });

  const allGroups = await db.assignment.create({
    data: { seasonId, title: "For everyone", isAllGroups: true },
    select: { id: true },
  });
  const groupAOnly = await db.assignment.create({
    data: {
      seasonId,
      title: "Group A only",
      isAllGroups: false,
      targets: { create: { groupId: gA.id } },
    },
    select: { id: true },
  });

  await db.submission.createMany({
    data: [
      { assignmentId: allGroups.id, studentUserId: alice.id, publicId: newPublicId(), status: "SUBMITTED" },
      { assignmentId: groupAOnly.id, studentUserId: alice.id, publicId: newPublicId(), status: "DRAFT" },
    ],
  });
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("buildSeasonWorkbook", () => {
  it("returns null for a soft-deleted season (D14)", async () => {
    // v1 fetched the season with findUniqueOrThrow on id alone (R81), so
    // anyone holding a deleted season's id could export its complete
    // attendance and grade history.
    expect(await buildSeasonWorkbook(deletedSeasonId)).toBeNull();
  });

  it("has four sheets: the three data sheets plus a Key (D-17.14)", async () => {
    const result = (await buildSeasonWorkbook(seasonId))!;
    expect(result.workbook.worksheets.map((w) => w.name)).toEqual([
      "Attendance",
      "Grades",
      "Assignments",
      "Key",
    ]);
  });

  it("prints 'L' for a LATE cell and never the recorded minutes (ruling C3)", async () => {
    const result = (await buildSeasonWorkbook(seasonId))!;
    const rows = sheetRows(result.workbook, "Attendance");
    const alice = rows.find((r) => r[0] === "Test wb-alice")!;
    // Columns: Student, Email, Group, <session 1>, <session 2>, Attendance %.
    expect(alice[3]).toBe("P");
    // v1 printed 12 here — minutes measured from when an admin pressed the
    // check-in button, not from the session start, exported to a spreadsheet
    // where a reader treats it as minutes late (R69, R70). Withheld until the
    // cutover backfill.
    expect(alice[4]).toBe("L");
    expect(alice[4]).not.toBe(12);
  });

  it("keeps the session columns a single cell type (R71)", async () => {
    const result = (await buildSeasonWorkbook(seasonId))!;
    const rows = sheetRows(result.workbook, "Attendance");
    for (const row of rows.slice(1)) {
      for (const cell of row.slice(3, -1)) {
        expect(typeof cell).toBe("string");
      }
    }
  });

  it("excludes future sessions and labels past ones with the year (R68, D12)", async () => {
    const result = (await buildSeasonWorkbook(seasonId))!;
    const header = sheetRows(result.workbook, "Attendance")[0]!;
    expect(header).toEqual([
      "Student",
      "Email",
      "Group",
      "Mar 1, 2020 · Opening",
      "Mar 8, 2020 · Week two",
      "Attendance %",
    ]);
    // v1's header was `MMM d` with no year, so sessions from different seasons
    // collapsed onto the same label.
    expect(header.join(" ")).not.toContain("Not yet");
  });

  it("uses the enrolment's group, not GroupStudent (R66, ruling C9)", async () => {
    const result = (await buildSeasonWorkbook(seasonId))!;
    const rows = sheetRows(result.workbook, "Attendance");
    expect(rows.find((r) => r[0] === "Test wb-alice")![2]).toBe("Group A");
    expect(rows.find((r) => r[0] === "Test wb-bob")![2]).toBe("Group B");
    expect(groupAId).toBeGreaterThan(0);
  });

  it("drops an unpublished ONLINE quiz and a zero-max quiz from Grades (D16)", async () => {
    const result = (await buildSeasonWorkbook(seasonId))!;
    const header = sheetRows(result.workbook, "Grades")[0]!;
    expect(header).toEqual(["Student", "Email", "Group", "Paper one (/20)", "Average %"]);
    // v1 had no publishedAt filter (R74), so a draft quiz became a column of
    // blanks that looks like a cohort-wide failure to sit it; and a maxScore=0
    // quiz printed a score while being excluded from the average (R77).
    expect(header.join(" ")).not.toContain("Draft online");
    expect(header.join(" ")).not.toContain("Zero max");
  });

  it("marks an assignment a student was never given as n/a, not as a miss (D-17.15)", async () => {
    const result = (await buildSeasonWorkbook(seasonId))!;
    const rows = sheetRows(result.workbook, "Assignments");
    const header = rows[0]!;
    expect(header).toEqual([
      "Student",
      "Email",
      "Group",
      "For everyone",
      "Group A only",
      "Submitted % (assigned to student)",
    ]);

    const bob = rows.find((r) => r[0] === "Test wb-bob")!;
    // bob is in Group B; "Group A only" was never his to do. v1 gave every
    // student a column for every assignment and divided by all of them (R78,
    // R80), so bob was marked down for work nobody assigned him.
    expect(bob[4]).toBe("n/a");
    expect(bob[3]).toBe("");
  });

  it("divides Submitted % by the assignments assigned to that student (ruling C5)", async () => {
    const result = (await buildSeasonWorkbook(seasonId))!;
    const rows = sheetRows(result.workbook, "Assignments");
    const alice = rows.find((r) => r[0] === "Test wb-alice")!;
    const bob = rows.find((r) => r[0] === "Test wb-bob")!;
    // alice: 2 assigned, 1 turned in (the other is a DRAFT) → 50.
    expect(alice[5]).toBe(50);
    // bob: 1 assigned, 0 turned in → 0. v1 divided by 2 for both.
    expect(bob[5]).toBe(0);
  });

  it("agrees with the engagement report cell-for-cell (ruling C4)", async () => {
    const { computeEngagementForSeasons } = await import("../../lib/queries/engagement");
    const rows = await computeEngagementForSeasons([seasonId]);
    const alice = rows.find((r) => r.studentUserId === aliceId)!;

    const result = (await buildSeasonWorkbook(seasonId))!;
    const attendance = sheetRows(result.workbook, "Attendance").find(
      (r) => r[0] === "Test wb-alice",
    )!;
    const assignments = sheetRows(result.workbook, "Assignments").find(
      (r) => r[0] === "Test wb-alice",
    )!;

    // The workbook reads these two columns from the SAME function the report
    // does. v1 computed them independently and they disagreed for any season
    // with a group-targeted assignment (spec D2).
    expect(attendance[5]).toBe(alice.attendancePct);
    expect(assignments[5]).toBe(alice.submissionPct);
    expect(bobId).toBeGreaterThan(0);
  });

  it("sorts rows by a pinned collator, not the server's incidental default (R65)", async () => {
    const result = (await buildSeasonWorkbook(seasonId))!;
    const names = sheetRows(result.workbook, "Attendance")
      .slice(1)
      .map((r) => String(r[0]));
    expect(names).toEqual([...names].sort(new Intl.Collator("en", { sensitivity: "base" }).compare));
  });

  it("puts the method notes and the symbol legend on the Key sheet, not in a data row", async () => {
    const result = (await buildSeasonWorkbook(seasonId))!;
    const key = sheetRows(result.workbook, "Key")
      .flat()
      .map((c) => String(c ?? ""))
      .join("\n");
    expect(key).toContain("n/a");
    expect(key).toContain("Late arrivals show as");
    // A legend row inside a data sheet breaks sorting and filtering — the two
    // things an operator opens a spreadsheet to do.
    const attendanceCells = sheetRows(result.workbook, "Attendance").flat().map(String);
    expect(attendanceCells.some((c) => c.includes("Late arrivals show as"))).toBe(false);
  });
});

describe("summariseSeasonWorkbook", () => {
  it("reports the sheet shape without building the workbook", async () => {
    const summary = (await summariseSeasonWorkbook(seasonId))!;
    expect(summary.rowCount).toBe(2);
    expect(summary.sheets.map((s) => s.name)).toEqual([
      "Attendance",
      "Grades",
      "Assignments",
      "Key",
    ]);
    // 3 identity columns + 2 past sessions + 1 percentage.
    expect(summary.sheets[0]!.columnCount).toBe(6);
    expect(summary.estimatedBytes).toBeGreaterThan(0);
  });

  it("returns null for a soft-deleted season, like the builder", async () => {
    expect(await summariseSeasonWorkbook(deletedSeasonId)).toBeNull();
  });
});
