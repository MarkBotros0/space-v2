import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData } from "./fixtures";
import { seedSeasonFixtures } from "./seasons-setup";

// 60s, not the Jest default: the shared Neon staging database autosuspends, so
// the first query after idle costs ~18s and this suite's beforeAll performs
// several sequential writes.
jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let otherSeasonId: number;
let superToken: string;
let adminToken: string;
let studentToken: string;
let outsiderToken: string;

beforeAll(async () => {
  ({ seasonId, otherSeasonId, superToken, adminToken, studentToken, outsiderToken } = await seedSeasonFixtures(app));
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("GET /api/v1/seasons", () => {
  it("requires authentication", async () => {
    const res = await request(app).get("/api/v1/seasons");
    expect(res.status).toBe(401);
  });

  it("returns both test seasons for a SUPER", async () => {
    const res = await request(app).get("/api/v1/seasons").set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.seasons.map((s: { id: number }) => s.id);
    expect(ids).toEqual(expect.arrayContaining([seasonId, otherSeasonId]));
  });

  it("returns only the scoped season for an ADMIN", async () => {
    const res = await request(app).get("/api/v1/seasons").set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.seasons.map((s: { id: number }) => s.id);
    expect(ids).toContain(seasonId);
    expect(ids).not.toContain(otherSeasonId);
  });

  it("returns only the enrolled season for a STUDENT", async () => {
    const res = await request(app).get("/api/v1/seasons").set("authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.seasons.map((s: { id: number }) => s.id);
    expect(ids).toContain(seasonId);
    expect(ids).not.toContain(otherSeasonId);
  });

  it("returns no test seasons for an unenrolled STUDENT", async () => {
    const res = await request(app).get("/api/v1/seasons").set("authorization", `Bearer ${outsiderToken}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.seasons.map((s: { id: number }) => s.id);
    expect(ids).not.toContain(seasonId);
    expect(ids).not.toContain(otherSeasonId);
  });
});

describe("GET /api/v1/seasons/:id", () => {
  it("counts the season's live assignments and every quiz, drafts too", async () => {
    await db.assignment.createMany({
      data: [
        { seasonId, title: "Live" },
        { seasonId, title: "Deleted", deletedAt: new Date() },
      ],
    });
    await db.quiz.createMany({
      data: [
        { seasonId, title: "Published", kind: "ONLINE", maxScore: 0, publishedAt: new Date() },
        { seasonId, title: "Draft", kind: "ONLINE", maxScore: 0 },
        { seasonId, title: "Paper", kind: "PAPER", maxScore: 10 },
      ],
    });
    const res = await request(app).get(`/api/v1/seasons/${seasonId}`).set("authorization", `Bearer ${superToken}`);
    expect(res.body.data).toMatchObject({ assignmentCount: 1, quizCount: 3 });
    await db.quiz.deleteMany({ where: { seasonId } });
    await db.assignment.deleteMany({ where: { seasonId } });
  });

  it("returns 400 for a non-numeric id", async () => {
    const res = await request(app).get("/api/v1/seasons/abc").set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
  });

  it("returns the season with counts and groups for a SUPER", async () => {
    const res = await request(app).get(`/api/v1/seasons/${seasonId}`).set("authorization", `Bearer ${superToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(seasonId);
    expect(res.body.data.program).toBe("TEST");
    expect(res.body.data.studentCount).toBe(1);
    expect(res.body.data.sessionCount).toBe(0);
    expect(res.body.data.groups).toHaveLength(1);
    expect(res.body.data.groups[0]).toEqual({
      id: expect.any(Number),
      name: "Test Group A",
      studentCount: 1,
      leaderNames: [],
    });
  });

  it("doesn't count a withdrawn student, and keeps counting a completed one", async () => {
    const read = async () => {
      const { data } = (
        await request(app).get(`/api/v1/seasons/${seasonId}`).set("authorization", `Bearer ${superToken}`)
      ).body;
      return [data.studentCount, data.groups[0].studentCount];
    };
    try {
      await db.seasonEnrollment.updateMany({ where: { seasonId }, data: { status: "WITHDRAWN" } });
      expect(await read()).toEqual([0, 0]);
      await db.seasonEnrollment.updateMany({ where: { seasonId }, data: { status: "COMPLETED" } });
      expect(await read()).toEqual([1, 1]);
    } finally {
      await db.seasonEnrollment.updateMany({ where: { seasonId }, data: { status: "ACTIVE" } });
    }
  });

  it("returns 403 for a student not enrolled in the season", async () => {
    const res = await request(app).get(`/api/v1/seasons/${seasonId}`).set("authorization", `Bearer ${outsiderToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
  });

  it("returns 403 when an ADMIN reaches outside their season scope", async () => {
    const res = await request(app).get(`/api/v1/seasons/${otherSeasonId}`).set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });

  it("returns 404 for a season id that does not exist", async () => {
    const res = await request(app).get("/api/v1/seasons/2147483000").set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });

  it("shows a student only their own group", async () => {
    // A second group the student does not belong to must not appear.
    await db.group.create({ data: { seasonId, name: "Test Group B" } });

    const res = await request(app).get(`/api/v1/seasons/${seasonId}`).set("authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.groups).toHaveLength(1);
    expect(res.body.data.groups[0].name).toBe("Test Group A");
  });
});
