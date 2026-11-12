import request from "supertest";

import { passingOutlookSchema } from "../../../../../packages/shared/src/index";
import { createApp } from "../../app";
import { db } from "../../db/client";
import { bearer, cleanupTestData } from "./fixtures";
import { SECRET_ESSAY, SECRET_PROMPT, seedPassingWorld, type PassingWorld } from "./season-passing-setup";

jest.setTimeout(60000);

const app = createApp();

let w: PassingWorld;

beforeAll(async () => {
  await cleanupTestData();
  w = await seedPassingWorld();
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

function outlook(token: string, seasonId = w.seasonId) {
  return request(app).get(`/api/v1/seasons/${seasonId}/passing`).set(bearer(token));
}

describe("GET /seasons/:id/passing", () => {
  it("outlook counts and orders below the mark first", async () => {
    const res = await outlook(w.tokens.admin);
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(passingOutlookSchema.safeParse(data).success).toBe(true);
    expect(data.criteria).toEqual({ weights: { attendance: 0, assignments: 50, quizzes: 50 }, passMark: 60 });
    expect(data.isDefault).toBe(false);
    expect(data.available).toEqual({ attendance: false, assignments: true, quizzes: true });
    expect(data.weightsIgnored).toEqual([]);
    expect(data.canEditCriteria).toBe(true);
    expect([data.onTrack, data.below]).toEqual([1, 2]);

    expect(data.rows.map((r: { userId: number }) => r.userId)).toEqual([
      w.users.short.id,
      w.users.middle.id,
      w.users.onTrack.id,
    ]);
    expect(data.rows[0]).toEqual({
      userId: w.users.short.id,
      name: "Test pass-short",
      groupName: "Group A",
      numbers: {
        attendance: { attended: 0, total: 0 },
        assignments: { submitted: 2, total: 2 },
        quizzes: { scored: 4, max: 100 },
      },
      score: 52,
      rescaled: false,
      pointsShort: 8,
      weakest: "quizzes",
    });
    expect(data.rows[1]).toMatchObject({ score: 55, pointsShort: 5, weakest: "assignments", groupName: "Group B" });
    expect(data.rows[2]).toMatchObject({ score: 85, pointsShort: null });

    // Nothing a student wrote or a quiz asks reaches the outlook.
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain(SECRET_PROMPT);
    expect(raw).not.toContain(SECRET_ESSAY);
  });

  it("a super sees the season and may edit the criteria", async () => {
    const res = await outlook(w.tokens.super);
    expect(res.status).toBe(200);
    expect(res.body.data.rows).toHaveLength(3);
    expect(res.body.data.canEditCriteria).toBe(true);
  });

  it("a leader sees only their groups and cannot edit criteria", async () => {
    const res = await outlook(w.tokens.leaderA);
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.canEditCriteria).toBe(false);
    expect(data.rows.map((r: { userId: number }) => r.userId)).toEqual([w.users.short.id, w.users.onTrack.id]);
    // Not the withdrawn student of the same group: they are on no roster.
    expect([data.onTrack, data.below]).toEqual([1, 1]);
  });

  it("a mentor or another season's admin gets 403", async () => {
    for (const token of [w.tokens.mentor, w.tokens.otherAdmin, w.tokens.student]) {
      expect((await outlook(token)).status).toBe(403);
    }
  });

  it("a weight on a number the season has nothing for counts as 0, and says so", async () => {
    // As a default inherited from another season can: 40 on attendance, and this season has no session.
    await db.season.update({
      where: { id: w.seasonId },
      data: { passWeightAttendance: 40, passWeightAssignments: 30, passWeightQuizzes: 30 },
    });
    try {
      const data = (await outlook(w.tokens.admin)).body.data;
      expect(data.weightsIgnored).toEqual(["attendance"]);
      // Scored over assignments and quizzes as the season's own 30 / 30, not re-scaled per student.
      const onTrack = data.rows.find((r: { userId: number }) => r.userId === w.users.onTrack.id);
      expect(onTrack).toMatchObject({ score: 85, rescaled: false });
    } finally {
      await db.season.update({
        where: { id: w.seasonId },
        data: { passWeightAttendance: 0, passWeightAssignments: 50, passWeightQuizzes: 50 },
      });
    }
  });

  it("a finished season's outlook cannot edit the criteria; a missing season is 404", async () => {
    await db.season.update({ where: { id: w.seasonId }, data: { status: "COMPLETED" } });
    try {
      const res = await outlook(w.tokens.super);
      expect(res.status).toBe(200);
      expect(res.body.data.canEditCriteria).toBe(false);
    } finally {
      await db.season.update({ where: { id: w.seasonId }, data: { status: "ACTIVE" } });
    }
    await db.season.update({ where: { id: w.otherSeasonId }, data: { deletedAt: new Date() } });
    expect((await outlook(w.tokens.super, w.otherSeasonId)).status).toBe(404);
  });
});
