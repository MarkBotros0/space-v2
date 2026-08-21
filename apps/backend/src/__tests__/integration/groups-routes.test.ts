import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

// 60s, not the Jest default: the shared Neon staging database autosuspends, so
// the first query after idle costs ~18s and this suite's beforeAll performs
// several sequential writes.
jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let groupAId: number;
let groupBId: number;
let superToken: string;
let leaderToken: string;
let studentToken: string;
let outsiderToken: string;

beforeAll(async () => {
  await cleanupTestData();

  const season = await createTestSeason();
  seasonId = season.id;

  const superUser = await createTestUser("super", "SUPER");
  const leader = await createTestUser("leader", "LEADER");
  const student = await createTestUser("student", "STUDENT");
  const outsider = await createTestUser("outsider", "STUDENT");

  const groupA = await db.group.create({
    data: {
      seasonId,
      name: "Group A",
      description: "First group",
      leaders: { create: { userId: leader.id } },
      students: { create: { studentUserId: student.id } },
    },
    select: { id: true },
  });
  groupAId = groupA.id;

  const groupB = await db.group.create({
    data: { seasonId, name: "Group B" },
    select: { id: true },
  });
  groupBId = groupB.id;

  await db.seasonEnrollment.create({
    data: { seasonId, studentUserId: student.id, groupId: groupAId, status: "ACTIVE" },
  });

  superToken = await login(app, superUser.email);
  leaderToken = await login(app, leader.email);
  studentToken = await login(app, student.email);
  outsiderToken = await login(app, outsider.email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("GET /api/v1/seasons/:id/groups", () => {
  it("returns every group in the season for a SUPER", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/groups`)
      .set("authorization", `Bearer ${superToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.groups).toHaveLength(2);
    const a = res.body.data.groups.find((g: { id: number }) => g.id === groupAId);
    expect(a).toEqual({
      id: groupAId,
      name: "Group A",
      description: "First group",
      studentCount: 1,
      leaderNames: ["Test leader"],
      seasonCode: expect.any(String),
      seasonTitle: "Test Season",
    });
  });

  it("narrows the list to a student's own group", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/groups`)
      .set("authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.groups).toHaveLength(1);
    expect(res.body.data.groups[0].id).toBe(groupAId);
  });

  it("returns 403 for a user with no access to the season", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/groups`)
      .set("authorization", `Bearer ${outsiderToken}`);
    expect(res.status).toBe(403);
  });

  it("returns 400 for a non-numeric season id", async () => {
    const res = await request(app)
      .get("/api/v1/seasons/abc/groups")
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/groups/:id", () => {
  it("returns leaders and students for a SUPER", async () => {
    const res = await request(app)
      .get(`/api/v1/groups/${groupAId}`)
      .set("authorization", `Bearer ${superToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(groupAId);
    expect(res.body.data.seasonId).toBe(seasonId);
    expect(res.body.data.leaders).toEqual([
      { id: expect.any(Number), name: "Test leader", email: expect.any(String) },
    ]);
    expect(res.body.data.students).toEqual([
      { id: expect.any(Number), name: "Test student", email: expect.any(String) },
    ]);
  });

  it("lets the group's own leader read it", async () => {
    const res = await request(app)
      .get(`/api/v1/groups/${groupAId}`)
      .set("authorization", `Bearer ${leaderToken}`);
    expect(res.status).toBe(200);
  });

  it("refuses a leader on a group they do not lead", async () => {
    const res = await request(app)
      .get(`/api/v1/groups/${groupBId}`)
      .set("authorization", `Bearer ${leaderToken}`);
    expect(res.status).toBe(403);
  });

  it("lets a student read their own group but not another", async () => {
    const own = await request(app)
      .get(`/api/v1/groups/${groupAId}`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(own.status).toBe(200);

    const other = await request(app)
      .get(`/api/v1/groups/${groupBId}`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(other.status).toBe(403);
  });

  it("returns 400 for a non-numeric id and 403 for a missing one", async () => {
    const bad = await request(app)
      .get("/api/v1/groups/abc")
      .set("authorization", `Bearer ${superToken}`);
    expect(bad.status).toBe(400);

    // canAccessGroup short-circuits to true for SUPER before the group is read,
    // so a non-existent id reaches the query and 404s — matching v1.
    const missing = await request(app)
      .get("/api/v1/groups/2147483000")
      .set("authorization", `Bearer ${superToken}`);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("not_found");
  });
});
