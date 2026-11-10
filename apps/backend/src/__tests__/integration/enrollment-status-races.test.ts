// Enrolment-status writes against End: the order everywhere is the season, then
// the people, then the rows. Each case holds one side open and queues the other.
import request from "supertest";

import { db } from "../../db/client";
import { lockSeason, lockPeople } from "../../lib/roles";
import { graduatePerson } from "../../lib/students/graduation";
import { behind, holdTransaction, untilBlockedBehind, untilWaiting } from "./lock-holds";
import { reviewedOf } from "./fixtures";
import {
  app,
  as,
  ctx,
  person,
  rowOf,
  season,
  seedEnrollmentFixtures,
  stamp,
  teardownEnrollmentFixtures,
} from "./season-enrollments-setup";

jest.setTimeout(120000);

beforeAll(seedEnrollmentFixtures);
afterAll(teardownEnrollmentFixtures);

const drop = (seasonId: number, userId: number) =>
  request(app)
    .patch(`/api/v1/students/${userId}/enrollments/${seasonId}`)
    .set(as(ctx.superToken))
    .send({ status: "WITHDRAWN", dropReason: "Moved away" });
const end = (seasonId: number, reviewed: { graduatesOnPass: boolean; userIds: number[] }) =>
  request(app).post(`/api/v1/seasons/${seasonId}/end`).set(as(ctx.superToken)).send({ notPassed: [], reviewed });
const yearOf = async (id: number) =>
  (await db.user.findUniqueOrThrow({ where: { id }, select: { graduationYear: true } })).graduationYear;

/** A graduating ACTIVE season with these people enrolled. */
async function graduating(...names: string[]) {
  const seasonId = await season("ACTIVE", "Graduating");
  await db.season.update({ where: { id: seasonId }, data: { graduatesOnPass: true } });
  const people = await Promise.all(names.map((n) => person(n)));
  await db.seasonEnrollment.createMany({
    data: people.map((p) => ({ seasonId, studentUserId: p.id, status: "ACTIVE" as const })),
  });
  return { seasonId, people, reviewed: await reviewedOf(seasonId) };
}

describe("a drop", () => {
  it("queued behind End finds the season finished and leaves the result alone", async () => {
    const { seasonId, people, reviewed } = await graduating("Dropped Late");
    const x = people[0]!;
    const held = await holdTransaction((tx) => lockPeople(tx, [x.id]));
    const ended = Promise.resolve(end(seasonId, reviewed));
    await untilBlockedBehind(held.pid); // End holds the season and waits on the person.
    const dropped = Promise.resolve(drop(seasonId, x.id));
    await untilWaiting(2);
    held.release();
    await held.done;

    expect((await ended).status).toBe(200);
    const res = await dropped;
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("season_finished");
    expect(await rowOf(seasonId, x.id)).toMatchObject({
      status: "COMPLETED",
      result: "PASSED",
      dropReason: null,
      droppedAt: null,
    });
  });

  it("End queued behind a drop refuses its stale review and graduates nobody who left", async () => {
    const { seasonId, people, reviewed } = await graduating("Dropped First", "Stays");
    const x = people[0]!;
    const held = await holdTransaction((tx) => lockPeople(tx, [x.id]));
    const dropped = Promise.resolve(drop(seasonId, x.id)); // Holds the season's share lock, waits on the person.
    await untilBlockedBehind(held.pid);
    const ended = Promise.resolve(end(seasonId, reviewed));
    await untilWaiting(2);
    held.release();
    await held.done;

    expect((await dropped).status).toBe(200);
    const res = await ended;
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("season_unfinished");
    expect(await yearOf(x.id)).toBeNull();
    expect(await rowOf(seasonId, x.id)).toMatchObject({ status: "WITHDRAWN", result: null });
    expect((await db.season.findUniqueOrThrow({ where: { id: seasonId } })).status).toBe("ACTIVE");
  });

  it("that lost the row to another write answers not_active and overwrites nothing", async () => {
    const seasonId = await season("ACTIVE");
    const x = await person("Graduated Meanwhile");
    await db.seasonEnrollment.create({ data: { seasonId, studentUserId: x.id, status: "ACTIVE" } });
    const held = await holdTransaction(async (tx) => {
      await lockPeople(tx, [x.id]);
      await tx.seasonEnrollment.updateMany({
        where: { seasonId, studentUserId: x.id },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
    });
    const res = await behind(held, () => drop(seasonId, x.id));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("not_active");
    expect(await rowOf(seasonId, x.id)).toMatchObject({ status: "COMPLETED", droppedAt: null, dropReason: null });
  });

  it.each(["COMPLETED", "ARCHIVED"] as const)(
    "in a %s season is refused, even on a row a stale read saw ACTIVE",
    async (status) => {
      const seasonId = await season(status);
      const x = await person("Finished");
      await db.seasonEnrollment.create({
        data: { seasonId, studentUserId: x.id, status: "ACTIVE" },
      });
      const res = await drop(seasonId, x.id);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("season_finished");
      expect((await rowOf(seasonId, x.id))?.status).toBe("ACTIVE");
    },
  );

  it("in a draft is refused: Remove is the way off a draft", async () => {
    const seasonId = await season("DRAFT");
    const x = await person("In A Draft");
    await db.seasonEnrollment.create({ data: { seasonId, studentUserId: x.id, status: "ACTIVE" } });
    const res = await drop(seasonId, x.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("season_draft");
    expect(res.body.error.message).toMatch(/Remove/);
    expect(await rowOf(seasonId, x.id)).toMatchObject({ status: "ACTIVE", droppedAt: null });
  });

  it("still drops from a live season and marks the student stale", async () => {
    const seasonId = await season("ACTIVE");
    const x = await person("Plain Drop");
    await db.seasonEnrollment.create({ data: { seasonId, studentUserId: x.id, status: "ACTIVE" } });
    const res = await drop(seasonId, x.id);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: "WITHDRAWN" });
    expect(await rowOf(seasonId, x.id)).toMatchObject({ status: "WITHDRAWN", dropReason: "Moved away" });
    expect(await stamp(x.id)).not.toBeNull();
  });

  it("of nobody on the roster is not_found", async () => {
    const seasonId = await season("ACTIVE");
    const x = await person("Never Here");
    expect((await drop(seasonId, x.id)).status).toBe(404);
  });
});

describe("End graduates only the rows it completed", () => {
  it("skips a row that left between its check and its write", async () => {
    const { seasonId, people, reviewed } = await graduating("Left Mid End", "Passes");
    const [x, y] = [people[0]!, people[1]!];
    // An uncommitted write by someone holding the person: End's check reads X as ACTIVE.
    const held = await holdTransaction(async (tx) => {
      await lockPeople(tx, [x.id]);
      await tx.seasonEnrollment.updateMany({
        where: { seasonId, studentUserId: x.id },
        data: { status: "WITHDRAWN", droppedAt: new Date() },
      });
    });
    const res = await behind(held, () => end(seasonId, reviewed));
    expect(res.status).toBe(200);
    expect(res.body.data.graduated).toBe(1);
    expect(await yearOf(x.id)).toBeNull();
    expect(await yearOf(y.id)).not.toBeNull();
    expect(await rowOf(seasonId, x.id)).toMatchObject({ status: "WITHDRAWN", result: null });
  });

  it("a graduation queued with End doesn't deadlock it, and counts once", async () => {
    const { seasonId, people, reviewed } = await graduating("Graduated By Hand", "Graduated By End");
    const [x, y] = [people[0]!, people[1]!];
    // The person first, the row last: End, queued in between, must not hold the row.
    const held = await holdTransaction(
      (tx) => lockPeople(tx, [x.id]),
      (tx) => graduatePerson(tx, x.id, 2001),
    );
    const res = await behind(held, () => end(seasonId, reviewed));
    expect(res.status).toBe(200);
    expect(res.body.data.graduated).toBe(1);
    expect(await yearOf(x.id)).toBe(2001);
    expect(await yearOf(y.id)).not.toBe(2001);
    expect(await yearOf(y.id)).not.toBeNull();
    expect(await rowOf(seasonId, x.id)).toMatchObject({ status: "COMPLETED", result: null });
  });

  it("two Ends graduate once", async () => {
    const { seasonId, people, reviewed } = await graduating("Only Once");
    const answers = await Promise.all([end(seasonId, reviewed), end(seasonId, reviewed)]);
    expect(answers.map((a) => a.status).sort()).toEqual([200, 409]);
    expect(answers.find((a) => a.status === 200)!.body.data.graduated).toBe(1);
    expect(await yearOf(people[0]!.id)).not.toBeNull();
  });
});

describe("deleting a season", () => {
  const del = (id: number) => request(app).delete(`/api/v1/seasons/${id}`).set(as(ctx.superToken));

  it("waits for a seat going in, then refuses", async () => {
    const seasonId = await season("DRAFT");
    const x = await person("Seat Going In");
    const held = await holdTransaction(async (tx) => {
      await lockSeason(tx, seasonId, "share");
      await tx.seasonEnrollment.create({ data: { seasonId, studentUserId: x.id, status: "ACTIVE" } });
    });
    const res = await behind(held, () => del(seasonId));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("season_in_use");
    expect((await db.season.findUniqueOrThrow({ where: { id: seasonId } })).deletedAt).toBeNull();
  });

  it("marks its staff stale, so their claims go on the next refresh", async () => {
    const seasonId = await season("DRAFT");
    const [admin, leader] = await Promise.all([person("Draft Admin", 2015), person("Draft Leader", 2016)]);
    await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
    await db.group.create({ data: { seasonId, name: "Draft group", leaders: { create: [{ userId: leader.id }] } } });
    const res = await del(seasonId);
    expect(res.status).toBe(200);
    expect(await stamp(admin.id)).not.toBeNull();
    expect(await stamp(leader.id)).not.toBeNull();
  });

  it("of a missing season is not_found", async () => {
    expect((await del(99_999_999)).status).toBe(404);
  });
});
