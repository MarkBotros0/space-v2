// Community model, Build 2, Task 7: only a super brings a dropped student back,
// and the rule is checked again on the way.
import request from "supertest";

import { db } from "../../db/client";
import { login } from "./fixtures";
import {
  adminTokenOf,
  app,
  as,
  ctx,
  finishedGbv,
  leading,
  nextN,
  person,
  rowOf,
  season,
  seedEnrollmentFixtures,
  stamp,
  teardownEnrollmentFixtures,
  type Status,
} from "./season-enrollments-setup";

jest.setTimeout(180000);

beforeAll(seedEnrollmentFixtures);
afterAll(teardownEnrollmentFixtures);

const restore = (seasonId: number, userId: number, token = ctx.superToken, body?: object) => {
  const call = request(app).post(`/api/v1/students/${userId}/enrollments/${seasonId}/restore`).set(as(token));
  return body ? call.send(body) : call;
};

const REASON = "Moved abroad for the term";

async function dropped(seasonId: number, name = "Mina") {
  const student = await person(name);
  await db.seasonEnrollment.create({
    data: { seasonId, studentUserId: student.id, status: "WITHDRAWN", droppedAt: new Date(), dropReason: REASON },
  });
  return student;
}

describe("POST /students/:id/enrollments/:seasonId/restore", () => {
  it("is refused to a season admin, and changes nothing", async () => {
    const target = await season("ACTIVE");
    const student = await dropped(target);
    const res = await restore(target, student.id, await adminTokenOf(target));
    expect(res.status).toBe(403);
    expect(await rowOf(target, student.id)).toMatchObject({ status: "WITHDRAWN", dropReason: REASON });
  });

  it.each<Status>(["DRAFT", "ACTIVE"])("brings them back in a %s season, their group kept", async (status) => {
    const target = await season(status);
    const group = await db.group.create({ data: { seasonId: target, name: `Group ${nextN()}` } });
    const student = await dropped(target);
    await db.seasonEnrollment.update({
      where: { studentUserId_seasonId: { studentUserId: student.id, seasonId: target } },
      data: { groupId: group.id },
    });
    const before = await stamp(student.id);

    const res = await restore(target, student.id);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: "ACTIVE" });
    expect(await rowOf(target, student.id)).toMatchObject({
      status: "ACTIVE",
      droppedAt: null,
      groupId: group.id,
      overrideById: null,
    });
    expect((await stamp(student.id))?.getTime()).not.toBe(before?.getTime());
  });

  describe("the old drop reason after a restore", () => {
    const enrolment = (seasonId: number, studentUserId: number) => ({
      where: { studentUserId_seasonId: { studentUserId, seasonId } },
    });
    const reasons = async (id: number, seasonId: number, token: string) => {
      const detail = await request(app).get(`/api/v1/students/${id}`).set(as(token));
      expect(detail.status).toBe(200);
      return (detail.body.data.enrollments as { seasonId: number; dropReason: string | null }[]).find(
        (e) => e.seasonId === seasonId,
      )?.dropReason;
    };

    it("stays on the row, and no read or audit line gives it out", async () => {
      const target = await season("ACTIVE");
      const student = await dropped(target);
      const admin = await adminTokenOf(target);
      expect(await reasons(student.id, target, admin)).toBe(REASON);
      const info = jest.spyOn(console, "info").mockImplementation(() => undefined);

      expect((await restore(target, student.id)).status).toBe(200);

      const lines = info.mock.calls.map((c) => String(c[0]));
      info.mockRestore();
      expect(lines).toContain(`[audit] enrollment.restore actor=${ctx.superId} subject=${student.id} season=${target}`);
      expect(lines.join("\n")).not.toContain(REASON);

      expect(await rowOf(target, student.id)).toMatchObject({ status: "ACTIVE", droppedAt: null, dropReason: REASON });
      expect(await reasons(student.id, target, ctx.superToken)).toBeNull();
      expect(await reasons(student.id, target, admin)).toBeNull();
      const list = await request(app).get(`/api/v1/students?status=dropped&seasonId=${target}`).set(as(ctx.superToken));
      expect(list.status).toBe(200);
      expect(JSON.stringify(list.body.data)).not.toContain(REASON);
    });

    it("stays hidden once the row completes", async () => {
      const target = await season("ACTIVE");
      const student = await dropped(target);
      expect((await restore(target, student.id)).status).toBe(200);
      await db.seasonEnrollment.update({
        ...enrolment(target, student.id),
        data: { status: "COMPLETED", completedAt: new Date() },
      });
      expect(await reasons(student.id, target, ctx.superToken)).toBeNull();
    });

    it("is replaced by a later drop, even one with no reason", async () => {
      const target = await season("ACTIVE");
      const student = await dropped(target);
      expect((await restore(target, student.id)).status).toBe(200);
      const dropAgain = await request(app)
        .patch(`/api/v1/students/${student.id}/enrollments/${target}`)
        .set(as(ctx.superToken))
        .send({ status: "WITHDRAWN" });
      expect(dropAgain.status).toBe(200);
      expect(await rowOf(target, student.id)).toMatchObject({ status: "WITHDRAWN", dropReason: null });
      expect(await reasons(student.id, target, ctx.superToken)).toBeNull();
    });
  });

  it("is refused, with the reason, to someone now in a role", async () => {
    const target = await season("ACTIVE");
    const student = await dropped(target);
    await db.user.update({ where: { id: student.id }, data: { graduationYear: null } });
    await leading(student.id, "GBV 2026");

    const res = await restore(target, student.id);

    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({
      code: "already_in_role",
      message: "Mina is already leading a group in GBV 2026",
    });
    expect(await rowOf(target, student.id)).toMatchObject({ status: "WITHDRAWN", dropReason: REASON });
  });

  it("a draft holds someone in a role, as adding does", async () => {
    const target = await season("DRAFT");
    const student = await dropped(target);
    await leading(student.id, "GBV 2026");
    expect((await restore(target, student.id)).status).toBe(200);
  });

  describe("a person the required program blocks", () => {
    const blocked = async () => {
      const target = await season("ACTIVE", "LEAD 2027", "GBV");
      const student = await dropped(target);
      await finishedGbv(student.id, "NOT_PASSED");
      return { target, student };
    };

    it("is refused without an override", async () => {
      const { target, student } = await blocked();
      const res = await restore(target, student.id);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("not_eligible");
      expect(res.body.error.message).toContain("Mina");
      expect(await rowOf(target, student.id)).toMatchObject({ status: "WITHDRAWN" });
    });

    it("comes back with one, which the row records", async () => {
      const { target, student } = await blocked();
      const res = await restore(target, student.id, ctx.superToken, { override: true });
      expect(res.status).toBe(200);
      const row = await rowOf(target, student.id);
      expect(row).toMatchObject({ status: "ACTIVE", overrideById: ctx.superId });
      expect(row?.overrideAt).not.toBeNull();
    });

    it("an override lifts the block and not a role", async () => {
      const { target, student } = await blocked();
      await leading(student.id, "GBV 2026");
      const res = await restore(target, student.id, ctx.superToken, { override: true });
      expect(res.status).toBe(409);
      expect(res.body.error).toEqual({
        code: "already_in_role",
        message: "Mina is already leading a group in GBV 2026",
      });
    });

    it("an override from before the drop doesn't let them through", async () => {
      const { target, student } = await blocked();
      await db.seasonEnrollment.update({
        where: { studentUserId_seasonId: { studentUserId: student.id, seasonId: target } },
        data: { overrideById: ctx.superId, overrideAt: new Date() },
      });
      expect((await restore(target, student.id)).status).toBe(409);
    });
  });

  it("records no override on someone who isn't blocked, and clears an old one", async () => {
    const target = await season("ACTIVE", "LEAD 2027", "GBV");
    const student = await dropped(target);
    await finishedGbv(student.id, "PASSED");
    await db.seasonEnrollment.update({
      where: { studentUserId_seasonId: { studentUserId: student.id, seasonId: target } },
      data: { overrideById: ctx.superId, overrideAt: new Date() },
    });
    expect((await restore(target, student.id, ctx.superToken, { override: true })).status).toBe(200);
    expect(await rowOf(target, student.id)).toMatchObject({ overrideById: null, overrideAt: null });
  });

  it.each<Status>(["COMPLETED", "ARCHIVED"])("is refused in a %s season", async (status) => {
    const target = await season(status);
    const student = await dropped(target);
    const res = await restore(target, student.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("season_finished");
    expect(await rowOf(target, student.id)).toMatchObject({ status: "WITHDRAWN", dropReason: REASON });
  });

  it("refuses an alumnus, a deactivated account and a stored non-student", async () => {
    const target = await season("ACTIVE");
    const alumnus = await dropped(target);
    await db.user.update({ where: { id: alumnus.id }, data: { graduationYear: 2020 } });
    expect((await restore(target, alumnus.id)).body.error.code).toBe("is_alumnus");

    const gone = await dropped(target);
    await db.user.update({ where: { id: gone.id }, data: { deletedAt: new Date() } });
    expect((await restore(target, gone.id)).body.error.code).toBe("user_inactive");

    const stored = await dropped(target);
    await db.user.update({ where: { id: stored.id }, data: { role: "LEADER" } });
    expect((await restore(target, stored.id)).body.error.code).toBe("not_student");
  });

  it("only moves a dropped row", async () => {
    const target = await season("ACTIVE");
    const active = await person("Active");
    await db.seasonEnrollment.create({ data: { seasonId: target, studentUserId: active.id, status: "ACTIVE" } });
    const res = await restore(target, active.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("not_dropped");
  });

  it("answers 404 for no row, no season and no person, and 400 for a bad body or id", async () => {
    const target = await season("ACTIVE");
    const stranger = await person("Stranger");
    expect((await restore(target, stranger.id)).status).toBe(404);
    expect((await restore(2147483000, stranger.id)).status).toBe(404);
    expect((await restore(target, 2147483000)).status).toBe(404);

    const student = await dropped(target);
    expect((await restore(target, student.id, ctx.superToken, { override: "yes" })).status).toBe(400);
    expect((await restore(target, student.id, ctx.superToken, { extra: 1 })).status).toBe(400);
    const badId = await request(app).post(`/api/v1/students/x/enrollments/${target}/restore`).set(as(ctx.superToken));
    expect(badId.status).toBe(400);
  });

  it("a restored student can sign in to the season again and be dropped again", async () => {
    const target = await season("ACTIVE");
    const student = await dropped(target);
    expect((await restore(target, student.id)).status).toBe(200);

    const token = await login(app, student.email);
    const me = await request(app).get("/api/v1/me").set(as(token));
    expect(me.body.data.scopes.activeSeasonId).toBe(target);

    const again = await request(app)
      .patch(`/api/v1/students/${student.id}/enrollments/${target}`)
      .set(as(ctx.superToken))
      .send({ status: "WITHDRAWN", dropReason: "Second time" });
    expect(again.status).toBe(200);
    expect(await rowOf(target, student.id)).toMatchObject({ status: "WITHDRAWN", dropReason: "Second time" });
  });
});

describe("PATCH /students/:id/enrollments/:seasonId with COMPLETED", () => {
  it("sends everyone to End season, super included, and writes nothing", async () => {
    const target = await season("ACTIVE");
    const student = await person("Peter");
    await db.seasonEnrollment.create({ data: { seasonId: target, studentUserId: student.id, status: "ACTIVE" } });

    for (const token of [ctx.superToken, await adminTokenOf(target)]) {
      const res = await request(app)
        .patch(`/api/v1/students/${student.id}/enrollments/${target}`)
        .set(as(token))
        .send({ status: "COMPLETED" });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("use_end_season");
    }
    expect(await rowOf(target, student.id)).toMatchObject({ status: "ACTIVE", completedAt: null });
  });
});
