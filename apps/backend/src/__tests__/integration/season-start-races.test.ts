// The season row's lock: a seat write and a Start or End on one season take
// turns, so a seat can't slip past the check Start runs. Each case holds one
// side open in its own transaction and waits until Postgres says the route is
// queued behind it, so the order is forced, not hoped for.
import request from "supertest";

import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import { lockSeason, lockSeasonStart, type SeasonLockMode } from "../../lib/roles";
import { createTestUser, endBodyOf, login, reviewedOf } from "./fixtures";
import { behind, holdTransaction, untilWaiting } from "./lock-holds";
import {
  app,
  as,
  ctx,
  person,
  season,
  seedEnrollmentFixtures,
  teardownEnrollmentFixtures,
} from "./season-enrollments-setup";

jest.setTimeout(120000);

beforeAll(seedEnrollmentFixtures);
afterAll(teardownEnrollmentFixtures);

/** Holds the season's row and whatever `work` does, until `release`. */
const hold = (seasonId: number, mode: SeasonLockMode, work: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
  holdTransaction(async (tx) => {
    await lockSeason(tx, seasonId, mode);
    await work(tx);
  });

/** A season "being started" by another request: locked and ACTIVE, uncommitted. */
const startingNow = (seasonId: number) =>
  hold(seasonId, "update", (tx) => tx.season.update({ where: { id: seasonId }, data: { status: "ACTIVE" } }));

const activeRoleRows = async (userId: number) => {
  const live = { status: "ACTIVE", deletedAt: null } as const;
  return (
    (await db.seasonAdmin.count({ where: { userId, season: live } })) +
    (await db.groupLeader.count({ where: { userId, group: { season: live } } })) +
    (await db.seasonEnrollment.count({ where: { studentUserId: userId, status: "ACTIVE", season: live } }))
  );
};

/** Someone who already holds a role in another ACTIVE season. */
const busyStudent = async (name: string) => {
  const q = await person(name);
  await db.seasonEnrollment.create({
    data: { seasonId: await season("ACTIVE", "Elsewhere"), studentUserId: q.id, status: "ACTIVE" },
  });
  return q;
};
const busyLeader = async (name: string) => {
  const q = await person(name, 2015);
  const elsewhere = await season("ACTIVE", "Elsewhere");
  await db.group.create({ data: { seasonId: elsewhere, name: "Theirs", leaders: { create: [{ userId: q.id }] } } });
  return q;
};
const superCall = () => as(ctx.superToken);

describe("a seat write while the season is being started", () => {
  it("student add reads ACTIVE after waiting, and refuses", async () => {
    const draft = await season("DRAFT");
    const q = await busyStudent("Queued Student");
    const res = await behind(await startingNow(draft), () =>
      request(app)
        .post(`/api/v1/seasons/${draft}/enrollments`)
        .set(superCall())
        .send({ userIds: [q.id] }),
    );
    expect([res.status, res.body.error?.code]).toEqual([409, "people_unavailable"]);
    expect(await activeRoleRows(q.id)).toBe(1);
  });

  it("admin add reads ACTIVE after waiting, and refuses", async () => {
    const draft = await season("DRAFT");
    const q = await busyLeader("Queued Admin");
    const res = await behind(await startingNow(draft), () =>
      request(app).post(`/api/v1/seasons/${draft}/admins`).set(superCall()).send({ userId: q.id }),
    );
    expect([res.status, res.body.error?.code]).toEqual([409, "already_in_role"]);
    expect(await activeRoleRows(q.id)).toBe(1);
  });

  it("a leader change reads ACTIVE after waiting, and refuses", async () => {
    const draft = await season("DRAFT");
    const group = await db.group.create({ data: { seasonId: draft, name: "Here" } });
    const q = await busyLeader("Queued Leader");
    const res = await behind(await startingNow(draft), () =>
      request(app)
        .patch(`/api/v1/groups/${group.id}`)
        .set(superCall())
        .send({ name: "Here", leaderIds: [q.id] }),
    );
    expect([res.status, res.body.error?.code]).toEqual([409, "already_in_role"]);
    expect(await activeRoleRows(q.id)).toBe(1);
  });

  it("a new group's leader reads ACTIVE after waiting, and refuses", async () => {
    const draft = await season("DRAFT");
    const q = await busyLeader("Queued New Leader");
    const res = await behind(await startingNow(draft), () =>
      request(app)
        .post(`/api/v1/seasons/${draft}/groups`)
        .set(superCall())
        .send({ name: "New", leaderIds: [q.id], studentIds: [] }),
    );
    expect([res.status, res.body.error?.code]).toEqual([409, "already_in_role"]);
    expect(await activeRoleRows(q.id)).toBe(1);
  });

  it("an import reads ACTIVE after waiting, and skips the row", async () => {
    const draft = await season("DRAFT");
    const q = await busyStudent("Queued Import");
    const res = await behind(await startingNow(draft), () =>
      request(app)
        .post("/api/v1/imports/students/commit")
        .set(superCall())
        .send({
          mode: "season",
          seasonId: draft,
          onExisting: "enroll",
          rows: [
            {
              rowNumber: 2,
              values: {
                name: q.email,
                email: q.email,
                university: null,
                faculty: null,
                universityGraduationYear: null,
                phone: null,
                dateOfBirth: null,
                notes: null,
              },
            },
          ],
        }),
    );
    expect(res.status).toBe(200);
    expect(await activeRoleRows(q.id)).toBe(1);
  });

  it.each([
    [
      "a draft remove",
      (seasonId: number, userId: number) =>
        request(app).delete(`/api/v1/seasons/${seasonId}/enrollments/${userId}`).set(superCall()),
    ],
    [
      "an override",
      (seasonId: number, userId: number) =>
        request(app).post(`/api/v1/seasons/${seasonId}/enrollments/${userId}/override`).set(superCall()).send({}),
    ],
  ])("%s reads ACTIVE after waiting, and is not_draft", async (_name, send) => {
    const draft = await season("DRAFT");
    const q = await person("Queued Row");
    await db.seasonEnrollment.create({ data: { seasonId: draft, studentUserId: q.id, status: "ACTIVE" } });
    const res = await behind(await startingNow(draft), () => send(draft, q.id));
    expect([res.status, res.body.error?.code]).toEqual([409, "not_draft"]);
  });

  it("a stale full PATCH can't put a started season back to DRAFT", async () => {
    const draft = await season("DRAFT");
    const { code } = await db.season.findUniqueOrThrow({ where: { id: draft }, select: { code: true } });
    const res = await behind(await startingNow(draft), () =>
      request(app).patch(`/api/v1/seasons/${draft}`).set(superCall()).send({
        code,
        program: "TEST",
        year: 2099,
        status: "DRAFT",
        startDate: "2099-01-01T00:00:00.000Z",
        endDate: "2099-12-31T00:00:00.000Z",
      }),
    );
    expect([res.status, res.body.error?.code]).toEqual([409, "season_changed"]);
    expect((await db.season.findUniqueOrThrow({ where: { id: draft } })).status).toBe("ACTIVE");
  });
});

describe("a Start or End while a seat write is open", () => {
  it("Start waits for the write, then sees the new row and refuses", async () => {
    const draft = await season("DRAFT");
    const q = await busyStudent("Slipping In");
    const held = await hold(draft, "share", (tx) =>
      tx.seasonEnrollment.create({ data: { seasonId: draft, studentUserId: q.id, status: "ACTIVE" } }),
    );
    const res = await behind(held, () => request(app).post(`/api/v1/seasons/${draft}/start`).set(superCall()).send({}));
    expect([res.status, res.body.error?.code]).toEqual([409, "start_blocked"]);
    expect((await db.season.findUniqueOrThrow({ where: { id: draft } })).status).toBe("DRAFT");
    expect(await activeRoleRows(q.id)).toBe(1);
  });

  it("End waits for the write, then refuses: the new student was never reviewed", async () => {
    const live = await season("ACTIVE");
    const q = await person("Late Student");
    const body = await endBodyOf(live, [], await reviewedOf(live));
    const held = await hold(live, "share", (tx) =>
      tx.seasonEnrollment.create({ data: { seasonId: live, studentUserId: q.id, status: "ACTIVE" } }),
    );
    const res = await behind(held, () => request(app).post(`/api/v1/seasons/${live}/end`).set(superCall()).send(body));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("season_unfinished");
    const row = await db.seasonEnrollment.findFirstOrThrow({ where: { seasonId: live, studentUserId: q.id } });
    expect(row).toMatchObject({ status: "ACTIVE", result: null });
  });

  it("a seat write behind an End reads the season finished, and refuses", async () => {
    const live = await season("ACTIVE");
    const q = await person("After The End");
    const held = await hold(live, "update", (tx) =>
      tx.season.update({ where: { id: live }, data: { status: "COMPLETED" } }),
    );
    const res = await behind(held, () =>
      request(app)
        .post(`/api/v1/seasons/${live}/enrollments`)
        .set(superCall())
        .send({ userIds: [q.id] }),
    );
    expect([res.status, res.body.error?.code]).toEqual([409, "season_finished"]);
    expect(await activeRoleRows(q.id)).toBe(0);
  });
});

describe("Start and a group delete", () => {
  it("a group delete waits behind a Start, then finishes", async () => {
    const draft = await season("DRAFT");
    const lead = await person("Deleted Group Leader", 2015);
    const group = await db.group.create({
      data: { seasonId: draft, name: "Going", leaders: { create: [{ userId: lead.id }] } },
    });
    const sup = await createTestUser("races-super", "SUPER");
    const token = await login(app, sup.email);
    const res = await behind(await startingNow(draft), () =>
      request(app).delete(`/api/v1/groups/${group.id}`).set(as(token)),
    );
    expect(res.status).toBe(200);
    expect(await db.group.findUnique({ where: { id: group.id } })).toBeNull();
  });
});

describe("a Start or End and the season's other inserts", () => {
  // A foreign key check takes FOR KEY SHARE on the season while the inserter may
  // already hold a person's row, so waiting here is half of a deadlock with End.
  it("a row pointing at the season goes in while the season is held for update", async () => {
    const live = await season("ACTIVE");
    const held = await hold(live, "update", async () => undefined);
    try {
      const insert = db.session.create({
        data: { seasonId: live, title: "Inserted", startsAt: new Date("2099-06-01T10:00:00.000Z") },
        select: { id: true },
      });
      const waited = new Promise<"waited">((resolve) => setTimeout(() => resolve("waited"), 8_000));
      expect(await Promise.race([insert.then(() => "inserted" as const), waited])).toBe("inserted");
    } finally {
      held.release();
      await held.done;
    }
  });
});

describe("two Starts at once", () => {
  it("a community-wide and a regular Start: exactly one runs, the other is start_blocked", async () => {
    const wideDraft = await season("DRAFT", "Everyone");
    await db.season.update({ where: { id: wideDraft }, data: { isCommunityWide: true } });
    const regular = await season("DRAFT", "Regular");
    const held = await holdTransaction((tx) => lockSeasonStart(tx));
    const starts = [wideDraft, regular].map((id) =>
      Promise.resolve(request(app).post(`/api/v1/seasons/${id}/start`).set(superCall()).send({})),
    );
    try {
      await untilWaiting(2);
    } finally {
      held.release();
      await held.done;
    }
    const answers = await Promise.all(starts);
    expect(answers.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(answers.find((r) => r.status === 409)!.body.error.code).toBe("start_blocked");
  });
});
