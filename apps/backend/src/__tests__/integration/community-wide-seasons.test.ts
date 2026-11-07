// Community model, Build 3, Task 1: the community-wide season flag and its rules.
import request from "supertest";

import { db } from "../../db/client";
import { testSeasonCode } from "./fixtures";
import { adminTokenOf, app, as, ctx, season, seedEnrollmentFixtures, teardownEnrollmentFixtures } from "./season-enrollments-setup";

jest.setTimeout(120000);

beforeAll(seedEnrollmentFixtures);
afterAll(teardownEnrollmentFixtures);

const RULES = "A community-wide season has no required program and graduates nobody.";
let n = 0;
const body = (over: object = {}) => ({
  program: "TEST",
  year: 2099,
  code: `space-v2-test-cw${Date.now() % 100000}-${++n}`,
  startDate: "2099-01-01T00:00:00.000Z",
  endDate: "2099-12-31T00:00:00.000Z",
  status: "DRAFT",
  ...over,
});
const create = (payload: object, token = ctx.superToken) =>
  request(app).post("/api/v1/seasons").set(as(token)).send(payload);
const patchSeason = (id: number, payload: object, token = ctx.superToken) =>
  request(app).patch(`/api/v1/seasons/${id}`).set(as(token)).send(payload);
const flag = async (id: number) =>
  (await db.season.findUniqueOrThrow({ where: { id }, select: { isCommunityWide: true } })).isCommunityWide;
const ownBody = async (id: number, over: object) => {
  const s = await db.season.findUniqueOrThrow({ where: { id }, select: { code: true, status: true, program: true } });
  return body({ code: s.code, status: s.status, program: s.program, ...over });
};

describe("Season.isCommunityWide", () => {
  it("defaults off; a super can create a draft with it on", async () => {
    expect(await flag(await season("DRAFT"))).toBe(false);
    const res = await create(body({ isCommunityWide: true }));
    expect(res.status).toBe(201);
    expect(await flag(res.body.data.id)).toBe(true);
  });

  it("is returned in the season detail", async () => {
    const id = await season("DRAFT");
    await db.season.update({ where: { id }, data: { isCommunityWide: true } });
    const res = await request(app).get(`/api/v1/seasons/${id}`).set(as(ctx.superToken));
    expect(res.body.data.isCommunityWide).toBe(true);
  });

  it("a season admin can't write it", async () => {
    const id = await season("DRAFT");
    const res = await patchSeason(id, { isCommunityWide: true }, await adminTokenOf(id));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden_field");
    expect(await flag(id)).toBe(false);
  });

  it.each([{ graduatesOnPass: true }, { requiredProgram: "GBV" }])("with %j on create is refused", async (extra) => {
    const res = await create(body({ isCommunityWide: true, ...extra }));
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({ code: "community_wide_rules", message: RULES });
  });

  it.each([{ graduatesOnPass: true }, { requiredProgram: "GBV" }])("with %j on update is refused", async (extra) => {
    const id = await season("DRAFT");
    const res = await patchSeason(id, await ownBody(id, { isCommunityWide: true, ...extra }));
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({ code: "community_wide_rules", message: RULES });
    expect(await flag(id)).toBe(false);
  });

  it("is refused when turned on over a season that already requires a program", async () => {
    const id = await season("DRAFT", "Req", "GBV");
    const res = await patchSeason(id, await ownBody(id, { isCommunityWide: true }));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("community_wide_rules");
  });

  it("a super can switch it on and off while DRAFT", async () => {
    const id = await season("DRAFT");
    expect((await patchSeason(id, await ownBody(id, { isCommunityWide: true }))).status).toBe(200);
    expect(await flag(id)).toBe(true);
    expect((await patchSeason(id, await ownBody(id, { isCommunityWide: false }))).status).toBe(200);
    expect(await flag(id)).toBe(false);
  });

  it.each(["ACTIVE", "COMPLETED", "ARCHIVED"] as const)("can't change on a %s season, though the same value saves", async (status) => {
    const id = await season(status);
    const refused = await patchSeason(id, await ownBody(id, { isCommunityWide: true }));
    expect(refused.status).toBe(409);
    expect(refused.body.error).toEqual({ code: "season_started", message: "This season has started, so this can't change." });
    expect(await flag(id)).toBe(false);
    expect((await patchSeason(id, await ownBody(id, { isCommunityWide: false }))).status).toBe(200);
  });

  it("a body without it leaves it as it is", async () => {
    const id = await season("DRAFT");
    await db.season.update({ where: { id }, data: { isCommunityWide: true } });
    expect((await patchSeason(id, await ownBody(id, {}))).status).toBe(200);
    expect(await flag(id)).toBe(true);
  });

  it("duplicating a season copies it", async () => {
    const id = await season("COMPLETED");
    await db.season.update({ where: { id }, data: { isCommunityWide: true } });
    const res = await request(app)
      .post(`/api/v1/seasons/${id}/duplicate`)
      .set(as(ctx.superToken))
      .send({ year: 2098, code: testSeasonCode(), startDate: "2098-01-01T00:00:00.000Z", endDate: "2098-12-31T00:00:00.000Z" });
    expect(res.status).toBe(201);
    expect(await flag(res.body.data.id)).toBe(true);
  });
});

describe("Season.isCommunityWide, resending", () => {
  it("turned on over a stored graduatesOnPass is community_wide_rules", async () => {
    const id = await season("DRAFT");
    await db.season.update({ where: { id }, data: { graduatesOnPass: true } });
    const res = await patchSeason(id, await ownBody(id, { isCommunityWide: true }));
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({ code: "community_wide_rules", message: RULES });
    expect(await flag(id)).toBe(false);
  });

  it("a started season resending the unchanged flag is accepted", async () => {
    const id = await season("ACTIVE");
    await db.season.update({ where: { id }, data: { isCommunityWide: true } });
    const res = await patchSeason(id, await ownBody(id, { isCommunityWide: true }));
    expect(res.status).toBe(200);
    expect(await flag(id)).toBe(true);
  });
});
