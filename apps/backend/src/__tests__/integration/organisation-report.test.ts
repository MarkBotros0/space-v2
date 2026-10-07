// apps/backend/src/__tests__/integration/organisation-report.test.ts
import { db } from "../../db/client";
import { buildOrganisationReport } from "../../lib/queries/organisation-report";
import { cleanupTestData, createTestSeason, createTestUser } from "./fixtures";

jest.setTimeout(60000);

let seasonId: number;
let deletedSeasonId: number;

beforeAll(async () => {
  await cleanupTestData();

  const season = await createTestSeason({ status: "ACTIVE", year: 2099 });
  seasonId = season.id;

  const deleted = await createTestSeason({ status: "ACTIVE", year: 2098 });
  deletedSeasonId = deleted.id;
  await db.season.update({ where: { id: deletedSeasonId }, data: { deletedAt: new Date() } });

  const active = await createTestUser("org-active", "STUDENT");
  const completed = await createTestUser("org-completed", "STUDENT");
  const withdrawn = await createTestUser("org-withdrawn", "STUDENT");
  const neverEnrolled = await createTestUser("org-never", "STUDENT");
  const alumnusA = await createTestUser("org-alum-a", "STUDENT");
  const alumnusB = await createTestUser("org-alum-b", "STUDENT");
  const alumnusC = await createTestUser("org-alum-c", "STUDENT");
  const leaderOne = await createTestUser("org-leader-1", "LEADER");
  const leaderTwo = await createTestUser("org-leader-2", "LEADER");

  await db.user.update({ where: { id: alumnusA.id }, data: { graduationYear: 2098 } });
  await db.user.update({ where: { id: alumnusB.id }, data: { graduationYear: 2098 } });
  await db.user.update({ where: { id: alumnusC.id }, data: { graduationYear: 2097 } });

  // leaderOne leads BOTH groups in this season and must be counted once (R56).
  const groupA = await db.group.create({
    data: {
      seasonId,
      name: "Group A",
      leaders: { create: [{ userId: leaderOne.id }, { userId: leaderTwo.id }] },
    },
    select: { id: true },
  });
  await db.group.create({
    data: { seasonId, name: "Group B", leaders: { create: { userId: leaderOne.id } } },
    select: { id: true },
  });

  await db.seasonEnrollment.createMany({
    data: [
      { seasonId, studentUserId: active.id, groupId: groupA.id, status: "ACTIVE" },
      { seasonId, studentUserId: completed.id, groupId: groupA.id, status: "COMPLETED" },
      { seasonId, studentUserId: withdrawn.id, groupId: groupA.id, status: "WITHDRAWN" },
    ],
  });

  expect(neverEnrolled.id).toBeGreaterThan(0);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("buildOrganisationReport", () => {
  it("tallies the three enrolment statuses with one groupBy, naming WITHDRAWN honestly", async () => {
    const report = await buildOrganisationReport();
    const row = report.seasons.find((s) => s.seasonId === seasonId)!;
    // v1 loaded EVERY enrolment row of EVERY season and counted them in JS,
    // with no aggregate and no bound (R55).
    expect(row).toMatchObject({ activeCount: 1, completedCount: 1, withdrawnCount: 1 });
    // The contract names the enum member; the display label stays "Dropped" (R54).
    expect("droppedCount" in row).toBe(false);
  });

  it("counts a leader of two groups in one season once (R56)", async () => {
    const report = await buildOrganisationReport();
    const row = report.seasons.find((s) => s.seasonId === seasonId)!;
    expect(row.leaderCount).toBe(2);
  });

  it("carries code beside id so the season link can resolve (R62, D13)", async () => {
    const report = await buildOrganisationReport();
    const row = report.seasons.find((s) => s.seasonId === seasonId)!;
    // v1 linked to /super/seasons/<integer id> while the route resolves by
    // `code`, so every row on that table 404s.
    expect(row.code).toMatch(/^space-v2-test-/);
  });

  it("excludes soft-deleted seasons (R53)", async () => {
    const report = await buildOrganisationReport();
    expect(report.seasons.map((s) => s.seasonId)).not.toContain(deletedSeasonId);
  });

  it("splits students from alumni on graduationYear, from ONE groupBy (R51, R52, R57)", async () => {
    const report = await buildOrganisationReport();
    const testAlumni = report.alumniByYear.filter((a) => a.year === 2098 || a.year === 2097);
    expect(testAlumni).toEqual([
      { year: 2098, count: 2 },
      { year: 2097, count: 1 },
    ]);
    // Descending by year, as v1 sorted (R57).
    const years = report.alumniByYear.map((a) => a.year);
    expect([...years].sort((a, b) => b - a)).toEqual(years);
  });

  it("names the headline count after what it counts (R51, D4)", async () => {
    const report = await buildOrganisationReport();
    // v1 called this "Current students" while counting student ACCOUNTS —
    // including one enrolled in nothing (org-never above). The QUERY is
    // unchanged; only the field name stops restating the wrong claim.
    expect(report.totalStudentsNotGraduated).toBeGreaterThanOrEqual(4);
    expect("totalStudents" in report).toBe(false);
  });

  it("counts active seasons from the already-fetched list (R59)", async () => {
    const report = await buildOrganisationReport();
    expect(report.activeSeasonCount).toBe(
      report.seasons.filter((s) => s.status === "ACTIVE").length,
    );
  });
});
