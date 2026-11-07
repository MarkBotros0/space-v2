// Community model, Build 2, Task 14: students graduate by passing a graduating season.
import request from "supertest";

import { backfillResults } from "../../../scripts/community-preflight";
import { db } from "../../db/client";
import { loadScopes } from "../../lib/auth/scopes";
import { signAccessToken } from "../../lib/auth/tokens";
import { graduationYearFor } from "../../lib/org-time";
import { PASSWORD, createTestSeason, createTestUser } from "./fixtures";
import { adminTokenOf, app, as, ctx, person, rowOf, seedEnrollmentFixtures, stamp, teardownEnrollmentFixtures } from "./season-enrollments-setup";

jest.setTimeout(180000);

beforeAll(seedEnrollmentFixtures);
afterAll(teardownEnrollmentFixtures);

const THIS_YEAR = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Cairo", year: "numeric" }).format(new Date()));

const seasonOf = async (status: "DRAFT" | "ACTIVE" | "COMPLETED" | "ARCHIVED", graduatesOnPass: boolean, endDate?: Date) => {
  const row = await createTestSeason({ status });
  await db.season.update({ where: { id: row.id }, data: { graduatesOnPass, ...(endDate ? { endDate } : {}) } });
  return row.id;
};
const enrol = (seasonId: number, studentUserId: number, status: "ACTIVE" | "WITHDRAWN" = "ACTIVE") =>
  db.seasonEnrollment.create({ data: { seasonId, studentUserId, status } });
const finished = (seasonId: number, studentUserId: number, result: "PASSED" | "NOT_PASSED" | null) =>
  db.seasonEnrollment.create({
    data: { seasonId, studentUserId, status: "COMPLETED", result, completedAt: new Date(Date.UTC(2026, 5, 1)) },
  });
const yearOf = async (id: number) =>
  (await db.user.findUniqueOrThrow({ where: { id }, select: { graduationYear: true } })).graduationYear;
const end = (seasonId: number, notPassed: { userId: number; reason: string | null }[] = [], token = ctx.superToken) =>
  request(app).post(`/api/v1/seasons/${seasonId}/end`).set(as(token)).send({ notPassed });
const correct = (seasonId: number, userId: number, result: "PASSED" | "NOT_PASSED") =>
  request(app).patch(`/api/v1/seasons/${seasonId}/results/${userId}`).set(as(ctx.superToken)).send({ result, reason: null });
const graduate = (userId: number, body: object, token = ctx.superToken) =>
  request(app).post(`/api/v1/students/${userId}/graduate`).set(as(token)).send(body);
const nextSecond = () => new Promise((resolve) => setTimeout(resolve, 1100));
/** Minted, not signed in: the login limiter would throttle a fixture per test. */
const mint = async (userId: number) => (await signAccessToken({ userId, ...(await loadScopes(userId)) })).token;
const auditLines = async (run: () => Promise<unknown>) => {
  const info = jest.spyOn(console, "info").mockImplementation(() => undefined);
  await run();
  const lines = info.mock.calls.map((c) => String(c[0]));
  info.mockRestore();
  return lines;
};

describe("graduationYearFor", () => {
  const now = new Date("2026-11-07T12:00:00.000Z");
  it("takes the end year of a season that ended in an earlier year", () => {
    expect(graduationYearFor(new Date("2024-06-30T00:00:00.000Z"), now)).toBe(2024);
  });
  it("takes the shared year when the season ends this year", () => {
    expect(graduationYearFor(new Date("2026-06-30T00:00:00.000Z"), now)).toBe(2026);
  });
  it("takes the current year when the end date is still in a later year", () => {
    expect(graduationYearFor(new Date("2099-12-31T00:00:00.000Z"), now)).toBe(2026);
  });
  it("reads both years on the organisation's clock, not UTC", () => {
    // 22:30Z on New Year's Eve is already next year in Cairo.
    const instant = new Date("2026-12-31T22:30:00.000Z");
    expect(graduationYearFor(instant, new Date("2028-01-01T00:00:00.000Z"))).toBe(2027);
    expect(graduationYearFor(new Date("2099-01-01T00:00:00.000Z"), instant)).toBe(2027);
  });
});

describe("End of a graduating season", () => {
  it("graduates who passed, and no one else", async () => {
    const seasonId = await seasonOf("ACTIVE", true, new Date("2025-06-30T00:00:00.000Z"));
    const passed = await person("Passed");
    const failed = await person("Failed");
    const dropped = await person("Dropped");
    const alumnus = await person("Already", 2019);
    await enrol(seasonId, passed.id);
    await enrol(seasonId, failed.id);
    await enrol(seasonId, dropped.id, "WITHDRAWN");
    await enrol(seasonId, alumnus.id);

    const res = await end(seasonId, [{ userId: failed.id, reason: null }]);

    expect(res.status).toBe(200);
    expect(res.body.data.graduated).toBe(1);
    expect(await yearOf(passed.id)).toBe(2025);
    expect(await yearOf(failed.id)).toBeNull();
    expect(await yearOf(dropped.id)).toBeNull();
    expect(await yearOf(alumnus.id)).toBe(2019);
    expect(await rowOf(seasonId, passed.id)).toMatchObject({ status: "COMPLETED", result: "PASSED" });
  });

  it("uses the current year when the end date is later than now", async () => {
    const seasonId = await seasonOf("ACTIVE", true);
    const student = await person("Early");
    await enrol(seasonId, student.id);
    expect((await end(seasonId)).body.data.graduated).toBe(1);
    expect(await yearOf(student.id)).toBe(THIS_YEAR);
  });

  it("closes a graduate's seat in another season with no result, as graduating anyone does", async () => {
    const seasonId = await seasonOf("ACTIVE", true);
    const draft = await seasonOf("DRAFT", false);
    const student = await person("Held");
    await enrol(seasonId, student.id);
    await enrol(draft, student.id);
    expect((await end(seasonId)).status).toBe(200);
    expect(await rowOf(draft, student.id)).toMatchObject({ status: "COMPLETED", result: null });
  });

  it("ends the graduate's session; the next refresh reads alumni", async () => {
    const seasonId = await seasonOf("ACTIVE", true);
    const student = await createTestUser("gs-refresh", "STUDENT");
    await enrol(seasonId, student.id);
    const session = await request(app).post("/api/v1/auth/login").send({ email: student.email, password: PASSWORD });
    const { accessToken, refreshToken } = session.body.data as { accessToken: string; refreshToken: string };
    const before = await stamp(student.id);
    await nextSecond();

    expect((await end(seasonId)).status).toBe(200);

    expect((await stamp(student.id))?.getTime()).not.toBe(before?.getTime());
    expect((await request(app).get("/api/v1/me").set(as(accessToken))).status).toBe(401);
    const rotated = await request(app).post("/api/v1/auth/refresh").send({ refreshToken });
    expect(rotated.status).toBe(200);
    const me = await request(app).get("/api/v1/me").set(as(rotated.body.data.accessToken));
    expect(me.status).toBe(200);
    expect(me.body.data.scopes.graduationYear).toBe(THIS_YEAR);
  });

  it("a season admin's End graduates people too, audited person by person", async () => {
    const seasonId = await seasonOf("ACTIVE", true);
    const student = await person("ByAdmin");
    await enrol(seasonId, student.id);
    const token = await adminTokenOf(seasonId);
    const lines = await auditLines(async () => {
      const res = await end(seasonId, [], token);
      expect(res.body.data.graduated).toBe(1);
    });
    expect(await yearOf(student.id)).toBe(THIS_YEAR);
    expect(lines.some((l) => l.startsWith("[audit] student.graduate") && l.includes(`subject=${student.id} season=${seasonId}`))).toBe(true);
  });

  it("an ordinary season graduates nobody", async () => {
    const seasonId = await seasonOf("ACTIVE", false);
    const student = await person("Ordinary");
    await enrol(seasonId, student.id);
    const res = await end(seasonId);
    expect(res.status).toBe(200);
    expect(res.body.data.graduated).toBe(0);
    expect(await yearOf(student.id)).toBeNull();
  });

  it("the end check says whether the season graduates", async () => {
    const yes = await seasonOf("ACTIVE", true);
    const no = await seasonOf("ACTIVE", false);
    const read = (id: number) => request(app).get(`/api/v1/seasons/${id}/end-check`).set(as(ctx.superToken));
    expect((await read(yes)).body.data.graduatesOnPass).toBe(true);
    expect((await read(no)).body.data.graduatesOnPass).toBe(false);
  });
});

describe("Correcting a result", () => {
  it("to Passed on a graduating season graduates them then, with fresh claims", async () => {
    const seasonId = await seasonOf("COMPLETED", true, new Date("2025-06-30T00:00:00.000Z"));
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

  it("to Passed for someone already an alumnus keeps their year", async () => {
    const seasonId = await seasonOf("ARCHIVED", true, new Date("2025-06-30T00:00:00.000Z"));
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
      const res = await graduate(student.id, { graduationYear: 2025, override: true });
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
      expect((await graduate(student.id, { graduationYear: 2025, override: true })).status).toBe(200);
    });
    expect(await yearOf(student.id)).toBe(2025);
    expect(lines).toContain(`[audit] student.graduate actor=${ctx.superId} subject=${student.id}`);
  });

  it("a non-super is refused, override or not", async () => {
    const student = await person("NotYours");
    const id = await seasonOf("ACTIVE", false);
    await enrol(id, student.id);
    const token = await adminTokenOf(id);
    expect((await graduate(student.id, { graduationYear: 2025, override: true }, token)).status).toBe(403);
    expect(await yearOf(student.id)).toBeNull();
  });

  it("an alumnus is already_graduated, not not_qualified", async () => {
    const student = await person("Old", 2018);
    expect((await graduate(student.id, { graduationYear: 2025 })).body.error.code).toBe("already_graduated");
  });

  it("keeps the year's bounds", async () => {
    const student = await person("Bounds");
    expect((await graduate(student.id, { graduationYear: 1989, override: true })).status).toBe(400);
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

