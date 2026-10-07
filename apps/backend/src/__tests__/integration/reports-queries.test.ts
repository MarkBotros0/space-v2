// apps/backend/src/__tests__/integration/reports-queries.test.ts
import { db } from "../../db/client";
import { newPublicId } from "../../lib/public-id";
import {
  buildEngagementSummary,
  listEngagementRows,
  resolveReportScope,
} from "../../lib/queries/reports";
import { cleanupTestData, createTestSeason, createTestUser } from "./fixtures";

// The shared Neon staging Postgres autosuspends; the first query after idle has
// been measured around 18s.
jest.setTimeout(60000);

let seasonId: number;
let otherSeasonId: number;
let deletedSeasonId: number;
let allGroupsAssignmentId: number;
let groupAAssignmentId: number;
let untargetedAssignmentId: number;

const S = ["2020-01-01", "2020-01-08", "2020-01-15", "2020-01-22"] as const;
const at = (d: string) => new Date(`${d}T18:00:00.000Z`);
let sessionIds: number[];

beforeAll(async () => {
  await cleanupTestData();

  const season = await createTestSeason();
  seasonId = season.id;
  otherSeasonId = (await createTestSeason()).id;

  const deleted = await createTestSeason();
  deletedSeasonId = deleted.id;
  await db.season.update({ where: { id: deletedSeasonId }, data: { deletedAt: new Date() } });

  const early = await createTestUser("rep-early", "STUDENT");
  const late = await createTestUser("rep-late", "STUDENT");
  const gone = await createTestUser("rep-gone", "STUDENT");
  const groupB = await createTestUser("rep-groupb", "STUDENT");

  const gA = await db.group.create({ data: { seasonId, name: "Group A" }, select: { id: true } });
  const gB = await db.group.create({ data: { seasonId, name: "Group B" }, select: { id: true } });

  const sessions = [];
  for (const d of S) {
    sessions.push(
      await db.session.create({
        data: { seasonId, title: `Session ${d}`, startsAt: at(d), durationMinutes: 60 },
        select: { id: true },
      }),
    );
  }
  sessionIds = sessions.map((s) => s.id);

  await db.seasonEnrollment.createMany({
    data: [
      {
        seasonId,
        studentUserId: early.id,
        groupId: gA.id,
        status: "ACTIVE",
        enrolledAt: new Date("2019-12-01T00:00:00.000Z"),
      },
      {
        seasonId,
        studentUserId: late.id,
        groupId: gA.id,
        status: "ACTIVE",
        enrolledAt: new Date("2020-01-10T00:00:00.000Z"),
      },
      {
        // On the roster for sessions 1 and 2, gone by session 3.
        seasonId,
        studentUserId: gone.id,
        groupId: gA.id,
        status: "WITHDRAWN",
        enrolledAt: new Date("2019-12-01T00:00:00.000Z"),
        droppedAt: new Date("2020-01-12T00:00:00.000Z"),
      },
      {
        seasonId,
        studentUserId: groupB.id,
        groupId: gB.id,
        status: "ACTIVE",
        enrolledAt: new Date("2019-12-01T00:00:00.000Z"),
      },
    ],
  });

  await db.attendance.createMany({
    data: [
      // Session 1 (2020-01-01): roster = early, gone, groupB (late has not joined).
      { sessionId: sessionIds[0]!, studentUserId: early.id, status: "PRESENT" },
      { sessionId: sessionIds[0]!, studentUserId: gone.id, status: "LATE", lateMinutes: 7 },
      { sessionId: sessionIds[0]!, studentUserId: groupB.id, status: "ABSENT" },
      // Session 2: early LATE, others absent/unrecorded.
      { sessionId: sessionIds[1]!, studentUserId: early.id, status: "LATE", lateMinutes: 3 },
      // Session 3: roster = early, late, groupB. `gone` has dropped but STILL
      // has a row — v1 counted it in the numerator while excluding them from
      // the denominator, which is how pct exceeded 100 (R12).
      { sessionId: sessionIds[2]!, studentUserId: gone.id, status: "PRESENT" },
      { sessionId: sessionIds[2]!, studentUserId: late.id, status: "PRESENT" },
      { sessionId: sessionIds[2]!, studentUserId: groupB.id, status: "PRESENT" },
      // Session 4: nobody.
    ],
  });

  const allGroups = await db.assignment.create({
    data: { seasonId, title: "For everyone", isAllGroups: true },
    select: { id: true },
  });
  allGroupsAssignmentId = allGroups.id;

  const groupAOnly = await db.assignment.create({
    data: {
      seasonId,
      title: "Group A only",
      isAllGroups: false,
      targets: { create: { groupId: gA.id } },
    },
    select: { id: true },
  });
  groupAAssignmentId = groupAOnly.id;

  // Targeted at nothing at all — v1 reported 0 % submitted for this (R22).
  const untargeted = await db.assignment.create({
    data: { seasonId, title: "Targeted at nobody", isAllGroups: false },
    select: { id: true },
  });
  untargetedAssignmentId = untargeted.id;

  await db.submission.createMany({
    data: [
      { assignmentId: allGroups.id, studentUserId: early.id, publicId: newPublicId(), status: "SUBMITTED" },
      { assignmentId: groupAOnly.id, studentUserId: early.id, publicId: newPublicId(), status: "REVIEWED" },
      // A DRAFT never counts as turned in (R19).
      { assignmentId: allGroups.id, studentUserId: late.id, publicId: newPublicId(), status: "DRAFT" },
      // A withdrawn student's submission: v1 counted it in the bar chart's
      // numerator while the denominator counted only current students (R23).
      { assignmentId: allGroups.id, studentUserId: gone.id, publicId: newPublicId(), status: "SUBMITTED" },
      { assignmentId: allGroups.id, studentUserId: groupB.id, publicId: newPublicId(), status: "RETURNED" },
    ],
  });
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("resolveReportScope — intersect, never check-then-run (ruling C8)", () => {
  it("returns the caller's whole permitted scope when nothing is requested", async () => {
    const scope = await resolveReportScope({ kind: "seasons", seasonIds: [seasonId, otherSeasonId] }, []);
    expect(scope.seasonIds.sort()).toEqual([seasonId, otherSeasonId].sort());
    expect(scope.truncated).toBe(false);
  });

  it("drops a requested season the caller may not see, and flags truncated", async () => {
    const scope = await resolveReportScope({ kind: "seasons", seasonIds: [seasonId] }, [
      seasonId,
      otherSeasonId,
    ]);
    // THE test this task exists for. v1's loadReportsData took whatever
    // integers the caller passed and queried them (R3); the only protection was
    // which server component called it. Here the request never reaches a where
    // clause — the intersection does.
    expect(scope.seasonIds).toEqual([seasonId]);
    expect(scope.truncated).toBe(true);
  });

  it("drops a soft-deleted season silently rather than 404ing it", async () => {
    // No existence oracle: "not yours" and "does not exist" must look the same
    // to a caller enumerating ids (spec §4 item 1).
    const scope = await resolveReportScope({ kind: "all" }, [deletedSeasonId]);
    expect(scope.seasonIds).toEqual([]);
    expect(scope.truncated).toBe(true);
  });

  it("labels a single season by title and a multi-season scope by count", async () => {
    const one = await resolveReportScope({ kind: "seasons", seasonIds: [seasonId] }, []);
    expect(one.label).toBe("Test Season");
    const many = await resolveReportScope({ kind: "seasons", seasonIds: [seasonId, otherSeasonId] }, []);
    expect(many.label).toBe("2 seasons");
  });
});

describe("buildEngagementSummary — attendance trend", () => {
  it("divides each session by the roster AS IT STOOD, so pct never exceeds 100 (D3)", async () => {
    const scope = await resolveReportScope({ kind: "seasons", seasonIds: [seasonId] }, []);
    const summary = await buildEngagementSummary(scope, { trendLimit: 26 });

    const byId = new Map(summary.attendanceTrend.map((p) => [p.sessionId, p]));

    // Session 1: roster is early + gone + groupB (late enrolled 2020-01-10).
    // Present: early PRESENT, gone LATE → 2 of 3 → 67.
    expect(byId.get(sessionIds[0]!)).toMatchObject({
      expectedCount: 3,
      presentCount: 2,
      pct: 67,
    });

    // Session 3: roster is early + late + groupB — `gone` dropped 2020-01-12.
    // `gone` still has a PRESENT row on this session; v1 counted it in the
    // numerator while excluding them from the denominator, giving 3/3 here and
    // >100% on a season that had lost more students (R12).
    expect(byId.get(sessionIds[2]!)).toMatchObject({
      expectedCount: 3,
      presentCount: 2,
      pct: 67,
    });

    for (const p of summary.attendanceTrend) {
      expect(p.pct === null || p.pct <= 100).toBe(true);
      expect(p.presentCount).toBeLessThanOrEqual(p.expectedCount);
    }
  });

  it("carries the raw instant and the season, not a pre-formatted MMM d label (C2, R15)", async () => {
    const scope = await resolveReportScope({ kind: "seasons", seasonIds: [seasonId] }, []);
    const summary = await buildEngagementSummary(scope, { trendLimit: 26 });
    const first = summary.attendanceTrend[0]!;
    expect(first.startsAt).toBe(at(S[0]).toISOString());
    expect(first.seasonId).toBe(seasonId);
    expect(first.title).toBe(`Session ${S[0]}`);
  });

  it("windows to the most recent trendLimit sessions, still ascending", async () => {
    const scope = await resolveReportScope({ kind: "seasons", seasonIds: [seasonId] }, []);
    const summary = await buildEngagementSummary(scope, { trendLimit: 2 });
    expect(summary.attendanceTrend.map((p) => p.sessionId)).toEqual([
      sessionIds[2]!,
      sessionIds[3]!,
    ]);
  });

  it("honours from/to — v1 declared them and no caller ever passed them (R5)", async () => {
    const scope = await resolveReportScope({ kind: "seasons", seasonIds: [seasonId] }, []);
    const summary = await buildEngagementSummary(scope, {
      trendLimit: 26,
      from: at("2020-01-08"),
      to: at("2020-01-15"),
    });
    expect(summary.attendanceTrend.map((p) => p.sessionId)).toEqual([
      sessionIds[1]!,
      sessionIds[2]!,
    ]);
  });

  it("never includes a future session even when `to` is far in the future", async () => {
    const future = await db.session.create({
      data: {
        seasonId,
        title: "Not yet",
        startsAt: new Date("2999-01-01T00:00:00.000Z"),
        durationMinutes: 60,
      },
      select: { id: true },
    });
    const scope = await resolveReportScope({ kind: "seasons", seasonIds: [seasonId] }, []);
    const summary = await buildEngagementSummary(scope, {
      trendLimit: 26,
      to: new Date("3000-01-01T00:00:00.000Z"),
    });
    // `to` and `startsAt <= now` are both `lte` on one field. Spreading them
    // into one object silently drops `now` and un-bounds the query (D-17.12).
    expect(summary.attendanceTrend.map((p) => p.sessionId)).not.toContain(future.id);
  });
});

describe("buildEngagementSummary — assignment completion", () => {
  it("intersects the numerator with the expected set, so a bar cannot exceed 100 (R23)", async () => {
    const scope = await resolveReportScope({ kind: "seasons", seasonIds: [seasonId] }, []);
    const summary = await buildEngagementSummary(scope, { trendLimit: 26 });
    const byId = new Map(summary.completion.map((r) => [r.assignmentId, r]));

    // isAllGroups: expected = the 3 ACTIVE enrolments (the withdrawn student is
    // not expected). Non-DRAFT submissions exist from early, gone and groupB —
    // but `gone` is not in the expected set, so 2 of 3.
    expect(byId.get(allGroupsAssignmentId)).toMatchObject({
      targeting: "all_groups",
      expected: 3,
      completed: 2,
      completionRate: 67,
    });
  });

  it("resolves targeting through SeasonEnrollment, not GroupStudent (ruling C9)", async () => {
    const scope = await resolveReportScope({ kind: "seasons", seasonIds: [seasonId] }, []);
    const summary = await buildEngagementSummary(scope, { trendLimit: 26 });
    const row = summary.completion.find((r) => r.assignmentId === groupAAssignmentId)!;
    // Group A's ACTIVE enrolments are early and late. GroupStudent has no rows
    // at all in this fixture — v1's denominator would have been 0 here, and
    // GroupStudent is unique on studentUserId across the whole database anyway,
    // so it can never answer a per-season question (R21).
    expect(row).toMatchObject({ targeting: "targeted", expected: 2, completed: 1, completionRate: 50 });
  });

  it("returns null, not 0 %, for an assignment targeted at nobody (R22)", async () => {
    const scope = await resolveReportScope({ kind: "seasons", seasonIds: [seasonId] }, []);
    const summary = await buildEngagementSummary(scope, { trendLimit: 26 });
    const row = summary.completion.find((r) => r.assignmentId === untargetedAssignmentId)!;
    // "0 % submitted" reads as total cohort failure; it is a mis-configured
    // assignment. null renders as "—".
    expect(row).toMatchObject({ expected: 0, completed: 0, completionRate: null });
  });
});

describe("buildEngagementSummary — bands, at-risk and counts", () => {
  it("emits all four bands in order including empty ones (R31)", async () => {
    const scope = await resolveReportScope({ kind: "seasons", seasonIds: [seasonId] }, []);
    const summary = await buildEngagementSummary(scope, { trendLimit: 26 });
    expect(summary.bands.map((b) => b.band)).toEqual(["HIGH", "MEDIUM", "LOW", "AT_RISK"]);
    expect(summary.bands.reduce((n, b) => n + b.count, 0)).toBe(summary.enrollmentCount);
  });

  it("caps the at-risk list at 10 and returns the uncapped total (R33, D16)", async () => {
    const scope = await resolveReportScope({ kind: "seasons", seasonIds: [seasonId] }, []);
    const summary = await buildEngagementSummary(scope, { trendLimit: 26 });
    expect(summary.atRisk.length).toBeLessThanOrEqual(10);
    expect(summary.atRiskTotal).toBeGreaterThanOrEqual(summary.atRisk.length);
    // The list IS the band — there is one predicate (D-17.2).
    expect(summary.atRisk.every((r) => r.band === "AT_RISK")).toBe(true);
    const atRiskBand = summary.bands.find((b) => b.band === "AT_RISK")!;
    expect(atRiskBand.count).toBe(summary.atRiskTotal);
  });

  it("counts enrolments and students separately (R32)", async () => {
    const scope = await resolveReportScope({ kind: "seasons", seasonIds: [seasonId] }, []);
    const summary = await buildEngagementSummary(scope, { trendLimit: 26 });
    // Three ACTIVE enrolments, three distinct students, one season.
    expect(summary.enrollmentCount).toBe(3);
    expect(summary.cohortSize).toBe(3);
  });

  it("does NOT carry the cohort — the summary is not a student export (R34)", async () => {
    const scope = await resolveReportScope({ kind: "seasons", seasonIds: [seasonId] }, []);
    const summary = await buildEngagementSummary(scope, { trendLimit: 26 });
    expect("rawStudents" in summary).toBe(false);
    // Only the capped at-risk rows carry an email, and there are at most ten.
    const emails = JSON.stringify(summary).match(/@jpc\.test/g) ?? [];
    expect(emails.length).toBeLessThanOrEqual(10);
  });

  it("returns empty collections rather than throwing on an empty scope (R2)", async () => {
    const scope = await resolveReportScope({ kind: "seasons", seasonIds: [] }, []);
    const summary = await buildEngagementSummary(scope, { trendLimit: 26 });
    expect(summary).toMatchObject({
      attendanceTrend: [],
      completion: [],
      atRisk: [],
      atRiskTotal: 0,
      cohortSize: 0,
      enrollmentCount: 0,
    });
    expect(summary.bands.map((b) => b.count)).toEqual([0, 0, 0, 0]);
  });
});

describe("listEngagementRows — the cohort, paged", () => {
  it("pages a stable ordering and stops with a null cursor", async () => {
    const scope = await resolveReportScope({ kind: "seasons", seasonIds: [seasonId] }, []);
    const first = await listEngagementRows(scope, { limit: 2 });
    expect(first.rows).toHaveLength(2);
    expect(first.total).toBe(3);
    expect(first.nextCursor).not.toBeNull();

    const second = await listEngagementRows(scope, { limit: 2, cursor: first.nextCursor! });
    expect(second.rows).toHaveLength(1);
    expect(second.nextCursor).toBeNull();

    const ids = [...first.rows, ...second.rows].map((r) => r.studentUserId);
    expect(new Set(ids).size).toBe(3);
    // Ascending by score: the students who need attention are on page one.
    const scores = [...first.rows, ...second.rows].map((r) => r.score);
    expect([...scores].sort((a, b) => a - b)).toEqual(scores);
  });

  it("filters to a band", async () => {
    const scope = await resolveReportScope({ kind: "seasons", seasonIds: [seasonId] }, []);
    const page = await listEngagementRows(scope, { limit: 50, band: "AT_RISK" });
    expect(page.rows.every((r) => r.band === "AT_RISK")).toBe(true);
  });

  it("ignores a malformed cursor instead of throwing", async () => {
    const scope = await resolveReportScope({ kind: "seasons", seasonIds: [seasonId] }, []);
    const page = await listEngagementRows(scope, { limit: 50, cursor: "not-a-cursor" });
    expect(page.rows).toHaveLength(3);
  });
});
