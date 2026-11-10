import { db } from "../../db/client";
import { claimLease, releaseLease } from "../../lib/scheduler/lease";

afterAll(async () => {
  await db.$executeRaw`DELETE FROM "SchedulerLease" WHERE "name" IN ('t', 't2')`;
  await db.$disconnect();
});

describe("scheduler lease", () => {
  it("concurrent claims: one wins", async () => {
    const now = new Date();
    const results = await Promise.all([claimLease("t", now, 300_000), claimLease("t", now, 300_000)]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("a held lease refuses until it expires or is released", async () => {
    const t0 = new Date("2026-11-12T07:00:00Z");
    expect(await claimLease("t2", t0, 300_000)).toBe(true);
    expect(await claimLease("t2", new Date(t0.getTime() + 60_000), 300_000)).toBe(false);
    expect(await claimLease("t2", new Date(t0.getTime() + 300_000), 300_000)).toBe(true);
    await releaseLease("t2", new Date(t0.getTime() + 301_000));
    expect(await claimLease("t2", new Date(t0.getTime() + 302_000), 300_000)).toBe(true);
  });
});
