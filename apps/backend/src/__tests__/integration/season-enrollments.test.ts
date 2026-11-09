// Community model, Build 2, Task 5: adding people to a season, and overriding a
// block on a draft's row. Removing is season-enrollments-remove.test.ts, the other
// ways in season-enrollments-entry.test.ts. The check on Start is Task 6's.
import request from "supertest";

import { db } from "../../db/client";
import { readSeatSeason, seatStudents } from "../../lib/roles";
import { createTestUser, testEmail } from "./fixtures";
import {
  add,
  adminTokenOf,
  app,
  as,
  ctx,
  finishedGbv,
  leading,
  override,
  person,
  rowOf,
  rowsIn,
  season,
  seedEnrollmentFixtures,
  stamp,
  teardownEnrollmentFixtures,
} from "./season-enrollments-setup";

jest.setTimeout(180000);

beforeAll(seedEnrollmentFixtures);
afterAll(teardownEnrollmentFixtures);

const readySeason = (title: string) => season("ACTIVE", title, "GBV", "LEAD");

describe("POST /seasons/:id/enrollments", () => {
  it("adds everyone as ACTIVE and marks their sessions stale", async () => {
    const target = await season("DRAFT");
    const a = await person("Amy");
    const b = await person("Ben");
    const before = await stamp(a.id);

    const res = await add(target, { userIds: [a.id, b.id] });

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ added: 2 });
    expect(await rowOf(target, a.id)).toMatchObject({ status: "ACTIVE", overrideById: null, overrideAt: null });
    expect(await rowOf(target, b.id)).toMatchObject({ status: "ACTIVE" });
    expect((await stamp(a.id))?.getTime()).not.toBe(before?.getTime());
    expect(await stamp(a.id)).not.toBeNull();
  });

  it("refuses the whole batch, naming the first and counting the rest", async () => {
    const target = await season("ACTIVE");
    const free = await person("Free");
    const mina = await person("Mina");
    await leading(mina.id);
    const alum = await person("Alum", 2020);
    const other = await person("Other");
    await db.seasonEnrollment.create({ data: { seasonId: target, studentUserId: other.id } });
    const freeStamp = await stamp(free.id);

    const res = await add(target, { userIds: [free.id, mina.id, alum.id, other.id] });

    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({
      code: "people_unavailable",
      message: "Mina is already leading a group in GBV 2026, and 2 others can't join.",
    });
    expect(await rowOf(target, free.id)).toBeNull();
    expect((await stamp(free.id))?.getTime()).toBe(freeStamp?.getTime());
  });

  it("says it plainly when one person is refused, and in the singular with one more", async () => {
    const target = await season("ACTIVE");
    const mina = await person("Mina");
    await leading(mina.id);
    const alum = await person("Alum", 2020);

    const alone = await add(target, { userIds: [mina.id] });
    expect(alone.body.error).toEqual({
      code: "people_unavailable",
      message: "Mina is already leading a group in GBV 2026",
    });
    const two = await add(target, { userIds: [alum.id, mina.id] });
    expect(two.body.error.message).toBe("Alum is an alumnus and can't join as a student, and 1 other can't join.");
  });

  it("allows someone who already passed this program", async () => {
    const target = await season("DRAFT", "GBV 2027", null, "GBV");
    const peter = await person("Peter");
    await finishedGbv(peter.id, "PASSED");
    expect((await add(target, { userIds: [peter.id] })).status).toBe(201);
  });

  it("refuses a blocked person, then lets a super in with an override it records", async () => {
    const target = await season("DRAFT", "LEAD 2027", "GBV", "LEAD");
    const sara = await person("Sara");
    await finishedGbv(sara.id, "NOT_PASSED");
    const cat = await person("Cat");

    const refused = await add(target, { userIds: [sara.id] });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toEqual({ code: "people_unavailable", message: "Sara did not pass GBV 2026" });
    const never = await add(target, { userIds: [cat.id] });
    expect(never.body.error.message).toBe("Cat hasn't finished GBV yet");
    expect(await rowsIn(target)).toBe(0);

    const allowed = await add(target, { userIds: [sara.id], overrideUserIds: [sara.id] });
    expect(allowed.status).toBe(201);
    const row = await rowOf(target, sara.id);
    expect(row?.overrideById).toBe(ctx.superId);
    expect(row?.overrideAt).toBeInstanceOf(Date);
  });

  it("records no override on someone who wasn't blocked", async () => {
    const target = await season("DRAFT", "LEAD 2027", "GBV", "LEAD");
    const peter = await person("Peter");
    await finishedGbv(peter.id, "PASSED");
    const res = await add(target, { userIds: [peter.id], overrideUserIds: [peter.id] });
    expect(res.status).toBe(201);
    expect(await rowOf(target, peter.id)).toMatchObject({ overrideById: null, overrideAt: null });
  });

  it("lets a season's own admin add, with an override too; another season's admin gets nothing", async () => {
    const target = await season("DRAFT", "LEAD 2027", "GBV", "LEAD");
    const adminToken = await adminTokenOf(target);
    const peter = await person("Peter");
    await finishedGbv(peter.id, "PASSED");
    const sara = await person("Sara");
    await finishedGbv(sara.id, "NOT_PASSED");

    const blocked = await add(target, { userIds: [sara.id] }, adminToken);
    expect(blocked.status).toBe(409);
    expect(await rowOf(target, sara.id)).toBeNull();
    // Owner, 2026-11-07: the season's admin may override a block, as a super may.
    expect((await add(target, { userIds: [sara.id], overrideUserIds: [sara.id] }, adminToken)).status).toBe(201);
    expect((await rowOf(target, sara.id))?.overrideById).not.toBeNull();

    const strangerToken = await adminTokenOf(await season("DRAFT"));
    expect((await add(target, { userIds: [peter.id] }, strangerToken)).status).toBe(403);

    expect((await add(target, { userIds: [peter.id] }, adminToken)).status).toBe(201);
  });

  it("adds someone in a role elsewhere to a draft, but not to an active season", async () => {
    const mina = await person("Mina");
    await leading(mina.id);
    const draft = await season("DRAFT");
    const active = await season("ACTIVE");
    expect((await add(draft, { userIds: [mina.id] })).status).toBe(201);
    expect((await add(active, { userIds: [mina.id] })).status).toBe(409);
    expect(await rowOf(active, mina.id)).toBeNull();
  });

  it("refuses someone with a row here, and a dropped person stays dropped", async () => {
    const target = await season("DRAFT");
    const here = await person("Here");
    const gone = await person("Gone");
    await db.seasonEnrollment.create({ data: { seasonId: target, studentUserId: here.id } });
    await db.seasonEnrollment.create({ data: { seasonId: target, studentUserId: gone.id, status: "WITHDRAWN" } });

    const first = await add(target, { userIds: [here.id] });
    expect(first.status).toBe(409);
    expect(first.body.error).toEqual({ code: "people_unavailable", message: "Here is already in this season" });
    const second = await add(target, { userIds: [gone.id] });
    expect(second.body.error.message).toBe(
      "Gone was dropped from this season - only a super admin can bring them back",
    );
    expect(await rowOf(target, gone.id)).toMatchObject({ status: "WITHDRAWN" });
  });

  it("still refuses an in-role person on an active season when the block is overridden", async () => {
    const target = await season("ACTIVE", "LEAD 2027", "GBV", "LEAD");
    const mina = await person("Mina");
    await leading(mina.id);
    const refused = await add(target, { userIds: [mina.id] });
    expect(refused.body.error.message).toBe(
      "Mina hasn't finished GBV yet. Mina is already leading a group in GBV 2026",
    );
    const overridden = await add(target, { userIds: [mina.id], overrideUserIds: [mina.id] });
    expect(overridden.status).toBe(409);
    expect(overridden.body.error.message).toBe("Mina is already leading a group in GBV 2026");
  });

  it("agrees with the picker on who can be added", async () => {
    for (const status of ["DRAFT", "ACTIVE"] as const) {
      const target = await season(status, "LEAD 2027", "GBV", "LEAD");
      const passed = await person("Passed");
      await finishedGbv(passed.id, "PASSED");
      const passedLead = await person("Passed Lead");
      await finishedGbv(passedLead.id, "PASSED");
      await finishedGbv(passedLead.id, "PASSED", "LEAD");
      const failed = await person("Failed");
      await finishedGbv(failed.id, "NOT_PASSED");
      const never = await person("Never");
      const serving = await person("Serving");
      await finishedGbv(serving.id, "PASSED");
      await leading(serving.id);
      const here = await person("Here");
      await finishedGbv(here.id, "PASSED");
      await db.seasonEnrollment.create({ data: { seasonId: target, studentUserId: here.id } });

      const list = await request(app).get(`/api/v1/seasons/${target}/people-candidates`).set(as(ctx.superToken));
      const ids = [passed, passedLead, failed, never, serving, here].map((p) => p.id);
      const rows = (list.body.data.people as { id: number; selectable: boolean }[]).filter((p) => ids.includes(p.id));
      expect(rows).toHaveLength(ids.length);
      for (const row of rows) {
        const res = await add(target, { userIds: [row.id] });
        expect({ id: row.id, added: res.status === 201 }).toEqual({ id: row.id, added: row.selectable });
      }
    }
  });

  it("refuses a super, a mentor, a stored staff role without a year, and a deactivated account", async () => {
    const target = await season("DRAFT");
    const mentor = await createTestUser("se-mentor", "MENTOR");
    await db.user.update({ where: { id: mentor.id }, data: { name: "Mentor" } });
    const legacy = await createTestUser("se-legacy", "LEADER");
    await db.user.update({ where: { id: legacy.id }, data: { name: "Legacy" } });
    const gone = await person("Gone");
    await db.user.update({ where: { id: gone.id }, data: { deletedAt: new Date() } });

    const message = async (id: number) => (await add(target, { userIds: [id] })).body.error.message as string;
    expect(await message(mentor.id)).toBe("Mentor is a mentor and can't take a season role.");
    expect(await message(legacy.id)).toBe("Legacy can't join as a student.");
    expect(await message(gone.id)).toBe("That account is deactivated.");
    expect(await rowsIn(target)).toBe(0);
  });

  it("answers 400, 404 and season_finished", async () => {
    const target = await season("DRAFT");
    const a = await person("Amy");
    for (const body of [
      {},
      { userIds: [] },
      { userIds: [a.id, a.id] },
      { userIds: Array.from({ length: 501 }, (_, i) => i + 1) },
      { userIds: [a.id], overrideUserIds: [a.id + 1] },
    ]) {
      expect((await add(target, body)).status).toBe(400);
    }
    expect((await add(target, { userIds: [2147483000] })).status).toBe(404);
    expect((await add(2147483000, { userIds: [a.id] })).status).toBe(404);
    const done = await add(await season("COMPLETED"), { userIds: [a.id] });
    expect(done.status).toBe(409);
    expect(done.body.error.code).toBe("season_finished");
  });
});

describe("POST /seasons/:id/enrollments/:userId/override", () => {
  it("records both columns on a draft's row, for a super or the season's admin only", async () => {
    const target = await season("DRAFT", "LEAD 2027", "GBV", "LEAD");
    const sara = await person("Sara");
    await db.seasonEnrollment.create({ data: { seasonId: target, studentUserId: sara.id } });

    const strangerToken = await adminTokenOf(await season("DRAFT"));
    expect((await override(target, sara.id, strangerToken)).status).toBe(403);
    expect(await rowOf(target, sara.id)).toMatchObject({ overrideById: null, overrideAt: null });

    const res = await override(target, sara.id);
    expect(res.status).toBe(200);
    const row = await rowOf(target, sara.id);
    expect(row?.overrideById).toBe(ctx.superId);
    expect(row?.overrideAt).toBeInstanceOf(Date);
  });

  it("404s with no row, or for a dropped row, and 409s not_draft outside a draft", async () => {
    const target = await season("DRAFT");
    const sara = await person("Sara");
    expect((await override(target, sara.id)).status).toBe(404);
    await db.seasonEnrollment.create({ data: { seasonId: target, studentUserId: sara.id, status: "WITHDRAWN" } });
    expect((await override(target, sara.id)).status).toBe(404);
    expect((await override(2147483000, sara.id)).status).toBe(404);

    const active = await season("ACTIVE");
    await db.seasonEnrollment.create({ data: { seasonId: active, studentUserId: sara.id } });
    const res = await override(active, sara.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("not_draft");
    expect(await rowOf(active, sara.id)).toMatchObject({ overrideById: null, overrideAt: null });
  });
});

describe("seatStudents overrides", () => {
  it("lifts a block only for an override by a super, and never lifts a role", async () => {
    const target = await readySeason("LEAD 2027");
    const sara = await person("Sara");
    await finishedGbv(sara.id, "NOT_PASSED");
    // Each check runs in a transaction rolled back after the decision, so a
    // successful seat doesn't turn the next check into "already in this season".
    const rollback = new Error("rollback");
    const check = async (overridden: boolean, actorMayOverride: boolean) => {
      let refusal: unknown;
      await db
        .$transaction(async (tx) => {
          const seatSeason = (await readSeatSeason(tx, target))!;
          const { refused } = await seatStudents(tx, seatSeason, [sara.id], {
            override: { userIds: overridden ? [sara.id] : [], actorId: sara.id, actorMayOverride },
          });
          refusal = refused[0]?.refusal ?? null;
          throw rollback;
        })
        .catch((e: unknown) => {
          if (e !== rollback) throw e;
        });
      return refusal;
    };
    const notEligible = { code: "not_eligible", message: "Sara did not pass GBV 2026" };
    expect(await check(false, true)).toEqual(notEligible);
    expect(await check(true, false)).toEqual(notEligible);
    expect(await check(true, true)).toBeNull();

    await leading(sara.id);
    expect(await check(true, true)).toEqual({
      code: "already_in_role",
      message: "Sara is already leading a group in GBV 2026",
    });
  });
});

describe("seatStudents at scale", () => {
  it("seats 200 people with one insert and one stale stamp, inside the default transaction limit", async () => {
    const target = await season("DRAFT");
    const people = await db.user.createManyAndReturn({
      data: Array.from({ length: 200 }, (_, i) => ({
        email: testEmail(`se-many-${i}`),
        name: `Many ${i}`,
        role: "STUDENT" as const,
      })),
      select: { id: true },
    });
    const ids = people.map((p) => p.id);

    // No `timeout` here on purpose: Prisma's default 5s is the bound being pinned.
    const { seated, insertCalls, createCalls, staleCalls } = await db.$transaction(async (tx) => {
      const insert = jest.spyOn(tx.seasonEnrollment, "createMany");
      const create = jest.spyOn(tx.seasonEnrollment, "create");
      const stale = jest.spyOn(tx.user, "updateMany");
      const seatSeason = (await readSeatSeason(tx, target))!;
      const result = await seatStudents(tx, seatSeason, ids);
      return {
        seated: result.seated,
        insertCalls: insert.mock.calls.length,
        createCalls: create.mock.calls.length,
        staleCalls: stale.mock.calls.length,
      };
    });

    expect(seated).toHaveLength(200);
    expect(insertCalls).toBe(1);
    expect(createCalls).toBe(0);
    expect(staleCalls).toBe(1);
    expect(await rowsIn(target)).toBe(200);
    // Season and users carry the test prefix, so cleanupTestData takes these rows too.
  });
});
