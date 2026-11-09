// Community model, Build 2, Task 4: required program, standing, and
// GET /seasons/:id/people-candidates. The pure rules are in shared/standing.test.ts.
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login, testEmail, testSeasonCode } from "./fixtures";

jest.setTimeout(120000);

const app = createApp();
let superToken: string;
let n = 0;

type Status = "DRAFT" | "ACTIVE" | "COMPLETED" | "ARCHIVED";

const as = (token: string) => ({ authorization: `Bearer ${token}` });

const person = async (name: string, graduationYear: number | null = null) => {
  const user = await createTestUser(`pc-${++n}`, "STUDENT");
  await db.user.update({ where: { id: user.id }, data: { name, graduationYear } });
  return user;
};
const season = async (status: Status, program: string, year: number, requiredProgram: string | null = null) => {
  const row = await createTestSeason({ status });
  await db.season.update({
    where: { id: row.id },
    data: {
      title: `${program} ${year}`,
      program,
      year,
      requiredProgram,
      startDate: new Date(Date.UTC(year, 0, 1)),
      endDate: new Date(Date.UTC(year, 5, 1)),
    },
  });
  return row.id;
};
const finished = (
  seasonId: number,
  studentUserId: number,
  result: "PASSED" | "NOT_PASSED" | null,
  status: "COMPLETED" | "WITHDRAWN" = "COMPLETED",
  enrolledAt = new Date(Date.UTC(2026, 0, 1)),
) =>
  db.seasonEnrollment.create({
    data: { seasonId, studentUserId, status, result, enrolledAt, completedAt: new Date(Date.UTC(2026, 5, 1)) },
  });
const candidates = (seasonId: number, token = superToken) =>
  request(app).get(`/api/v1/seasons/${seasonId}/people-candidates`).set(as(token));
type Row = {
  id: number;
  name: string;
  pool: string;
  availability: string;
  reason: string | null;
  selectable: boolean;
  overridable: boolean;
  last: { seasonTitle: string; outcome: string; attendancePct: number | null } | null;
};
const rowOf = (res: request.Response, id: number) => (res.body.data.people as Row[]).find((p) => p.id === id)!;

beforeAll(async () => {
  await cleanupTestData();
  superToken = await login(app, (await createTestUser("pc-super", "SUPER")).email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

const wide = async (status: Status, year: number) => {
  const id = await season(status, "COMM", year);
  await db.season.update({ where: { id }, data: { isCommunityWide: true } });
  return id;
};

describe("community-wide seasons: the pool", () => {
  it("lists alumni and non-alumni with their pool, never Super or Mentor; a regular season lists no alumni", async () => {
    const target = await wide("DRAFT", 2040);
    const regular = await season("DRAFT", "LEAD", 2041);
    const student = await person("Pool Student");
    const alum = await person("Pool Alum", 2020);
    const mentor = await createTestUser("pc-mentor", "MENTOR");
    const sup = await createTestUser("pc-super2", "SUPER");
    const gbv = await season("COMPLETED", "GBV", 2026);
    await finished(gbv, alum.id, "PASSED");

    const res = await candidates(target);
    expect(res.body.data.season.isCommunityWide).toBe(true);
    expect(rowOf(res, student.id)).toMatchObject({ pool: "student", availability: "available" });
    expect(rowOf(res, alum.id)).toMatchObject({
      pool: "alumni",
      availability: "available",
      selectable: true,
      last: { seasonTitle: "GBV 2026", outcome: "PASSED" },
    });
    expect(rowOf(res, mentor.id)).toBeUndefined();
    expect(rowOf(res, sup.id)).toBeUndefined();

    const reg = await candidates(regular);
    expect(reg.body.data.season.isCommunityWide).toBe(false);
    expect(rowOf(reg, alum.id)).toBeUndefined();
    expect(rowOf(reg, student.id).pool).toBe("student");
  });

  it("marks an alumnus serving elsewhere or in this season in_role; already passed stays already_passed", async () => {
    const draft = await wide("DRAFT", 2042);
    const active = await wide("ACTIVE", 2043);
    const elsewhere = await season("ACTIVE", "GBV", 2042);
    const away = await person("Away Alum", 2019);
    const here = await person("Here Alum", 2018);
    const passed = await person("Passed Alum", 2017);
    await db.seasonAdmin.create({ data: { seasonId: elsewhere, userId: away.id } });
    await db.seasonAdmin.create({ data: { seasonId: draft, userId: here.id } });
    const hereActive = await person("Active Alum", 2016);
    await db.seasonAdmin.create({ data: { seasonId: active, userId: hereActive.id } });
    await finished(await season("COMPLETED", "COMM", 2039), passed.id, "PASSED");

    const onDraft = await candidates(draft);
    expect(rowOf(onDraft, away.id)).toMatchObject({ availability: "in_role", selectable: true, pool: "alumni" });
    expect(rowOf(onDraft, here.id)).toMatchObject({
      availability: "in_role",
      reason: "Here Alum is serving in this season.",
      selectable: true,
    });
    expect(rowOf(onDraft, passed.id)).toMatchObject({ availability: "already_passed", selectable: true });
    const onActive = await candidates(active);
    expect(rowOf(onActive, hereActive.id)).toMatchObject({ availability: "in_role", selectable: false });
    expect(rowOf(onActive, away.id)).toMatchObject({ availability: "in_role", selectable: false });
  });

  it("lists an alumnus who did not pass a community-wide season as available in a later one (no requirement)", async () => {
    const earlier = await wide("COMPLETED", 2037);
    const later = await wide("DRAFT", 2038);
    const failed = await person("Failed Alum", 2018);
    await finished(earlier, failed.id, "NOT_PASSED");

    const res = await candidates(later);
    expect(res.body.data.season.requiredProgram).toBeNull();
    expect(rowOf(res, failed.id)).toMatchObject({
      pool: "alumni",
      availability: "available",
      selectable: true,
      last: { seasonTitle: "COMM 2037", outcome: "NOT_PASSED" },
    });
  });

  it("enrols 200 people, half alumni, into a community-wide draft in one batched call", async () => {
    const target = await wide("DRAFT", 2044);
    const emails = Array.from({ length: 200 }, (_, i) => testEmail(`bulk${i}`));
    await db.user.createMany({
      data: emails.map((email, i) => ({
        email,
        name: `Bulk ${i}`,
        role: "STUDENT" as const,
        graduationYear: i % 2 ? 2020 : null,
      })),
    });
    const ids = (await db.user.findMany({ where: { email: { in: emails } }, select: { id: true } })).map((u) => u.id);
    expect(ids).toHaveLength(200);

    const started = Date.now();
    const res = await request(app)
      .post(`/api/v1/seasons/${target}/enrollments`)
      .set(as(superToken))
      .send({ userIds: ids });
    const ms = Date.now() - started;
    expect(res.status).toBe(201);
    expect(await db.seasonEnrollment.count({ where: { seasonId: target } })).toBe(200);
    expect(ms).toBeLessThan(30000);
  });
});

describe("requiredProgram on a season", () => {
  const body = (over: object = {}) => ({
    code: testSeasonCode(),
    program: "LEAD",
    year: 2027,
    startDate: "2027-01-01T00:00:00Z",
    endDate: "2027-06-01T00:00:00Z",
    status: "DRAFT",
    ...over,
  });

  it("is set on create and changed by SUPER while the season is a draft", async () => {
    const created = await request(app)
      .post("/api/v1/seasons")
      .set(as(superToken))
      .send(body({ requiredProgram: "GBV" }));
    expect(created.status).toBe(201);
    const id = created.body.data.id as number;
    expect((await db.season.findUniqueOrThrow({ where: { id } })).requiredProgram).toBe("GBV");

    const code = (await db.season.findUniqueOrThrow({ where: { id } })).code;
    const patch = (over: object) =>
      request(app)
        .patch(`/api/v1/seasons/${id}`)
        .set(as(superToken))
        .send(body({ code, ...over }));
    const changed = await patch({ requiredProgram: "ABC" });
    expect(changed.status).toBe(200);
    expect((await db.season.findUniqueOrThrow({ where: { id } })).requiredProgram).toBe("ABC");

    const omitted = await patch({});
    expect(omitted.status).toBe(200);
    expect((await db.season.findUniqueOrThrow({ where: { id } })).requiredProgram).toBe("ABC");

    const cleared = await patch({ requiredProgram: null });
    expect(cleared.status).toBe(200);
    expect((await db.season.findUniqueOrThrow({ where: { id } })).requiredProgram).toBeNull();
  });

  it("refuses a season requiring its own program, on create and on a program change", async () => {
    const own = await request(app)
      .post("/api/v1/seasons")
      .set(as(superToken))
      .send(body({ requiredProgram: "LEAD" }));
    expect(own.status).toBe(400);

    const id = await season("DRAFT", "GBV", 2030, "LEAD");
    const code = (await db.season.findUniqueOrThrow({ where: { id } })).code;
    const clash = await request(app)
      .patch(`/api/v1/seasons/${id}`)
      .set(as(superToken))
      .send(body({ code, program: "LEAD", year: 2030 }));
    expect(clash.status).toBe(400);
  });

  it("refuses a change on a season that has started, with season_not_draft, but accepts the same value", async () => {
    const id = await season("ACTIVE", "LEAD", 2031, "GBV");
    const code = (await db.season.findUniqueOrThrow({ where: { id } })).code;
    const change = await request(app)
      .patch(`/api/v1/seasons/${id}`)
      .set(as(superToken))
      .send(body({ code, year: 2031, status: "ACTIVE", requiredProgram: "ABC" }));
    expect(change.status).toBe(409);
    expect(change.body.error.code).toBe("season_not_draft");
    expect((await db.season.findUniqueOrThrow({ where: { id } })).requiredProgram).toBe("GBV");

    const same = await request(app)
      .patch(`/api/v1/seasons/${id}`)
      .set(as(superToken))
      .send(body({ code, year: 2031, status: "ACTIVE", requiredProgram: "GBV" }));
    expect(same.status).toBe(200);
  });

  it("is not accepted from a season admin", async () => {
    const id = await season("DRAFT", "LEAD", 2032);
    const admin = await createTestUser("pc-admin2", "ADMIN");
    await db.seasonAdmin.create({ data: { seasonId: id, userId: admin.id } });
    const token = await login(app, admin.email);
    const res = await request(app).patch(`/api/v1/seasons/${id}`).set(as(token)).send({ requiredProgram: "GBV" });
    expect(res.status).toBe(403);
    expect((await db.season.findUniqueOrThrow({ where: { id } })).requiredProgram).toBeNull();
  });
});
