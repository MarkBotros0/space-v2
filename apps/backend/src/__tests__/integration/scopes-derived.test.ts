// Task 2 (community model): the current season and staff grants are derived
// from live rows (StudentProfile.activeSeasonId, which v1 read, is dropped: DB-001).
import { loadScopes } from "../../lib/auth/scopes";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser } from "./fixtures";

jest.setTimeout(60000);

beforeAll(async () => {
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

const enrol = (studentUserId: number, seasonId: number, extra: Record<string, unknown> = {}) =>
  db.seasonEnrollment.create({ data: { studentUserId, seasonId, status: "ACTIVE", ...extra } });

describe("loadScopes derives from live data", () => {
  it("derives the current season from live enrolments", async () => {
    const active = await createTestSeason({ status: "ACTIVE" });
    const draft = await createTestSeason({ status: "DRAFT" });
    const a = await createTestUser("sd-a", "STUDENT");
    const b = await createTestUser("sd-b", "STUDENT");
    const c = await createTestUser("sd-c", "STUDENT");
    const d = await createTestUser("sd-d", "STUDENT");
    await db.studentProfile.create({ data: { userId: b.id } });
    await enrol(a.id, active.id);
    await enrol(b.id, draft.id);
    await enrol(c.id, active.id, { status: "COMPLETED" });
    await enrol(d.id, active.id, { status: "WITHDRAWN" });

    expect((await loadScopes(a.id)).activeSeasonId).toBe(active.id);
    expect((await loadScopes(b.id)).activeSeasonId).toBeNull();
    expect((await loadScopes(c.id)).activeSeasonId).toBeNull();
    expect((await loadScopes(d.id)).activeSeasonId).toBeNull();
  });

  it("picks the most recent enrolment and ignores deleted seasons", async () => {
    const older = await createTestSeason({ status: "ACTIVE" });
    const newer = await createTestSeason({ status: "ACTIVE" });
    const gone = await createTestSeason({ status: "ACTIVE" });
    await db.season.update({ where: { id: gone.id }, data: { deletedAt: new Date() } });
    const s = await createTestUser("sd-recent", "STUDENT");
    await enrol(s.id, older.id, { enrolledAt: new Date("2099-01-01") });
    await enrol(s.id, newer.id, { enrolledAt: new Date("2099-02-01") });
    await enrol(s.id, gone.id, { enrolledAt: new Date("2099-03-01") });
    expect((await loadScopes(s.id)).activeSeasonId).toBe(newer.id);
  });

  it("drops finished seasons from staff grants, keeps a draft with no active role", async () => {
    const active = await createTestSeason({ status: "ACTIVE" });
    const draft = await createTestSeason({ status: "DRAFT" });
    const done = await createTestSeason({ status: "COMPLETED" });
    const archived = await createTestSeason({ status: "ARCHIVED" });
    const admin = await createTestUser("sd-admin", "ADMIN");
    const leader = await createTestUser("sd-leader", "LEADER");
    for (const s of [active, draft, done, archived]) {
      await db.seasonAdmin.create({ data: { seasonId: s.id, userId: admin.id } });
    }
    const activeGroup = await db.group.create({ data: { seasonId: active.id, name: "A" } });
    const doneGroup = await db.group.create({ data: { seasonId: done.id, name: "D" } });
    await db.groupLeader.create({ data: { groupId: activeGroup.id, userId: leader.id } });
    await db.groupLeader.create({ data: { groupId: doneGroup.id, userId: leader.id } });

    // An ACTIVE role hides draft grants (derived-role.test.ts); the draft shows once it's gone.
    expect((await loadScopes(admin.id)).seasonAdminIds).toEqual([active.id]);
    await db.seasonAdmin.delete({ where: { seasonId_userId: { seasonId: active.id, userId: admin.id } } });
    expect((await loadScopes(admin.id)).seasonAdminIds).toEqual([draft.id]);
    expect((await loadScopes(leader.id)).groupLeaderIds).toEqual([activeGroup.id]);
  });
});
