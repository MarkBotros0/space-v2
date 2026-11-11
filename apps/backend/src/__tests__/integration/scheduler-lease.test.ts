import { db } from "../../db/client";
import { claimLease, releaseLease } from "../../lib/scheduler/lease";

afterAll(async () => {
  await db.$executeRaw`DELETE FROM "SchedulerLease" WHERE "name" IN ('t', 't2', 't3')`;
  await db.$disconnect();
});

describe("scheduler lease", () => {
  it("concurrent claims: one wins", async () => {
    const now = new Date();
    const results = await Promise.all([claimLease("t", now, 300_000), claimLease("t", now, 300_000)]);
    expect(results.filter((held) => held !== null)).toHaveLength(1);
  });

  it("a held lease refuses until it expires or is released", async () => {
    const t0 = new Date("2026-11-12T07:00:00Z");
    expect(await claimLease("t2", t0, 300_000)).toEqual(new Date(t0.getTime() + 300_000));
    expect(await claimLease("t2", new Date(t0.getTime() + 60_000), 300_000)).toBeNull();
    const held = await claimLease("t2", new Date(t0.getTime() + 300_000), 300_000);
    expect(held).not.toBeNull();
    await releaseLease("t2", held!, new Date(t0.getTime() + 301_000));
    expect(await claimLease("t2", new Date(t0.getTime() + 302_000), 300_000)).not.toBeNull();
  });

  it("a run that outlived its lease can't free the one another instance took since (review M7)", async () => {
    const t0 = new Date("2026-11-12T08:00:00Z");
    const slow = await claimLease("t3", t0, 300_000);
    // The slow run's hold runs out; another instance takes the lease.
    const other = await claimLease("t3", new Date(t0.getTime() + 300_000), 300_000);
    expect(other).not.toBeNull();
    // The slow run finishes and releases what it held: the other's lease stays.
    await releaseLease("t3", slow!, new Date(t0.getTime() + 301_000));
    expect(await claimLease("t3", new Date(t0.getTime() + 302_000), 300_000)).toBeNull();
  });
});
