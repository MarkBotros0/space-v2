// Community model, Build 2, Task 14: students graduate by passing a graduating season.
import request from "supertest";

import { backfillResults } from "../../../scripts/community-preflight";
import { db } from "../../db/client";
import { auditLines, correct, enrol, finished, graduate, mint, nextSecond, seasonOf, yearOf } from "./graduating-seasons-setup";
import { adminTokenOf, app, as, ctx, person, rowOf, seedEnrollmentFixtures, stamp, teardownEnrollmentFixtures } from "./season-enrollments-setup";

jest.setTimeout(180000);

beforeAll(seedEnrollmentFixtures);
afterAll(teardownEnrollmentFixtures);

describe("Correcting a result", () => {
  it("to Passed on a graduating season graduates them then, with fresh claims", async () => {
    const seasonId = await seasonOf("COMPLETED", true, new Date("2026-06-30T00:00:00.000Z"), 2025);
    const student = await person("Corrected");
    await finished(seasonId, student.id, "NOT_PASSED");
    const before = await stamp(student.id);
    await nextSecond();
    const res = await correct(seasonId, student.id, "PASSED");
    expect(res.status).toBe(200);
    expect(res.body.data.graduated).toBe(true);
    expect(await yearOf(student.id)).toBe(2025);
    expect((await stamp(student.id))?.getTime()).not.toBe(before?.getTime());
  });

  it.each([
    [2026, "2027-06-30T00:00:00.000Z"],
    [2027, "2026-06-30T00:00:00.000Z"],
  ])("to Passed on a %s season gives the class of the season's year, whenever it ended", async (year, endDate) => {
    const seasonId = await seasonOf("COMPLETED", true, new Date(endDate), year);
    const student = await person(`Year${year}`);
    await finished(seasonId, student.id, "NOT_PASSED");
    expect((await correct(seasonId, student.id, "PASSED")).body.data.graduated).toBe(true);
    expect(await yearOf(student.id)).toBe(year);
  });

  it("to Passed for someone already an alumnus keeps their year", async () => {
    const seasonId = await seasonOf("ARCHIVED", true, new Date("2026-06-30T00:00:00.000Z"), 2025);
    const student = await person("Kept", 2020);
    await finished(seasonId, student.id, "NOT_PASSED");
    const res = await correct(seasonId, student.id, "PASSED");
    expect(res.body.data.graduated).toBe(false);
    expect(await yearOf(student.id)).toBe(2020);
  });

  it("to Did not pass doesn't remove alumni status", async () => {
    const seasonId = await seasonOf("COMPLETED", true);
    const student = await person("Stays", 2025);
    await finished(seasonId, student.id, "PASSED");
    const res = await correct(seasonId, student.id, "NOT_PASSED");
    expect(res.status).toBe(200);
    expect(res.body.data.graduated).toBe(false);
    expect(await yearOf(student.id)).toBe(2025);
    expect(await rowOf(seasonId, student.id)).toMatchObject({ result: "NOT_PASSED" });
  });

  it("on an ordinary season does neither", async () => {
    const seasonId = await seasonOf("COMPLETED", false);
    const up = await person("Up");
    const down = await person("Down", 2021);
    await finished(seasonId, up.id, "NOT_PASSED");
    await finished(seasonId, down.id, "PASSED");
    expect((await correct(seasonId, up.id, "PASSED")).body.data.graduated).toBe(false);
    expect((await correct(seasonId, down.id, "NOT_PASSED")).body.data.graduated).toBe(false);
    expect(await yearOf(up.id)).toBeNull();
    expect(await yearOf(down.id)).toBe(2021);
  });
});

describe("Season.graduatesOnPass", () => {
  const body = (over: object = {}) => ({
    program: "TEST",
    year: 2099,
    code: `gs-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    startDate: "2099-01-01T00:00:00.000Z",
    endDate: "2099-12-31T00:00:00.000Z",
    status: "DRAFT",
    ...over,
  });
  const patchSeason = (id: number, payload: object, token = ctx.superToken) =>
    request(app).patch(`/api/v1/seasons/${id}`).set(as(token)).send(payload);
  const flag = async (id: number) =>
    (await db.season.findUniqueOrThrow({ where: { id }, select: { graduatesOnPass: true } })).graduatesOnPass;
  const ownBody = async (id: number, over: object) => {
    const s = await db.season.findUniqueOrThrow({ where: { id }, select: { code: true, status: true } });
    return body({ code: s.code, status: s.status, ...over });
  };

  it("defaults off; a super can create a season with it on", async () => {
    const off = await seasonOf("DRAFT", false);
    expect(await flag(off)).toBe(false);
    const res = await request(app)
      .post("/api/v1/seasons")
      .set(as(ctx.superToken))
      .send(body({ code: `space-v2-test-g${Date.now() % 100000}`, graduatesOnPass: true }));
    expect(res.status).toBe(201);
    expect(await flag(res.body.data.id)).toBe(true);
  });

  it.each(["DRAFT", "ACTIVE"] as const)("a super can change it on a %s season", async (status) => {
    const id = await seasonOf(status, false);
    const res = await patchSeason(id, await ownBody(id, { graduatesOnPass: true }));
    expect(res.status).toBe(200);
    expect(await flag(id)).toBe(true);
  });

  it("a body without it leaves it as it is", async () => {
    const id = await seasonOf("ACTIVE", true);
    expect((await patchSeason(id, await ownBody(id, {}))).status).toBe(200);
    expect(await flag(id)).toBe(true);
  });

  it.each(["COMPLETED", "ARCHIVED"] as const)("can't change on a %s season, though the same value saves", async (status) => {
    const id = await seasonOf(status, false);
    const refused = await patchSeason(id, await ownBody(id, { graduatesOnPass: true }));
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe("season_finished");
    expect(await flag(id)).toBe(false);
    expect((await patchSeason(id, await ownBody(id, { graduatesOnPass: false }))).status).toBe(200);
  });

  it("a season admin can't write it", async () => {
    const id = await seasonOf("ACTIVE", false);
    const token = await adminTokenOf(id);
    const res = await patchSeason(id, { graduatesOnPass: true }, token);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden_field");
    expect(await flag(id)).toBe(false);
  });

  it("is returned to staff, and left out for a student", async () => {
    const id = await seasonOf("ACTIVE", true);
    const student = await person("Reader");
    await enrol(id, student.id);
    const read = (t: string) => request(app).get(`/api/v1/seasons/${id}`).set(as(t));
    expect((await read(ctx.superToken)).body.data.graduatesOnPass).toBe(true);
    expect((await read(await adminTokenOf(id))).body.data.graduatesOnPass).toBe(true);
    const asStudent = await read(await mint(student.id));
    expect(asStudent.status).toBe(200);
    expect(asStudent.body.data).not.toHaveProperty("graduatesOnPass");
  });

  it("is copied by duplicate", async () => {
    const id = await seasonOf("COMPLETED", true);
    const res = await request(app)
      .post(`/api/v1/seasons/${id}/duplicate`)
      .set(as(ctx.superToken))
      .send({ year: 2099, code: `space-v2-test-d${Date.now() % 100000}`, startDate: "2099-02-01T00:00:00.000Z", endDate: "2099-12-01T00:00:00.000Z" });
    expect(res.status).toBe(201);
    expect(await flag(res.body.data.id)).toBe(true);
  });
});

describe("Graduating someone by exception", () => {
  it("refuses someone who hasn't passed a graduating season, in words", async () => {
    const student = await person("Mina");
    const ordinary = await seasonOf("COMPLETED", false);
    await finished(ordinary, student.id, "PASSED");
    const failed = await seasonOf("COMPLETED", true);
    await finished(failed, student.id, "NOT_PASSED");
    const res = await graduate(student.id, { graduationYear: 2025 });
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({ code: "not_qualified", message: "Mina hasn't passed a graduating season." });
    expect(await yearOf(student.id)).toBeNull();
  });

  it("a passed result in a graduating season still running doesn't qualify", async () => {
    const student = await person("Running");
    const live = await seasonOf("ACTIVE", true);
    await finished(live, student.id, "PASSED");
    expect((await graduate(student.id, { graduationYear: 2025 })).body.error.code).toBe("not_qualified");
  });

  it("override works for a super, completes the live seat and is audited", async () => {
    const student = await person("Exception");
    const live = await seasonOf("ACTIVE", false);
    await enrol(live, student.id);
    const lines = await auditLines(async () => {
      const res = await graduate(student.id, { graduationYear: 2025, override: true, overrideReason: "A very rare case" });
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ id: student.id, graduationYear: 2025, enrollmentsCompleted: 1 });
    });
    expect(await yearOf(student.id)).toBe(2025);
    expect(await rowOf(live, student.id)).toMatchObject({ status: "COMPLETED", result: null });
    expect(lines).toContain(`[audit] student.graduate actor=${ctx.superId} subject=${student.id} override=true`);
  });

  it("someone qualified needs no override, and isn't audited as one", async () => {
    const student = await person("Qualified");
    const passed = await seasonOf("ARCHIVED", true);
    await finished(passed, student.id, "PASSED");
    const lines = await auditLines(async () => {
      expect((await graduate(student.id, { graduationYear: 2025 })).status).toBe(200);
    });
    expect(await yearOf(student.id)).toBe(2025);
    expect(lines).toContain(`[audit] student.graduate actor=${ctx.superId} subject=${student.id}`);
  });

  it("a non-super is refused, override or not", async () => {
    const student = await person("NotYours");
    const id = await seasonOf("ACTIVE", false);
    await enrol(id, student.id);
    const token = await adminTokenOf(id);
    expect((await graduate(student.id, { graduationYear: 2025, override: true, overrideReason: "Test exception, see ticket" }, token)).status).toBe(403);
    expect(await yearOf(student.id)).toBeNull();
  });

  it("an alumnus is already_graduated, not not_qualified", async () => {
    const student = await person("Old", 2018);
    expect((await graduate(student.id, { graduationYear: 2025 })).body.error.code).toBe("already_graduated");
  });

  it("keeps the year's bounds", async () => {
    const student = await person("Bounds");
    expect((await graduate(student.id, { graduationYear: 1989, override: true, overrideReason: "Test exception, see ticket" })).status).toBe(400);
  });
});

describe("What no longer graduates anyone", () => {
  it("the bulk route is gone", async () => {
    const id = await seasonOf("COMPLETED", false);
    const student = await person("Bulk");
    await finished(id, student.id, "PASSED");
    const res = await request(app)
      .post(`/api/v1/seasons/${id}/graduate`)
      .set(as(ctx.superToken))
      .send({ userIds: [student.id], graduationYear: 2025 });
    expect(res.status).toBe(404);
    expect(await yearOf(student.id)).toBeNull();
  });

  it("the preflight backfill fills in results and graduates nobody, even on a graduating season", async () => {
    const id = await seasonOf("COMPLETED", true);
    const blank = await person("Blank");
    const stranded = await person("Stranded");
    await finished(id, blank.id, null);
    await enrol(id, stranded.id);
    const done = await backfillResults({ seasonIds: [id] });
    expect(done).toEqual({ markedPassed: 1, completedStale: 1 });
    expect(await rowOf(id, blank.id)).toMatchObject({ result: "PASSED" });
    expect(await rowOf(id, stranded.id)).toMatchObject({ result: "PASSED" });
    expect(await yearOf(blank.id)).toBeNull();
    expect(await yearOf(stranded.id)).toBeNull();
  });
});

describe("Results read", () => {
  it("says who is already an alumnus", async () => {
    const id = await seasonOf("COMPLETED", true);
    const alumnus = await person("Aa Alumnus", 2020);
    const student = await person("Bb Student");
    await finished(id, alumnus.id, "PASSED");
    await finished(id, student.id, "NOT_PASSED");
    const res = await request(app).get(`/api/v1/seasons/${id}/results`).set(as(ctx.superToken));
    const flags = Object.fromEntries((res.body.data.results as { userId: number; isAlumnus: boolean }[]).map((r) => [r.userId, r.isAlumnus]));
    expect(flags).toEqual({ [alumnus.id]: true, [student.id]: false });
  });
});

