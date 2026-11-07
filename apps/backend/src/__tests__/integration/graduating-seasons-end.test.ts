// Community model, Build 2, Task 14: what ending a graduating season does, and what it was shown.
import request from "supertest";

import { db } from "../../db/client";
import { PASSWORD, createTestUser, reviewedOf } from "./fixtures";
import { THIS_YEAR, auditLines, end, enrol, nextSecond, seasonOf, yearOf } from "./graduating-seasons-setup";
import { adminTokenOf, app, as, ctx, person, rowOf, seedEnrollmentFixtures, stamp, teardownEnrollmentFixtures } from "./season-enrollments-setup";

jest.setTimeout(180000);

beforeAll(seedEnrollmentFixtures);
afterAll(teardownEnrollmentFixtures);

describe("End of a graduating season", () => {
  it("graduates who passed, and no one else", async () => {
    const seasonId = await seasonOf("ACTIVE", true, new Date("2026-06-30T00:00:00.000Z"), 2025);
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

  it.each([
    [2025, "2026-06-30T00:00:00.000Z"],
    [2026, "2027-06-30T00:00:00.000Z"],
    [2027, "2026-06-30T00:00:00.000Z"],
  ])("a %s season ending %s gives the class of the season's year", async (year, endDate) => {
    const seasonId = await seasonOf("ACTIVE", true, new Date(endDate), year);
    const student = await person(`Class${year}`);
    await enrol(seasonId, student.id);
    expect((await end(seasonId)).body.data.graduated).toBe(1);
    expect(await yearOf(student.id)).toBe(year);
  });

  it("closes a graduate's seat in another season with no result, as graduating anyone does", async () => {
    const seasonId = await seasonOf("ACTIVE", true);
    const other = await seasonOf("ACTIVE", false);
    const student = await person("Held");
    await enrol(seasonId, student.id);
    await enrol(other, student.id);
    expect((await end(seasonId)).status).toBe(200);
    expect(await rowOf(other, student.id)).toMatchObject({ status: "COMPLETED", result: null });
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

describe("End refuses a stale review, and changes nothing", () => {
  const ROSTER_CHANGED = { code: "season_unfinished", message: "The roster changed; check the season again." };
  const statusOf = async (id: number) =>
    (await db.season.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;

  it("a season marked graduating after the review opened", async () => {
    const seasonId = await seasonOf("ACTIVE", false);
    const student = await person("Unwarned");
    await enrol(seasonId, student.id);
    const reviewed = await reviewedOf(seasonId);
    await db.season.update({ where: { id: seasonId }, data: { graduatesOnPass: true } });

    const res = await end(seasonId, [], ctx.superToken, reviewed);

    expect(res.status).toBe(409);
    expect(res.body.error).toEqual(ROSTER_CHANGED);
    expect(await statusOf(seasonId)).toBe("ACTIVE");
    expect(await yearOf(student.id)).toBeNull();
    expect(await rowOf(seasonId, student.id)).toMatchObject({ status: "ACTIVE", result: null });
  });

  it("a season no longer graduating after the review opened", async () => {
    const seasonId = await seasonOf("ACTIVE", true);
    const student = await person("Promised");
    await enrol(seasonId, student.id);
    const reviewed = await reviewedOf(seasonId);
    await db.season.update({ where: { id: seasonId }, data: { graduatesOnPass: false } });

    const res = await end(seasonId, [], ctx.superToken, reviewed);

    expect(res.status).toBe(409);
    expect(res.body.error).toEqual(ROSTER_CHANGED);
    expect(await statusOf(seasonId)).toBe("ACTIVE");
  });

  it("a student seated after the review opened", async () => {
    const seasonId = await seasonOf("ACTIVE", true);
    const shown = await person("Shown");
    const late = await person("NeverShown");
    await enrol(seasonId, shown.id);
    const reviewed = await reviewedOf(seasonId);
    await enrol(seasonId, late.id);

    const res = await end(seasonId, [], ctx.superToken, reviewed);

    expect(res.status).toBe(409);
    expect(res.body.error).toEqual(ROSTER_CHANGED);
    expect(await statusOf(seasonId)).toBe("ACTIVE");
    expect(await yearOf(shown.id)).toBeNull();
    expect(await yearOf(late.id)).toBeNull();
  });

  it("a student dropped after the review opened", async () => {
    const seasonId = await seasonOf("ACTIVE", true);
    const stays = await person("Stays");
    const leaves = await person("Leaves");
    await enrol(seasonId, stays.id);
    await enrol(seasonId, leaves.id);
    const reviewed = await reviewedOf(seasonId);
    await db.seasonEnrollment.update({
      where: { studentUserId_seasonId: { studentUserId: leaves.id, seasonId } },
      data: { status: "WITHDRAWN" },
    });

    const res = await end(seasonId, [], ctx.superToken, reviewed);

    expect(res.status).toBe(409);
    expect(res.body.error).toEqual(ROSTER_CHANGED);
    expect(await statusOf(seasonId)).toBe("ACTIVE");
    expect(await yearOf(stays.id)).toBeNull();
  });
});

describe("End only graduates live students", () => {
  it("a soft-deleted account on an ACTIVE row doesn't graduate", async () => {
    const seasonId = await seasonOf("ACTIVE", true);
    const gone = await person("Gone");
    const passed = await person("Here");
    await enrol(seasonId, gone.id);
    await enrol(seasonId, passed.id);
    await db.user.update({ where: { id: gone.id }, data: { deletedAt: new Date() } });

    const res = await end(seasonId);

    expect(res.status).toBe(200);
    expect(res.body.data.graduated).toBe(1);
    expect(await yearOf(gone.id)).toBeNull();
    expect(await rowOf(seasonId, gone.id)).toMatchObject({ status: "COMPLETED", result: null });
    expect(await yearOf(passed.id)).toBe(THIS_YEAR);
  });

  it("someone whose role isn't STUDENT on an ACTIVE row doesn't graduate", async () => {
    const seasonId = await seasonOf("ACTIVE", true);
    const leader = await createTestUser("gs-leader", "LEADER");
    await enrol(seasonId, leader.id);

    const res = await end(seasonId);

    expect(res.status).toBe(200);
    expect(res.body.data.graduated).toBe(0);
    expect(await yearOf(leader.id)).toBeNull();
  });
});
