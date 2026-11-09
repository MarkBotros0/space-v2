// Starting a season: the check that decides it and the route that does it.
// Racing seat writes are in season-start-races.test.ts.
import request from "supertest";

import { db } from "../../db/client";
import { verifyAccessToken } from "../../lib/auth/tokens";
import { PASSWORD } from "./fixtures";
import {
  adminTokenOf,
  app,
  as,
  ctx,
  finishedGbv,
  person,
  season,
  seedEnrollmentFixtures,
  teardownEnrollmentFixtures,
} from "./season-enrollments-setup";

jest.setTimeout(120000);

beforeAll(seedEnrollmentFixtures);
afterAll(teardownEnrollmentFixtures);

const check = (id: number, token = ctx.superToken) =>
  request(app).get(`/api/v1/seasons/${id}/start-check`).set(as(token));
const start = (id: number, token = ctx.superToken) =>
  request(app).post(`/api/v1/seasons/${id}/start`).set(as(token)).send({});
const statusOf = async (id: number) =>
  (await db.season.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;
const codeOf = async (id: number) =>
  (await db.season.findUniqueOrThrow({ where: { id }, select: { code: true } })).code;

const seatAdmin = (seasonId: number, userId: number) => db.seasonAdmin.create({ data: { seasonId, userId } });
let groups = 0;
const seatLeader = (seasonId: number, userId: number) =>
  db.group.create({ data: { seasonId, name: `Group ${++groups}`, leaders: { create: [{ userId }] } } });
const seatStudent = (seasonId: number, studentUserId: number, overridden = false) =>
  db.seasonEnrollment.create({
    data: {
      seasonId,
      studentUserId,
      status: "ACTIVE",
      ...(overridden ? { overrideAt: new Date(), overrideById: ctx.superId } : {}),
    },
  });

/** Rows that would each be an active role; the rule keeps it to one. */
const activeRoleRows = async (userId: number) => {
  const live = { status: "ACTIVE", deletedAt: null } as const;
  return (
    (await db.seasonAdmin.count({ where: { userId, season: live } })) +
    (await db.groupLeader.count({ where: { userId, group: { season: live } } })) +
    (await db.seasonEnrollment.count({ where: { studentUserId: userId, status: "ACTIVE", season: live } }))
  );
};

describe("who may start", () => {
  it("answers 403 to a season admin on both routes, and starts nothing", async () => {
    const id = await season("DRAFT");
    const token = await adminTokenOf(id);
    expect((await check(id, token)).status).toBe(403);
    expect((await start(id, token)).status).toBe(403);
    expect(await statusOf(id)).toBe("DRAFT");
  });

  it("answers 404 for no such season and 409 not_draft for one already going", async () => {
    expect((await check(2147483600)).status).toBe(404);
    expect((await start(2147483600)).status).toBe(404);
    for (const status of ["ACTIVE", "COMPLETED", "ARCHIVED"] as const) {
      const id = await season(status);
      const [checked, started] = [await check(id), await start(id)];
      expect([checked.status, checked.body.error.code]).toEqual([409, "not_draft"]);
      expect([started.status, started.body.error.code]).toEqual([409, "not_draft"]);
      expect(await statusOf(id)).toBe(status);
    }
  });
});

describe("GET /seasons/:id/start-check", () => {
  it("a season with no people is ready, and starts", async () => {
    const id = await season("DRAFT");
    const res = await check(id);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ ready: true, items: [], seasonsInTheWay: [] });
    expect((await start(id)).status).toBe(200);
    expect(await statusOf(id)).toBe("ACTIVE");
  });

  it("already_in_role names the role and the other season, in the seat they hold here", async () => {
    const other = await season("ACTIVE", "GBV 2026");
    const id = await season("DRAFT");
    const mina = await person("Mina", 2020);
    await seatLeader(other, mina.id);
    await seatAdmin(id, mina.id);
    const res = await check(id);
    expect(res.body.data).toEqual({
      ready: false,
      seasonsInTheWay: [],
      items: [
        {
          userId: mina.id,
          name: "Mina",
          seat: "admin",
          reason: "already_in_role",
          message: "Mina is already leading a group in GBV 2026",
          otherSeasonCode: await codeOf(other),
        },
      ],
    });
  });

  it("not_alumnus: someone who hasn't graduated can't serve", async () => {
    const id = await season("DRAFT");
    const omar = await person("Omar");
    await seatLeader(id, omar.id);
    expect((await check(id)).body.data.items).toEqual([
      {
        userId: omar.id,
        name: "Omar",
        seat: "leader",
        reason: "not_alumnus",
        message: "Only alumni can serve. Omar hasn't graduated.",
        otherSeasonCode: null,
      },
    ]);
  });

  it("is_alumnus: an alumnus can't study", async () => {
    const id = await season("DRAFT");
    const amir = await person("Amir", 2019);
    await seatStudent(id, amir.id);
    expect((await check(id)).body.data.items).toEqual([
      {
        userId: amir.id,
        name: "Amir",
        seat: "student",
        reason: "is_alumnus",
        message: "Amir is an alumnus and can't join as a student.",
        otherSeasonCode: null,
      },
    ]);
  });

  it("permanent_role: a mentor can't hold a season seat", async () => {
    const id = await season("DRAFT");
    const maged = await person("Maged", 2010);
    await db.user.update({ where: { id: maged.id }, data: { role: "MENTOR" } });
    await seatAdmin(id, maged.id);
    expect((await check(id)).body.data.items).toEqual([
      {
        userId: maged.id,
        name: "Maged",
        seat: "admin",
        reason: "permanent_role",
        message: "Maged is a mentor and can't take a season role.",
        otherSeasonCode: null,
      },
    ]);
  });

  it("user_inactive: a deactivated account blocks until it's removed", async () => {
    const id = await season("DRAFT");
    const gone = await person("Gone");
    await db.user.update({ where: { id: gone.id }, data: { deletedAt: new Date() } });
    await seatStudent(id, gone.id);
    expect((await check(id)).body.data.items).toEqual([
      {
        userId: gone.id,
        name: "Gone",
        seat: "student",
        reason: "user_inactive",
        message: "That account is deactivated.",
        otherSeasonCode: null,
      },
    ]);
  });

  it("leader_has_group only for someone leading two groups here, and once", async () => {
    const id = await season("DRAFT");
    const one = await person("One Group", 2018);
    const two = await person("Two Groups", 2018);
    await seatLeader(id, one.id);
    await seatLeader(id, two.id);
    await seatLeader(id, two.id);
    expect((await check(id)).body.data.items).toEqual([
      {
        userId: two.id,
        name: "Two Groups",
        seat: "leader",
        reason: "leader_has_group",
        message: "Two Groups leads 2 groups in this season.",
        otherSeasonCode: null,
      },
    ]);
  });

  it("did_not_pass and never_finished come from standing", async () => {
    const id = await season("DRAFT", "Next", "GBV");
    const sara = await person("Sara");
    const nora = await person("Nora");
    await finishedGbv(sara.id, "NOT_PASSED");
    await seatStudent(id, sara.id);
    await seatStudent(id, nora.id);
    const items = (await check(id)).body.data.items as { name: string; reason: string; message: string }[];
    expect(items.map((i) => [i.name, i.reason, i.message]).sort()).toEqual([
      ["Nora", "never_finished", "Nora hasn't finished GBV yet"],
      ["Sara", "did_not_pass", "Sara did not pass GBV 2026"],
    ]);
  });

  it("a recorded override removes a block from the list", async () => {
    const id = await season("DRAFT", "Next", "GBV");
    const nora = await person("Nora Over");
    await seatStudent(id, nora.id, true);
    expect((await check(id)).body.data).toEqual({ ready: true, items: [], seasonsInTheWay: [] });
    expect((await start(id)).status).toBe(200);
  });

  it("an override doesn't remove an in-role block, and each reason is its own item", async () => {
    const other = await season("ACTIVE", "ABC 2026");
    const blocked = await season("DRAFT", "Next", "GBV");
    const overridden = await season("DRAFT", "Next", "GBV");
    const sami = await person("Sami");
    await seatStudent(other, sami.id);
    await seatStudent(blocked, sami.id);
    await seatStudent(overridden, sami.id, true);

    const both = (await check(blocked)).body.data.items as { reason: string }[];
    expect(both.map((i) => i.reason).sort()).toEqual(["already_in_role", "never_finished"]);
    const left = await check(overridden);
    expect(left.body.data.ready).toBe(false);
    expect(left.body.data.items.map((i: { reason: string }) => i.reason)).toEqual(["already_in_role"]);
  });

  it("a dropped row and a draft elsewhere don't count", async () => {
    const elsewhere = await season("DRAFT", "Other Draft");
    const id = await season("DRAFT");
    const dropped = await person("Dropped", 2017);
    const listed = await person("Listed");
    await db.seasonEnrollment.create({ data: { seasonId: id, studentUserId: dropped.id, status: "WITHDRAWN" } });
    await seatStudent(elsewhere, listed.id);
    await seatStudent(id, listed.id);
    expect((await check(id)).body.data).toEqual({ ready: true, items: [], seasonsInTheWay: [] });
  });
});

describe("POST /seasons/:id/start", () => {
  it("not ready: 409 start_blocked in words, and nothing changes", async () => {
    const other = await season("ACTIVE", "GBV 2026");
    const id = await season("DRAFT");
    const mina = await person("Mina", 2020);
    const omar = await person("Omar");
    await seatLeader(other, mina.id);
    await seatAdmin(id, mina.id);
    await seatStudent(id, omar.id);
    const res = await start(id);
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({
      code: "start_blocked",
      message: "Mina is already leading a group in GBV 2026",
    });
    expect(await statusOf(id)).toBe("DRAFT");
    const stamp = await db.user.findUniqueOrThrow({ where: { id: omar.id }, select: { sessionsValidFrom: true } });
    expect(stamp.sessionsValidFrom).toBeNull();
  });

  it("says how many more are on the list", async () => {
    const id = await season("DRAFT");
    await seatStudent(id, (await person("Alumna A", 2018)).id);
    await seatStudent(id, (await person("Alumna B", 2018)).id);
    await seatStudent(id, (await person("Alumna C", 2018)).id);
    const res = await start(id);
    expect(res.body.error.message).toBe("Alumna A is an alumnus and can't join as a student, and 2 more to clear.");
  });

  it("starts: ACTIVE, and everyone in it goes stale, but not a bystander", async () => {
    const id = await season("DRAFT");
    const student = await person("Stu");
    const admin = await person("Ada", 2020);
    const leader = await person("Lee", 2020);
    const bystander = await person("By");
    await seatStudent(id, student.id);
    await seatAdmin(id, admin.id);
    await seatLeader(id, leader.id);

    const res = await start(id);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ season: { id, code: await codeOf(id), status: "ACTIVE" } });
    const stamp = async (userId: number) =>
      (await db.user.findUniqueOrThrow({ where: { id: userId }, select: { sessionsValidFrom: true } }))
        .sessionsValidFrom;
    expect(await stamp(student.id)).not.toBeNull();
    expect(await stamp(admin.id)).not.toBeNull();
    expect(await stamp(leader.id)).not.toBeNull();
    expect(await stamp(bystander.id)).toBeNull();
  });

  it("listed in two drafts: the first starts once clear, then the second reports them", async () => {
    const running = await season("ACTIVE", "Running");
    const first = await season("DRAFT", "First");
    const second = await season("DRAFT", "Second");
    const pat = await person("Pat", 2016);
    await seatAdmin(running, pat.id);
    await seatAdmin(first, pat.id);
    await seatAdmin(second, pat.id);

    const blocked = await start(first);
    expect([blocked.status, blocked.body.error.code]).toEqual([409, "start_blocked"]);

    await db.seasonAdmin.deleteMany({ where: { seasonId: running, userId: pat.id } });
    expect((await check(first)).body.data.ready).toBe(true);
    expect((await start(first)).status).toBe(200);

    expect((await check(second)).body.data.items).toEqual([
      {
        userId: pat.id,
        name: "Pat",
        seat: "admin",
        reason: "already_in_role",
        message: "Pat is already an admin of First",
        otherSeasonCode: await codeOf(first),
      },
    ]);
    expect((await start(second)).status).toBe(409);
    expect(await activeRoleRows(pat.id)).toBe(1);
  });

  it("two starts racing over one person leave them with one role", async () => {
    const a = await season("DRAFT", "Race A");
    const b = await season("DRAFT", "Race B");
    const rae = await person("Rae", 2016);
    await seatAdmin(a, rae.id);
    await seatLeader(b, rae.id);

    const results = await Promise.all([start(a), start(b)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(results.find((r) => r.status === 409)!.body.error.code).toBe("start_blocked");
    expect(await activeRoleRows(rae.id)).toBe(1);
  });

  it("two starts of one season: one wins, the other is not_draft", async () => {
    const id = await season("DRAFT");
    const results = await Promise.all([start(id), start(id)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(results.find((r) => r.status === 409)!.body.error.code).toBe("not_draft");
  });

  it("the derived role lands on refresh, with no new sign-in", async () => {
    const id = await season("DRAFT");
    const admin = await person("Refresh Admin", 2020);
    const student = await person("Refresh Student");
    await seatAdmin(id, admin.id);
    await seatStudent(id, student.id);
    const signIn = async (email: string) =>
      (await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD })).body.data as {
        refreshToken: string;
      };
    const adminSession = await signIn(admin.email);
    const studentSession = await signIn(student.email);

    expect((await start(id)).status).toBe(200);

    const refresh = async (refreshToken: string) => {
      const res = await request(app).post("/api/v1/auth/refresh").send({ refreshToken });
      expect(res.status).toBe(200);
      return verifyAccessToken(res.body.data.accessToken);
    };
    expect(await refresh(adminSession.refreshToken)).toMatchObject({ role: "ADMIN", seasonAdminIds: [id] });
    expect(await refresh(studentSession.refreshToken)).toMatchObject({ role: "STUDENT", activeSeasonId: id });
  });
});
