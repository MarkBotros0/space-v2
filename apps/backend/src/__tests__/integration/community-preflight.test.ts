import { db } from "../../db/client";
import {
  applyRefusal,
  backfillResults,
  countViolations,
  findRoleRuleViolations,
} from "../../../scripts/community-preflight";
import { cleanupTestData, createTestSeason, createTestUser } from "./fixtures";

jest.setTimeout(120000);

beforeAll(cleanupTestData);
afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

const active = () => createTestSeason({ status: "ACTIVE" });
const lead = async (seasonId: number, userId: number, name: string) =>
  db.group.create({ data: { seasonId, name, leaders: { create: { userId } } } });
const administer = (seasonId: number, userId: number) => db.seasonAdmin.create({ data: { seasonId, userId } });
const enrol = (seasonId: number, studentUserId: number, status: "ACTIVE" | "COMPLETED" | "WITHDRAWN" = "ACTIVE") =>
  db.seasonEnrollment.create({ data: { seasonId, studentUserId, status } });
const users = (rows: { userId: number }[]) => rows.map((r) => r.userId);

describe("findRoleRuleViolations", () => {
  it("reports a two-group leader, a two-season admin and a mentor with a SeasonAdmin row", async () => {
    const s1 = await active();
    const s2 = await active();
    const leader = await createTestUser("pf-leader", "LEADER");
    const admin = await createTestUser("pf-admin", "ADMIN");
    const mentor = await createTestUser("pf-mentor", "MENTOR");
    await lead(s1.id, leader.id, "pf-a");
    await lead(s1.id, leader.id, "pf-b");
    await administer(s1.id, admin.id);
    await administer(s2.id, admin.id);
    await administer(s1.id, mentor.id);

    const v = await findRoleRuleViolations();
    expect(users(v.leadersWithManyGroups)).toContain(leader.id);
    expect(users(v.adminsInManySeasons)).toContain(admin.id);
    expect(users(v.mentorsWithSeasonAdmin)).toContain(mentor.id);
    expect(users(v.leadersWithManyGroups)).not.toContain(admin.id);
  });

  it("reports a student in two ACTIVE seasons, and a leader in two", async () => {
    const [s1, s2] = [await active(), await active()];
    const student = await createTestUser("pf-two-seasons", "STUDENT");
    const leader = await createTestUser("pf-two-season-leader", "LEADER");
    await enrol(s1.id, student.id);
    await enrol(s2.id, student.id);
    await lead(s1.id, leader.id, "pf-l1");
    await lead(s2.id, leader.id, "pf-l2");
    const v = await findRoleRuleViolations();
    expect(users(v.studentsInManySeasons)).toContain(student.id);
    expect(users(v.leadersInManySeasons)).toContain(leader.id);
    expect(users(v.leadersWithManyGroups)).not.toContain(leader.id);
  });

  it("reports admin in one season and leader in another, but allows both in the same season", async () => {
    const [s1, s2] = [await active(), await active()];
    const split = await createTestUser("pf-split", "ADMIN");
    const same = await createTestUser("pf-same", "ADMIN");
    await administer(s1.id, split.id);
    await lead(s2.id, split.id, "pf-split-g");
    await administer(s1.id, same.id);
    await lead(s1.id, same.id, "pf-same-g");
    const v = await findRoleRuleViolations();
    expect(users(v.adminAndLeaderAcrossSeasons)).toContain(split.id);
    expect(users(v.adminAndLeaderAcrossSeasons)).not.toContain(same.id);
    // Nothing else may catch the allowed pair either.
    expect(JSON.stringify(v)).not.toContain(`"userId":${same.id},`);
  });

  it("reports Supers with season rows and Mentors with GroupLeader rows", async () => {
    const s = await active();
    const superAdmin = await createTestUser("pf-super-admin", "SUPER");
    const superLeader = await createTestUser("pf-super-leader", "SUPER");
    const mentor = await createTestUser("pf-mentor-leader", "MENTOR");
    await administer(s.id, superAdmin.id);
    await lead(s.id, superLeader.id, "pf-sl");
    await lead(s.id, mentor.id, "pf-ml");
    const v = await findRoleRuleViolations();
    expect(users(v.supersWithSeasonRoles)).toEqual(expect.arrayContaining([superAdmin.id, superLeader.id]));
    expect(users(v.mentorsWithGroupLeader)).toContain(mentor.id);
  });

  it("reports staff who also hold an ACTIVE enrolment in an ACTIVE season", async () => {
    const [s1, s2] = [await active(), await active()];
    const byRole = await createTestUser("pf-mentor-student", "MENTOR");
    const serving = await createTestUser("pf-serving-student", "LEADER");
    const adminRow = await createTestUser("pf-admin-student", "STUDENT");
    await enrol(s1.id, byRole.id);
    await lead(s1.id, serving.id, "pf-ss");
    await enrol(s2.id, serving.id);
    await administer(s1.id, adminRow.id);
    await enrol(s2.id, adminRow.id);
    const v = await findRoleRuleViolations();
    expect(users(v.staffWithActiveEnrollment)).toEqual(
      expect.arrayContaining([byRole.id, serving.id, adminRow.id]),
    );
  });

  it("ignores DRAFT, finished and soft-deleted seasons, deleted users and a plain student", async () => {
    const liveS = await active();
    const draft = await createTestSeason({ status: "DRAFT" });
    const done = await createTestSeason({ status: "COMPLETED" });
    const gone = await active();
    await db.season.update({ where: { id: gone.id }, data: { deletedAt: new Date() } });

    const student = await createTestUser("pf-fine-student", "STUDENT");
    await enrol(liveS.id, student.id);
    for (const s of [draft, done, gone]) await enrol(s.id, student.id);

    const leader = await createTestUser("pf-fine-leader", "LEADER");
    await lead(liveS.id, leader.id, "pf-fine-1");
    for (const s of [draft, done, gone]) await lead(s.id, leader.id, `pf-fine-${s.id}`);
    await lead(draft.id, leader.id, "pf-fine-draft-2");

    const deleted = await createTestUser("pf-deleted-student", "STUDENT");
    await enrol(liveS.id, deleted.id);
    const other = await active();
    await enrol(other.id, deleted.id);
    await db.user.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });

    const text = JSON.stringify(await findRoleRuleViolations());
    for (const id of [student.id, leader.id, deleted.id]) {
      expect(text).not.toContain(`"userId":${id},`);
    }
  });
});

describe("backfillResults", () => {
  it("marks finished work passed, leaves the rest alone, and is idempotent", async () => {
    const done = await createTestSeason({ status: "COMPLETED" });
    const archived = await createTestSeason({ status: "ARCHIVED" });
    const live = await active();
    const [a, b, c, d, e, f, g] = await Promise.all(
      ["a", "b", "c", "d", "e", "f", "g"].map((x) => createTestUser(`pf-bf-${x}`, "STUDENT")),
    );
    const completed = await enrol(done.id, a!.id, "COMPLETED");
    const stale = await enrol(done.id, b!.id);
    const withdrawn = await enrol(done.id, c!.id, "WITHDRAWN");
    const liveActive = await enrol(live.id, d!.id);
    // Graduated part-way through a season still running: no result yet.
    const liveCompleted = await enrol(live.id, e!.id, "COMPLETED");
    const archivedStale = await enrol(archived.id, f!.id);
    const archivedCompleted = await enrol(archived.id, g!.id, "COMPLETED");

    const opts = { seasonIds: [done.id, archived.id, live.id] };
    expect(await backfillResults({ ...opts, dryRun: true })).toEqual({ markedPassed: 2, completedStale: 2 });
    const first = await backfillResults(opts);
    expect(first).toEqual({ markedPassed: 2, completedStale: 2 });

    const row = (id: number) => db.seasonEnrollment.findUniqueOrThrow({ where: { id } });
    expect((await row(completed.id)).result).toBe("PASSED");
    expect((await row(archivedCompleted.id)).result).toBe("PASSED");
    for (const id of [stale.id, archivedStale.id]) {
      const s = await row(id);
      expect(s.status).toBe("COMPLETED");
      expect(s.result).toBe("PASSED");
      expect(s.completedAt?.toISOString()).toBe(new Date("2099-12-31T00:00:00.000Z").toISOString());
    }
    expect(await row(withdrawn.id)).toMatchObject({ status: "WITHDRAWN", result: null });
    expect(await row(liveActive.id)).toMatchObject({ status: "ACTIVE", result: null });
    expect(await row(liveCompleted.id)).toMatchObject({ status: "COMPLETED", result: null });

    expect(await backfillResults(opts)).toEqual({ markedPassed: 0, completedStale: 0 });
  });
});

// These never run the backfill: applyRefusal only reads, and a real --apply is
// not a thing a test may do.
describe("applyRefusal", () => {
  const clean = async () => {
    const v = await findRoleRuleViolations();
    return Object.fromEntries(Object.keys(v).map((k) => [k, []])) as unknown as typeof v;
  };

  it("refuses while any role-rule violation exists", async () => {
    const v = await clean();
    v.studentsInManySeasons = [{ userId: 1, seasons: 2 }];
    expect(countViolations(v)).toBe(1);
    expect(await applyRefusal(v)).toMatch(/violations/);
  });

  it("refuses once any enrolment has a result: a second run would invent PASSED", async () => {
    const season = await createTestSeason({ status: "COMPLETED" });
    const student = await createTestUser("pf-has-result", "STUDENT");
    await db.seasonEnrollment.create({
      data: { seasonId: season.id, studentUserId: student.id, status: "COMPLETED", result: "NOT_PASSED" },
    });
    expect(await applyRefusal(await clean())).toMatch(/already has a result/);
  });
});
