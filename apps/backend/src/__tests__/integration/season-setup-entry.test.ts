// Community model, Build 2, Task 10: a season is created as a draft; its required
// program is shown to super and that season's staff; duplicate copies it.
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { bearer, cleanupTestData, createTestSeason, createTestUser, login, testSeasonCode } from "./fixtures";

jest.setTimeout(120000);

const app = createApp();

let superToken: string;
let adminToken: string;
let leaderToken: string;
let studentToken: string;
let outsiderAdminToken: string;
let seasonId: number;
let code: string;

const body = (over: object = {}) => ({
  code: testSeasonCode(),
  program: "LEAD",
  year: 2027,
  startDate: "2027-01-01T00:00:00Z",
  endDate: "2027-06-01T00:00:00Z",
  status: "DRAFT",
  ...over,
});

beforeAll(async () => {
  await cleanupTestData();
  const season = await createTestSeason({ status: "DRAFT" });
  seasonId = season.id;
  code = season.code;
  await db.season.update({ where: { id: seasonId }, data: { requiredProgram: "GBV" } });
  const sup = await createTestUser("se-super", "SUPER");
  const admin = await createTestUser("se-admin", "ADMIN");
  const outsider = await createTestUser("se-outsider", "ADMIN");
  const other = await createTestSeason({ status: "DRAFT" });
  const leader = await createTestUser("se-leader", "LEADER");
  const student = await createTestUser("se-student", "STUDENT");
  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  await db.seasonAdmin.create({ data: { seasonId: other.id, userId: outsider.id } });
  const group = await db.group.create({ data: { seasonId, name: "G" } });
  await db.groupLeader.create({ data: { groupId: group.id, userId: leader.id } });
  await db.seasonEnrollment.create({ data: { seasonId, studentUserId: student.id, status: "ACTIVE" } });
  superToken = await login(app, sup.email);
  adminToken = await login(app, admin.email);
  outsiderAdminToken = await login(app, outsider.email);
  leaderToken = await login(app, leader.email);
  studentToken = await login(app, student.email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("POST /seasons", () => {
  it.each(["ACTIVE", "COMPLETED", "ARCHIVED"])("refuses a new season created as %s", async (status) => {
    const res = await request(app).post("/api/v1/seasons").set(bearer(superToken)).send(body({ status }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
    expect(res.body.error.message).toMatch(/draft/i);
  });

  it("creates a draft", async () => {
    const res = await request(app).post("/api/v1/seasons").set(bearer(superToken)).send(body());
    expect(res.status).toBe(201);
  });
});

describe("requiredProgram on the season detail", () => {
  it.each([
    ["super", () => superToken],
    ["this season's admin", () => adminToken],
    ["this season's leader", () => leaderToken],
  ])("shows it to %s, by id and by code", async (_n, token) => {
    const byId = await request(app).get(`/api/v1/seasons/${seasonId}`).set(bearer(token()));
    expect(byId.status).toBe(200);
    expect(byId.body.data.requiredProgram).toBe("GBV");
    const byCode = await request(app).get(`/api/v1/seasons/by-code/${code}`).set(bearer(token()));
    expect(byCode.body.data.requiredProgram).toBe("GBV");
  });

  it("leaves it out for a student", async () => {
    const res = await request(app).get(`/api/v1/seasons/${seasonId}`).set(bearer(studentToken));
    expect(res.status).toBe(200);
    expect(res.body.data).not.toHaveProperty("requiredProgram");
  });

  it("does not open the season to an admin of another one", async () => {
    const res = await request(app).get(`/api/v1/seasons/${seasonId}`).set(bearer(outsiderAdminToken));
    expect(res.status).toBe(403);
  });

  it("is null for a season with none", async () => {
    const plain = await createTestSeason({ status: "DRAFT" });
    const res = await request(app).get(`/api/v1/seasons/${plain.id}`).set(bearer(superToken));
    expect(res.body.data.requiredProgram).toBeNull();
  });
});

describe("duplicate", () => {
  it("copies requiredProgram", async () => {
    const res = await request(app).post(`/api/v1/seasons/${seasonId}/duplicate`).set(bearer(superToken)).send({
      year: 2098,
      code: testSeasonCode(),
      startDate: "2098-01-01T00:00:00.000Z",
      endDate: "2098-06-01T00:00:00.000Z",
    });
    expect(res.status).toBe(201);
    const row = await db.season.findUniqueOrThrow({ where: { id: res.body.data.id } });
    expect(row.requiredProgram).toBe("GBV");
  });
});
