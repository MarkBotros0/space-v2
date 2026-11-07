// PATCH /users can't graduate or un-graduate a student: that is Graduate's, with
// its gate, audit line and enrolment completion. Correcting a year it can.
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();
let superToken: string;

const patch = (id: number, body: object) =>
  request(app).patch(`/api/v1/users/${id}`).set("authorization", `Bearer ${superToken}`).send(body);
const studentWithYear = async (label: string, graduationYear: number | null) => {
  const u = await createTestUser(label, "STUDENT");
  await db.user.update({ where: { id: u.id }, data: { graduationYear } });
  return u;
};
const stored = (id: number) =>
  db.user.findUniqueOrThrow({
    where: { id },
    select: { role: true, graduationYear: true, sessionsValidFrom: true },
  });
const auditLines = async (run: () => Promise<unknown>) => {
  const info = jest.spyOn(console, "info").mockImplementation(() => undefined);
  await run();
  const lines = info.mock.calls.map((c) => String(c[0]));
  info.mockRestore();
  return lines;
};

beforeAll(async () => {
  await cleanupTestData();
  superToken = await login(app, (await createTestUser("gy-super", "SUPER")).email);
});
afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("a stored STUDENT's graduation year on PATCH /users", () => {
  it("refuses none to a year: use Graduate", async () => {
    const u = await studentWithYear("gy-none-year", null);
    const season = await createTestSeason();
    await db.seasonEnrollment.create({ data: { seasonId: season.id, studentUserId: u.id, status: "ACTIVE" } });
    const res = await patch(u.id, { name: "Test Name", role: "STUDENT", graduationYear: 2026 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("use_graduate");
    expect(res.body.error.message).toMatch(/Graduate/);
    expect((await stored(u.id)).graduationYear).toBeNull();
  });

  it("refuses a year to none: alumni status doesn't undo here", async () => {
    const u = await studentWithYear("gy-year-none", 2020);
    const res = await patch(u.id, { name: "Test Name", role: "STUDENT", graduationYear: null });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("use_graduate");
    expect((await stored(u.id)).graduationYear).toBe(2020);
  });

  it("allows one year to another, audited and marked stale, keeping the session", async () => {
    const u = await studentWithYear("gy-typo", 2020);
    let res!: request.Response;
    const lines = await auditLines(async () => {
      res = await patch(u.id, { name: "Test Name", role: "STUDENT", graduationYear: 2021 });
    });
    expect(res.status).toBe(200);
    const row = await stored(u.id);
    expect(row.graduationYear).toBe(2021);
    expect(row.sessionsValidFrom).not.toBeNull();
    expect(lines.some((l) => l.includes("user.graduation_year_change"))).toBe(true);
  });

  it("a rename with the year unchanged is no year change", async () => {
    const u = await studentWithYear("gy-rename", 2020);
    let res!: request.Response;
    const lines = await auditLines(async () => {
      res = await patch(u.id, { name: "New Name", role: "STUDENT", graduationYear: 2020 });
    });
    expect(res.status).toBe(200);
    expect((await stored(u.id)).sessionsValidFrom).toBeNull();
    expect(lines.some((l) => l.includes("user.graduation_year_change"))).toBe(false);
  });

  it("a plain student's rename stays allowed", async () => {
    const u = await studentWithYear("gy-plain", null);
    expect((await patch(u.id, { name: "New Name", role: "STUDENT", graduationYear: null })).status).toBe(200);
  });

  it("corrects the year of an alumnus who serves, whose form sends no role", async () => {
    const u = await studentWithYear("gy-serving", 2015);
    const season = await createTestSeason();
    await db.seasonAdmin.create({ data: { seasonId: season.id, userId: u.id } });
    expect((await patch(u.id, { name: "Test Name", graduationYear: 2016 })).status).toBe(200);
    expect((await stored(u.id)).graduationYear).toBe(2016);
  });

  it("still lets a student become a MENTOR, with the year that role needs", async () => {
    const u = await studentWithYear("gy-mentor", null);
    const res = await patch(u.id, { name: "Test Name", role: "MENTOR", graduationYear: 2015 });
    expect(res.status).toBe(200);
    expect(await stored(u.id)).toMatchObject({ role: "MENTOR", graduationYear: 2015 });
  });
});

describe("other stored roles", () => {
  it("a MENTOR's year changes as before", async () => {
    const u = await createTestUser("gy-other-mentor", "MENTOR");
    await db.user.update({ where: { id: u.id }, data: { graduationYear: 2010 } });
    const res = await patch(u.id, { name: "Test Name", role: "MENTOR", graduationYear: 2011 });
    expect(res.status).toBe(200);
    expect((await stored(u.id)).graduationYear).toBe(2011);
  });

  it("a SUPER can go from no year to a year", async () => {
    const u = await createTestUser("gy-other-super", "SUPER");
    await db.user.update({ where: { id: u.id }, data: { graduationYear: null } });
    const res = await patch(u.id, { name: "Test Name", role: "SUPER", graduationYear: 2012 });
    expect(res.status).toBe(200);
    expect((await stored(u.id)).graduationYear).toBe(2012);
  });
});
