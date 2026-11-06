// The season row's lock: a seat write and a Start or End on one season take
// turns, so a seat can't slip past the check Start runs. Each case holds one
// side open in its own transaction and waits until Postgres says the route is
// queued behind it, so the order is forced, not hoped for.
import request from "supertest";

import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import { createTestUser, login } from "./fixtures";
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

const HOLD_MS = 25_000;

type Mode = "FOR UPDATE" | "FOR SHARE";

/**
 * Opens a transaction holding the season's row and whatever `work` does, and
 * keeps it open until `release`. The transaction's own timeout bounds a failure.
 */
async function hold(seasonId: number, mode: Mode, work: (tx: Prisma.TransactionClient) => Promise<unknown>) {
  let release = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  let ready = (_pid: number) => {};
  const held = new Promise<number>((resolve) => (ready = resolve));
  const done = db.$transaction(
    async (tx) => {
      if (mode === "FOR UPDATE") await tx.$queryRaw`SELECT id FROM "Season" WHERE id = ${seasonId} FOR UPDATE`;
      else await tx.$queryRaw`SELECT id FROM "Season" WHERE id = ${seasonId} FOR SHARE`;
      await work(tx);
      const rows = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      ready(rows[0]!.pid);
      await gate;
    },
    { timeout: HOLD_MS, maxWait: 10_000 },
  );
  const pid = await Promise.race([held, done.then(() => Promise.reject(new Error("hold ended early")))]);
  return { pid, release, done };
}

/** Until a backend is queued behind `pid`. Fails, rather than hangs, if nothing ever is. */
async function untilBlockedBehind(pid: number) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const rows = await db.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_stat_activity WHERE ${pid}::int = ANY(pg_blocking_pids(pid))`;
    if (rows[0]!.n > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("nothing queued behind the held season row");
}

/** A season "being started" by another request: locked and ACTIVE, uncommitted. */
const startingNow = (seasonId: number) =>
  hold(seasonId, "FOR UPDATE", (tx) => tx.season.update({ where: { id: seasonId }, data: { status: "ACTIVE" } }));

/** One held side, one route behind it: returns the route's answer once the hold commits. */
async function behind<T>(
  held: { pid: number; release: () => void; done: Promise<unknown> },
  send: () => PromiseLike<T>,
): Promise<T> {
  const answer = Promise.resolve(send());
  try {
    await untilBlockedBehind(held.pid);
  } finally {
    held.release();
    await held.done;
  }
  return answer;
}

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
      request(app).post(`/api/v1/seasons/${draft}/enrollments`).set(superCall()).send({ userIds: [q.id] }),
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
      request(app).patch(`/api/v1/groups/${group.id}`).set(superCall()).send({ name: "Here", leaderIds: [q.id] }),
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
                name: q.email, email: q.email, university: null, faculty: null,
                universityGraduationYear: null, phone: null, dateOfBirth: null, notes: null,
              },
            },
          ],
        }),
    );
    expect(res.status).toBe(200);
    expect(await activeRoleRows(q.id)).toBe(1);
  });

  it.each([
    ["a draft remove", (seasonId: number, userId: number) =>
      request(app).delete(`/api/v1/seasons/${seasonId}/enrollments/${userId}`).set(superCall())],
    ["an override", (seasonId: number, userId: number) =>
      request(app).post(`/api/v1/seasons/${seasonId}/enrollments/${userId}/override`).set(superCall()).send({})],
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
      request(app)
        .patch(`/api/v1/seasons/${draft}`)
        .set(superCall())
        .send({
          code, program: "TEST", year: 2099, status: "DRAFT",
          startDate: "2099-01-01T00:00:00.000Z", endDate: "2099-12-31T00:00:00.000Z",
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
    const held = await hold(draft, "FOR SHARE", (tx) =>
      tx.seasonEnrollment.create({ data: { seasonId: draft, studentUserId: q.id, status: "ACTIVE" } }),
    );
    const res = await behind(held, () =>
      request(app).post(`/api/v1/seasons/${draft}/start`).set(superCall()).send({}),
    );
    expect([res.status, res.body.error?.code]).toEqual([409, "start_blocked"]);
    expect((await db.season.findUniqueOrThrow({ where: { id: draft } })).status).toBe("DRAFT");
    expect(await activeRoleRows(q.id)).toBe(1);
  });

  it("End waits for the write, then closes the new row too", async () => {
    const live = await season("ACTIVE");
    const q = await person("Late Student");
    const held = await hold(live, "FOR SHARE", (tx) =>
      tx.seasonEnrollment.create({ data: { seasonId: live, studentUserId: q.id, status: "ACTIVE" } }),
    );
    const res = await behind(held, () =>
      request(app).post(`/api/v1/seasons/${live}/end`).set(superCall()).send({ notPassed: [] }),
    );
    expect(res.status).toBe(200);
    const row = await db.seasonEnrollment.findFirstOrThrow({ where: { seasonId: live, studentUserId: q.id } });
    expect(row).toMatchObject({ status: "COMPLETED", result: "PASSED" });
  });

  it("a seat write behind an End reads the season finished, and refuses", async () => {
    const live = await season("ACTIVE");
    const q = await person("After The End");
    const held = await hold(live, "FOR UPDATE", (tx) =>
      tx.season.update({ where: { id: live }, data: { status: "COMPLETED" } }),
    );
    const res = await behind(held, () =>
      request(app).post(`/api/v1/seasons/${live}/enrollments`).set(superCall()).send({ userIds: [q.id] }),
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
