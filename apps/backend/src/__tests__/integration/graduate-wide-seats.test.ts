// Graduating never ends a place in a community-wide season (owner, 2026-11-07):
// the graduate stays in it as an alumnus, draft or live, and gets a result at End.
// Regular seats still end as before.
import request from "supertest";

import { db } from "../../db/client";
import { loadScopes } from "../../lib/auth/scopes";
import { endBodyOf } from "./fixtures";
import {
  app,
  as,
  ctx,
  person,
  rowOf,
  season,
  seedEnrollmentFixtures,
  teardownEnrollmentFixtures,
} from "./season-enrollments-setup";

jest.setTimeout(120000);

beforeAll(seedEnrollmentFixtures);
afterAll(teardownEnrollmentFixtures);

const wide = async (status: "DRAFT" | "ACTIVE", title: string) => {
  const id = await season(status, title);
  await db.season.update({ where: { id }, data: { isCommunityWide: true } });
  return id;
};
const endIt = async (seasonId: number) =>
  request(app)
    .post(`/api/v1/seasons/${seasonId}/end`)
    .set(as(ctx.superToken))
    .send(await endBodyOf(seasonId));
const graduate = (id: number) =>
  request(app)
    .post(`/api/v1/students/${id}/graduate`)
    .set(as(ctx.superToken))
    .send({ graduationYear: 2026, override: true, overrideReason: "Test exception, see ticket" });

describe("a graduating season's End and a community-wide draft", () => {
  it("keeps the graduate's row and group place on the wide draft", async () => {
    const draft = await wide("DRAFT", "Wide Draft");
    const x = await person("Wide Planned");
    await db.seasonEnrollment.create({ data: { seasonId: draft, studentUserId: x.id, status: "ACTIVE" } });
    const group = await db.group.create({ data: { seasonId: draft, name: "Wide group" } });
    await db.groupStudent.create({ data: { seasonId: draft, groupId: group.id, studentUserId: x.id } });
    const gbv = await season("ACTIVE", "Graduating");
    await db.season.update({ where: { id: gbv }, data: { graduatesOnPass: true } });
    await db.seasonEnrollment.create({ data: { seasonId: gbv, studentUserId: x.id, status: "ACTIVE" } });
    const res = await endIt(gbv);
    expect(res.status).toBe(200);
    expect(res.body.data.graduated).toBe(1);
    expect((await rowOf(draft, x.id))?.status).toBe("ACTIVE");
    expect(await db.groupStudent.count({ where: { seasonId: draft, studentUserId: x.id } })).toBe(1);
  });
});

describe("graduating someone in a live community-wide season", () => {
  it("the exception keeps the wide row and the token's season, ends the regular seat, and the count leaves the wide one out", async () => {
    const live = await wide("ACTIVE", "Wide Live");
    const x = await person("Wide Studying");
    await db.seasonEnrollment.create({ data: { seasonId: live, studentUserId: x.id, status: "ACTIVE" } });
    const res = await graduate(x.id);
    expect(res.status).toBe(200);
    expect(res.body.data.enrollmentsCompleted).toBe(0);
    expect((await rowOf(live, x.id))?.status).toBe("ACTIVE");
    expect((await loadScopes(x.id)).activeSeasonId).toBe(live);
  });

  it("a regular seat still ends beside it, and the wide season's End gives a result", async () => {
    const live = await wide("ACTIVE", "Wide Live Two");
    const x = await person("Wide And Regular");
    await db.seasonEnrollment.create({ data: { seasonId: live, studentUserId: x.id, status: "ACTIVE" } });
    // A regular seat can't coexist in an ACTIVE season with a wide one through the API; seed the row directly.
    const regular = await season("ACTIVE", "Regular");
    await db.seasonEnrollment.create({ data: { seasonId: regular, studentUserId: x.id, status: "ACTIVE" } });
    const res = await graduate(x.id);
    expect(res.body.data.enrollmentsCompleted).toBe(1);
    expect((await rowOf(regular, x.id))?.status).toBe("COMPLETED");
    expect((await rowOf(live, x.id))?.status).toBe("ACTIVE");
    expect((await endIt(live)).status).toBe(200);
    expect(await rowOf(live, x.id)).toMatchObject({ status: "COMPLETED", result: "PASSED" });
  });

  it("correcting an old result to Passed keeps the wide row too", async () => {
    const live = await wide("ACTIVE", "Wide Live Three");
    const old = await season("COMPLETED", "Old GBV");
    await db.season.update({ where: { id: old }, data: { graduatesOnPass: true } });
    const x = await person("Corrected");
    await db.seasonEnrollment.create({
      data: { seasonId: old, studentUserId: x.id, status: "COMPLETED", result: "NOT_PASSED", completedAt: new Date() },
    });
    await db.seasonEnrollment.create({ data: { seasonId: live, studentUserId: x.id, status: "ACTIVE" } });
    const res = await request(app)
      .patch(`/api/v1/seasons/${old}/results/${x.id}`)
      .set(as(ctx.superToken))
      .send({ result: "PASSED", reason: null });
    expect(res.status).toBe(200);
    expect(res.body.data.graduated).toBe(true);
    expect((await rowOf(live, x.id))?.status).toBe("ACTIVE");
    expect((await loadScopes(x.id)).activeSeasonId).toBe(live);
  });
});

describe("a season's Students list", () => {
  it("keeps a dropped alumnus on a community-wide season's list", async () => {
    const live = await wide("ACTIVE", "Wide Dropped");
    const x = await person("Dropped Alumnus", 2019);
    await db.seasonEnrollment.create({ data: { seasonId: live, studentUserId: x.id, status: "WITHDRAWN" } });
    const res = await request(app).get(`/api/v1/students?seasonId=${live}&limit=100`).set(as(ctx.superToken));
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toContain("Dropped Alumnus");
  });
});
