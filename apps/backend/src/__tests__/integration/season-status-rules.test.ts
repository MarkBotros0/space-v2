// I2: a season only finishes through End, and nothing enrols into a finished
// one. ACTIVE -> DRAFT -> COMPLETED used to leave enrolments ACTIVE in a
// COMPLETED season, with nothing able to fix them.
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login, testEmail } from "./fixtures";

jest.setTimeout(120000);

const app = createApp();
let superToken: string;

type Status = "DRAFT" | "ACTIVE" | "COMPLETED" | "ARCHIVED";

/** The full-body PATCH a Super's form sends. */
async function move(from: Status, to: Status) {
  const season = await createTestSeason({ status: from });
  const res = await request(app)
    .patch(`/api/v1/seasons/${season.id}`)
    .set("authorization", `Bearer ${superToken}`)
    .send({
      code: season.code,
      program: "TEST",
      year: 2099,
      status: to,
      startDate: "2099-01-01T00:00:00.000Z",
      endDate: "2099-12-31T00:00:00.000Z",
    });
  const after = await db.season.findUniqueOrThrow({ where: { id: season.id }, select: { status: true } });
  return { status: res.status, code: res.body.error?.code as string | undefined, now: after.status };
}

beforeAll(async () => {
  await cleanupTestData();
  superToken = await login(app, (await createTestUser("rules-super", "SUPER")).email);
});
afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("PATCH /seasons/:id status moves", () => {
  it.each<[Status, Status]>([
    ["DRAFT", "DRAFT"],
    ["ACTIVE", "ACTIVE"],
    ["COMPLETED", "COMPLETED"],
    ["ARCHIVED", "ARCHIVED"],
    ["COMPLETED", "ARCHIVED"],
    ["ARCHIVED", "COMPLETED"],
  ])("allows %s -> %s", async (from, to) => {
    expect(await move(from, to)).toEqual({ status: 200, code: undefined, now: to });
  });

  it.each<[Status, Status, string]>([
    ["ACTIVE", "DRAFT", "use_end_season"],
    ["ACTIVE", "COMPLETED", "use_end_season"],
    ["ACTIVE", "ARCHIVED", "use_end_season"],
    ["DRAFT", "ACTIVE", "use_start_season"],
    ["DRAFT", "COMPLETED", "invalid_status_change"],
    ["DRAFT", "ARCHIVED", "invalid_status_change"],
    ["COMPLETED", "ACTIVE", "season_finished"],
    ["COMPLETED", "DRAFT", "season_finished"],
    ["ARCHIVED", "ACTIVE", "season_finished"],
    ["ARCHIVED", "DRAFT", "season_finished"],
  ])("refuses %s -> %s with 409 %s and changes nothing", async (from, to, code) => {
    expect(await move(from, to)).toEqual({ status: 409, code, now: from });
  });
});

describe("enrolling into a finished season", () => {
  const importRow = (email: string) => ({
    rowNumber: 2,
    values: {
      name: "Late Import", email, university: null, faculty: null, universityGraduationYear: null,
      phone: null, dateOfBirth: null, notes: null,
    },
  });
  const commit = (seasonId: number, email: string) =>
    request(app)
      .post("/api/v1/imports/students/commit")
      .set("authorization", `Bearer ${superToken}`)
      .send({ mode: "season", seasonId, onExisting: "enroll", rows: [importRow(email)] });
  const create = (seasonId: number, email: string) =>
    request(app)
      .post("/api/v1/students")
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "Late Create", email, seasonId });

  it.each(["COMPLETED", "ARCHIVED"] as const)("the student import refuses a %s season", async (status) => {
    const season = await createTestSeason({ status });
    const email = testEmail(`rules-import-${status.toLowerCase()}`);
    const res = await commit(season.id, email);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("season_finished");
    expect(await db.user.findUnique({ where: { email } })).toBeNull();
  });

  it.each(["COMPLETED", "ARCHIVED"] as const)("creating a student refuses a %s season", async (status) => {
    const season = await createTestSeason({ status });
    const email = testEmail(`rules-create-${status.toLowerCase()}`);
    const res = await create(season.id, email);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("season_finished");
    expect(await db.user.findUnique({ where: { email } })).toBeNull();
  });

  it.each(["DRAFT", "ACTIVE"] as const)("both still enrol into a %s season", async (status) => {
    const season = await createTestSeason({ status });
    const a = testEmail(`rules-ok-a-${status.toLowerCase()}`);
    const b = testEmail(`rules-ok-b-${status.toLowerCase()}`);
    expect((await commit(season.id, a)).status).toBe(200);
    expect((await create(season.id, b)).status).toBe(201);
    expect(await db.seasonEnrollment.count({ where: { seasonId: season.id, status: "ACTIVE" } })).toBe(2);
  });
});
