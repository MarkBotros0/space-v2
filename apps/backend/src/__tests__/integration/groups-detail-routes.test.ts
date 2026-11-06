import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData } from "./fixtures";
import { seedGroupFixtures } from "./groups-setup";

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
let seasonRowsToken: string;

beforeAll(async () => {
  ({ seasonId, groupAId, groupBId, superToken, leaderToken, studentToken, outsiderToken, seasonRowsToken } = await seedGroupFixtures(app));
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("GET /api/v1/groups", () => {
  it("returns a leader's own groups — the tab that had no endpoint", async () => {
    const res = await request(app)
      .get("/api/v1/groups")
      .set("authorization", `Bearer ${leaderToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.groups).toHaveLength(1);
    expect(res.body.data.groups[0]).toMatchObject({
      id: groupAId,
      name: "Group A",
      seasonId,
    });
  });

  it("returns a student's own group", async () => {
    const res = await request(app)
      .get("/api/v1/groups")
      .set("authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.groups.map((g: { id: number }) => g.id)).toEqual([groupAId]);
  });

  it("is empty for a student in no group, rather than an error", async () => {
    const res = await request(app)
      .get("/api/v1/groups")
      .set("authorization", `Bearer ${outsiderToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.groups).toEqual([]);
  });

  it("is empty for a SUPER, who is in no group", async () => {
    // Returning every group they could administer would make "my groups" mean
    // something different per role. They browse by season instead.
    const res = await request(app)
      .get("/api/v1/groups")
      .set("authorization", `Bearer ${superToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.groups).toEqual([]);
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

  it("withholds member emails from a student reading their own group", async () => {
    const res = await request(app)
      .get(`/api/v1/groups/${groupAId}`)
      .set("authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    // Names still come through — a student should see who is in their group.
    expect(res.body.data.students).toEqual([{ id: expect.any(Number), name: "Test student" }]);
    expect(res.body.data.leaders).toEqual([{ id: expect.any(Number), name: "Test leader" }]);
    // Belt and braces: no address anywhere in the payload, however nested.
    expect(JSON.stringify(res.body)).not.toContain("@jpc.test");
  });

  it("honours season rows on a stored STUDENT: the rows are the role", async () => {
    // Group B has a GroupLeader row naming this alumnus, and the season has a
    // SeasonAdmin row. Community model: they derive ADMIN, and lib/roles guards
    // who may be written into those rows.
    const group = await request(app)
      .get(`/api/v1/groups/${groupBId}`)
      .set("authorization", `Bearer ${seasonRowsToken}`);
    expect(group.status).toBe(200);

    const roster = await request(app)
      .get(`/api/v1/seasons/${seasonId}/groups`)
      .set("authorization", `Bearer ${seasonRowsToken}`);
    expect(roster.status).toBe(200);
    expect(roster.body.data.groups.length).toBeGreaterThan(0);
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
