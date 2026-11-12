import request from "supertest";

import { DEFAULT_PASS_CRITERIA, type PassCriteria } from "../../../../../packages/shared/src/index";
import { createApp } from "../../app";
import { db } from "../../db/client";
import { loadPassCriteria, savePassCriteria } from "../../lib/passing/criteria";
import { createAssignmentWithParts } from "./assignment-reads-setup";
import { bearer, cleanupTestData, createTestSeason, createTestUser, tokenFor } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

const criteria: PassCriteria = { weights: { attendance: 50, assignments: 25, quizzes: 25 }, passMark: 70 };

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

beforeEach(async () => {
  await cleanupTestData();
});

/** A season with something to count in all three numbers (unless told otherwise), and its staff. */
async function seedSeason(opts: { status?: "DRAFT" | "ACTIVE" | "COMPLETED"; quizzes?: boolean } = {}) {
  const seasonId = (await createTestSeason({ status: opts.status ?? "ACTIVE" })).id;
  await db.session.create({ data: { seasonId, title: "One", startsAt: new Date() } });
  await createAssignmentWithParts({ seasonId, title: "One" });
  if (opts.quizzes !== false) await db.quiz.create({ data: { seasonId, title: "Paper", kind: "PAPER" } });
  const [admin, superUser, leader, student] = await Promise.all([
    createTestUser("crit-admin", "ADMIN"),
    createTestUser("crit-super", "SUPER"),
    createTestUser("crit-leader", "LEADER"),
    createTestUser("crit-student", "STUDENT"),
  ]);
  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  await db.group.create({ data: { seasonId, name: "G", leaders: { create: { userId: leader.id } } } });
  await db.seasonEnrollment.create({ data: { seasonId, studentUserId: student.id, status: "ACTIVE" } });
  return {
    seasonId,
    tokens: {
      admin: await tokenFor(admin.id),
      super: await tokenFor(superUser.id),
      leader: await tokenFor(leader.id),
      student: await tokenFor(student.id),
    },
  };
}

function put(seasonId: number, token: string, body: object) {
  return request(app).put(`/api/v1/seasons/${seasonId}/pass-criteria`).set(bearer(token)).send(body);
}

describe("PUT /seasons/:id/pass-criteria", () => {
  it("admin or super saves; a leader gets 403", async () => {
    const s = await seedSeason();
    for (const token of [s.tokens.leader, s.tokens.student]) {
      expect((await put(s.seasonId, token, criteria)).status).toBe(403);
    }
    expect((await loadPassCriteria(s.seasonId)).isDefault).toBe(true);

    const byAdmin = await put(s.seasonId, s.tokens.admin, criteria);
    expect(byAdmin.status).toBe(200);
    expect(byAdmin.body.data).toEqual({ criteria });
    expect(await loadPassCriteria(s.seasonId)).toEqual({ criteria, isDefault: false });

    const next: PassCriteria = { weights: { attendance: 34, assignments: 33, quizzes: 33 }, passMark: 55 };
    const bySuper = await put(s.seasonId, s.tokens.super, next);
    expect(bySuper.status).toBe(200);
    const row = await db.season.findUniqueOrThrow({
      where: { id: s.seasonId },
      select: {
        passWeightAttendance: true,
        passWeightAssignments: true,
        passWeightQuizzes: true,
        passMark: true,
        passCriteriaSetAt: true,
      },
    });
    expect(row).toMatchObject({ passWeightAttendance: 34, passWeightAssignments: 33, passWeightQuizzes: 33 });
    expect(row.passMark).toBe(55);
    expect(row.passCriteriaSetAt).toBeInstanceOf(Date);
  });

  it("refuses weights that don't add up to 100", async () => {
    const s = await seedSeason();
    const res = await put(s.seasonId, s.tokens.admin, {
      weights: { attendance: 39, assignments: 30, quizzes: 30 },
      passMark: 60,
    });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain("The weights must add up to 100%.");
  });

  it("a draft or finished season answers 409 season_not_active", async () => {
    for (const status of ["DRAFT", "COMPLETED"] as const) {
      // A super asks: a finished season drops its staff from the token, and a draft may too.
      const s = await seedSeason({ status });
      const res = await put(s.seasonId, s.tokens.super, criteria);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("season_not_active");
    }
  });

  it("a weight on a season with no quizzes is 400 weight_on_empty", async () => {
    const s = await seedSeason({ quizzes: false });
    const res = await put(s.seasonId, s.tokens.admin, criteria);
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({
      code: "weight_on_empty",
      message: "Quizzes has nothing to count this season, so its weight must be 0.",
    });
    expect((await loadPassCriteria(s.seasonId)).isDefault).toBe(true);

    const noQuizWeight = { weights: { attendance: 60, assignments: 40, quizzes: 0 }, passMark: 60 };
    expect((await put(s.seasonId, s.tokens.admin, noQuizWeight)).status).toBe(200);
  });

  it("two saves at once both land, the later one kept", async () => {
    const s = await seedSeason();
    const other: PassCriteria = { weights: { attendance: 20, assignments: 40, quizzes: 40 }, passMark: 50 };
    const [a, b] = await Promise.all([
      put(s.seasonId, s.tokens.admin, criteria),
      put(s.seasonId, s.tokens.super, other),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect([criteria, other]).toContainEqual((await loadPassCriteria(s.seasonId)).criteria);
  });

  it("the database refuses half-set criteria", async () => {
    const s = await seedSeason();
    await expect(db.season.update({ where: { id: s.seasonId }, data: { passMark: 60 } })).rejects.toThrow(
      /Season_passCriteria_check/,
    );
    await expect(
      db.season.update({
        where: { id: s.seasonId },
        data: { passWeightAttendance: 50, passWeightAssignments: 30, passWeightQuizzes: 30, passMark: 60 },
      }),
    ).rejects.toThrow(/Season_passCriteria_check/);
  });
});

describe("loadPassCriteria", () => {
  it("defaults come from the last season that saved criteria, else 40/30/30 and 60", async () => {
    const fresh = await seedSeason();
    expect(await loadPassCriteria(fresh.seasonId)).toEqual({ criteria: DEFAULT_PASS_CRITERIA, isDefault: true });

    const older = await seedSeason();
    const newer = await seedSeason();
    const deleted = await seedSeason();
    const newerCriteria: PassCriteria = { weights: { attendance: 10, assignments: 45, quizzes: 45 }, passMark: 65 };
    await savePassCriteria(older.seasonId, criteria, new Date("2026-01-01T00:00:00Z"));
    await savePassCriteria(newer.seasonId, newerCriteria, new Date("2026-02-01T00:00:00Z"));
    await savePassCriteria(deleted.seasonId, DEFAULT_PASS_CRITERIA, new Date("2026-03-01T00:00:00Z"));
    await db.season.update({ where: { id: deleted.seasonId }, data: { deletedAt: new Date() } });

    expect(await loadPassCriteria(fresh.seasonId)).toEqual({ criteria: newerCriteria, isDefault: true });
    expect(await loadPassCriteria(older.seasonId)).toEqual({ criteria, isDefault: false });
  });
});
