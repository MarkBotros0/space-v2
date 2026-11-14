import request from "supertest";

import { db } from "../../db/client";
import { seasonResultsResponseSchema } from "../../../../../packages/shared/src/index";
import { bearer, cleanupTestData, createTestSeason, createTestUser, tokenFor } from "./fixtures";
import { CRITERIA, app, bodyFrom, endCheck, enrolmentOf, postEnd, seedEndWorld } from "./season-end-passing-setup";

// Season passing, Task 4: results after End, read and corrected by the season's admin or a super.
jest.setTimeout(90000);

const results = (seasonId: number, token: string) =>
  request(app).get(`/api/v1/seasons/${seasonId}/results`).set(bearer(token));
const correct = (seasonId: number, userId: number, token: string, result: "PASSED" | "NOT_PASSED") =>
  request(app)
    .patch(`/api/v1/seasons/${seasonId}/results/${userId}`)
    .set(bearer(token))
    .send({ result, reason: result === "NOT_PASSED" ? "Missed the retreat" : null });

beforeEach(async () => {
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("results after End", () => {
  it("the season's admin reads and corrects results after End", async () => {
    const w = await seedEndWorld();
    const check = await endCheck(w.seasonId, w.tokens.admin);
    const ended = await postEnd(
      w.seasonId,
      w.tokens.admin,
      bodyFrom(check, CRITERIA, { notPassed: [{ userId: w.users.low.id, reason: null }] }),
    );
    expect(ended.status).toBe(200);

    // A former admin now: End took their seat's grants, the SeasonAdmin row stays.
    const formerAdmin = await tokenFor(w.users.admin.id);
    const read = await results(w.seasonId, formerAdmin);
    expect(read.status).toBe(200);
    expect(seasonResultsResponseSchema.safeParse(read.body.data).success).toBe(true);
    expect(read.body.data.season).toMatchObject({ id: w.seasonId, graduatesOnPass: false });
    expect(read.body.data.criteria).toEqual(CRITERIA);
    const highRow = read.body.data.results.find((r: { userId: number }) => r.userId === w.users.high.id);
    expect(highRow).toMatchObject({
      result: "PASSED",
      passScore: 90,
      againstScore: false,
      setByName: "Test end-pass-admin",
      numbers: { assignments: { submitted: 2, total: 2 }, quizzes: { scored: 0.8, max: 1 } },
    });
    // What the screen shows is End's stored numbers.
    expect(highRow.figures).toEqual(highRow.numbers);
    expect(typeof highRow.setAt).toBe("string");

    // A leader of the season, and a stranger admin, are refused.
    const stranger = await createTestUser("results-stranger", "ADMIN");
    await db.seasonAdmin.create({ data: { seasonId: (await createTestSeason()).id, userId: stranger.id } });
    // Fresh tokens: End stamped the season staff's earlier sessions stale (401, not the 403 under test).
    for (const t of [await tokenFor(w.users.leader.id), await tokenFor(stranger.id)]) {
      expect((await results(w.seasonId, t)).status).toBe(403);
      expect((await correct(w.seasonId, w.users.high.id, t, "NOT_PASSED")).status).toBe(403);
    }

    const fixed = await correct(w.seasonId, w.users.high.id, formerAdmin, "NOT_PASSED");
    expect(fixed.status).toBe(200);
    const row = await enrolmentOf(w.seasonId, w.users.high.id);
    expect(Number(row.passScore)).toBe(90);
    expect(row).toMatchObject({ result: "NOT_PASSED", resultAgainstScore: true, resultSetById: w.users.admin.id });

    // A super's correction back to the score: no longer against it, set by the super.
    expect((await correct(w.seasonId, w.users.high.id, w.tokens.super, "PASSED")).status).toBe(200);
    const after = await results(w.seasonId, w.tokens.super);
    expect(after.body.data.results.find((r: { userId: number }) => r.userId === w.users.high.id)).toMatchObject({
      result: "PASSED",
      passScore: 90,
      againstScore: false,
      setByName: "Test end-pass-super",
    });
  });

  it("a season ended before this shows passScore null and criteria null", async () => {
    const seasonId = (await createTestSeason({ status: "COMPLETED" })).id;
    const [superUser, student] = await Promise.all([
      createTestUser("results-old-super", "SUPER"),
      createTestUser("results-old-student", "STUDENT"),
    ]);
    await db.seasonEnrollment.create({
      data: { seasonId, studentUserId: student.id, status: "COMPLETED", result: "PASSED", resultSetAt: new Date() },
    });
    const res = await results(seasonId, await tokenFor(superUser.id));
    expect(res.status).toBe(200);
    expect(res.body.data.criteria).toBeNull();
    expect(res.body.data.results).toEqual([
      expect.objectContaining({
        userId: student.id,
        result: "PASSED",
        passScore: null,
        numbers: null,
        // Read now, so the screen still shows all three (nothing held or set here).
        figures: {
          attendance: { attended: 0, total: 0 },
          assignments: { submitted: 0, total: 0 },
          quizzes: { scored: 0, max: 0 },
        },
        againstScore: false,
        setByName: null,
      }),
    ]);

    expect((await correct(seasonId, student.id, await tokenFor(superUser.id), "NOT_PASSED")).status).toBe(200);
    expect(await enrolmentOf(seasonId, student.id)).toMatchObject({
      result: "NOT_PASSED",
      passScore: null,
      resultAgainstScore: false,
      resultSetById: superUser.id,
    });
  });
});
