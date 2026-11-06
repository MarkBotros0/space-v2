import { db } from "../../db/client";
import { backfillResults, findRoleRuleViolations } from "../../../scripts/community-preflight";
import { cleanupTestData, createTestSeason, createTestUser } from "./fixtures";

jest.setTimeout(120000);

beforeAll(cleanupTestData);
afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("findRoleRuleViolations", () => {
  it("reports a two-group leader, a two-season admin and a mentor with a SeasonAdmin row", async () => {
    const s1 = await createTestSeason({ status: "ACTIVE" });
    const s2 = await createTestSeason({ status: "ACTIVE" });
    const leader = await createTestUser("pf-leader", "LEADER");
    const admin = await createTestUser("pf-admin", "ADMIN");
    const mentor = await createTestUser("pf-mentor", "MENTOR");
    const g1 = await db.group.create({ data: { seasonId: s1.id, name: "pf-a" } });
    const g2 = await db.group.create({ data: { seasonId: s1.id, name: "pf-b" } });
    await db.groupLeader.createMany({
      data: [g1, g2].map((g) => ({ groupId: g.id, userId: leader.id })),
    });
    await db.seasonAdmin.createMany({
      data: [
        { seasonId: s1.id, userId: admin.id },
        { seasonId: s2.id, userId: admin.id },
        { seasonId: s1.id, userId: mentor.id },
      ],
    });

    const v = await findRoleRuleViolations();
    expect(v.leadersWithManyGroups.map((x) => x.userId)).toContain(leader.id);
    expect(v.adminsInManySeasons.map((x) => x.userId)).toContain(admin.id);
    expect(v.mentorsWithSeasonAdmin.map((x) => x.userId)).toContain(mentor.id);
    expect(v.leadersWithManyGroups.map((x) => x.userId)).not.toContain(admin.id);
  });
});

describe("backfillResults", () => {
  it("marks finished work passed, leaves the rest alone, and is idempotent", async () => {
    const done = await createTestSeason({ status: "COMPLETED" });
    const live = await createTestSeason({ status: "ACTIVE" });
    const a = await createTestUser("pf-bf-a", "STUDENT");
    const b = await createTestUser("pf-bf-b", "STUDENT");
    const c = await createTestUser("pf-bf-c", "STUDENT");
    const d = await createTestUser("pf-bf-d", "STUDENT");
    const mk = (studentUserId: number, seasonId: number, status: "ACTIVE" | "COMPLETED" | "WITHDRAWN") =>
      db.seasonEnrollment.create({ data: { studentUserId, seasonId, status } });
    const completed = await mk(a.id, live.id, "COMPLETED");
    const stale = await mk(b.id, done.id, "ACTIVE");
    const withdrawn = await mk(c.id, done.id, "WITHDRAWN");
    const liveActive = await mk(d.id, live.id, "ACTIVE");

    const opts = { seasonIds: [done.id, live.id] };
    const first = await backfillResults(opts);
    expect(first).toEqual({ markedPassed: 1, completedStale: 1 });

    const row = (id: number) => db.seasonEnrollment.findUniqueOrThrow({ where: { id } });
    expect((await row(completed.id)).result).toBe("PASSED");
    const s = await row(stale.id);
    expect(s.status).toBe("COMPLETED");
    expect(s.result).toBe("PASSED");
    expect(s.completedAt?.toISOString()).toBe(new Date("2099-12-31T00:00:00.000Z").toISOString());
    const w = await row(withdrawn.id);
    expect(w.status).toBe("WITHDRAWN");
    expect(w.result).toBeNull();
    const l = await row(liveActive.id);
    expect(l.status).toBe("ACTIVE");
    expect(l.result).toBeNull();

    expect(await backfillResults(opts)).toEqual({ markedPassed: 0, completedStale: 0 });
  });
});
