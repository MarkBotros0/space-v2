import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData } from "./fixtures";
import { quizGradedCountFor, seedQuizFixtures } from "./quizzes-setup";

// Same reason as the submissions suite: the shared Neon staging Postgres
// autosuspends, and the first query after idling has been measured at ~18s.
jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let sessionId: number;
let ownStudentId: number;
let otherGroupStudentId: number;
let adminToken: string;
let otherAdminToken: string;
let leaderToken: string;
let studentToken: string;

beforeAll(async () => {
  ({ seasonId, sessionId, ownStudentId, otherGroupStudentId, adminToken, otherAdminToken, leaderToken, studentToken } =
    await seedQuizFixtures(app));
});

afterAll(async () => {
  await cleanupTestData();
});

/** See `quizGradedCountFor` in ./quizzes-setup. */
function quizGradedCount(): Promise<number> {
  return quizGradedCountFor(ownStudentId);
}

describe("PAPER grades", () => {
  let quizId: number;

  beforeEach(async () => {
    const quiz = await db.quiz.create({
      // A paper score notifies and shows once entered, with no release.
      data: { seasonId, sessionId, title: "Paper sheet", kind: "PAPER", maxScore: 20 },
      select: { id: true },
    });
    quizId = quiz.id;
  });

  it("returns a row per student in the caller's scope, ungraded ones included (R100)", async () => {
    const asAdmin = await request(app)
      .get(`/api/v1/quizzes/${quizId}/grades`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(asAdmin.status).toBe(200);
    expect(asAdmin.body.data.rows).toHaveLength(2);
    expect(asAdmin.body.data.studentCount).toBe(2);
    expect(asAdmin.body.data.rows[0]).toMatchObject({ score: null, notes: null, gradedAt: null });

    const asLeader = await request(app)
      .get(`/api/v1/quizzes/${quizId}/grades`)
      .set("authorization", `Bearer ${leaderToken}`);
    // The leader's own group only — and this scope is now the SAME derivation
    // the write below uses, which is the whole point of D1.
    expect(asLeader.body.data.rows).toHaveLength(1);
    expect(asLeader.body.data.rows[0].studentUserId).toBe(ownStudentId);
  });

  it("saves a batch and notifies only the newly graded", async () => {
    const before = await quizGradedCount();
    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/grades`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ entries: [{ studentUserId: ownStudentId, score: 18, notes: "Strong." }] });

    expect(res.status).toBe(200);
    const row = res.body.data.rows.find((r: { studentUserId: number }) => r.studentUserId === ownStudentId);
    expect(row).toMatchObject({ score: 18, notes: "Strong." });
    expect(row.gradedByName).toBe("Test leader");
    expect((await quizGradedCount()) - before).toBe(1);

    // Re-saving the same score is silent (D8's unified rule).
    await request(app)
      .post(`/api/v1/quizzes/${quizId}/grades`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ entries: [{ studentUserId: ownStudentId, score: 18, notes: "Strong." }] });
    expect((await quizGradedCount()) - before).toBe(1);

    // Changing the score notifies again.
    await request(app)
      .post(`/api/v1/quizzes/${quizId}/grades`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ entries: [{ studentUserId: ownStudentId, score: 19, notes: "Strong." }] });
    expect((await quizGradedCount()) - before).toBe(2);
  });

  // -------------------------------------------------------------------
  // D1, half one: the season check ran only for LEADER, so an ADMIN of ANY
  // season passed with no check at all — a season-scoped role behaving
  // globally. otherAdminToken administers otherSeasonId and nothing else.
  // -------------------------------------------------------------------
  it("refuses an ADMIN of a different season (R86 — the live v1 hole)", async () => {
    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/grades`)
      .set("authorization", `Bearer ${otherAdminToken}`)
      .send({ entries: [{ studentUserId: ownStudentId, score: 20, notes: null }] });
    expect(res.status).toBe(403);

    const written = await db.quizGrade.count({ where: { quizId } });
    expect(written).toBe(0);
  });

  // -------------------------------------------------------------------
  // D1, half two: the action iterated the caller-supplied array and upserted
  // each studentUserId verbatim — a student in another leader's group, in
  // another season, or enrolled nowhere.
  // -------------------------------------------------------------------
  it("rejects the WHOLE batch when any student is out of scope (R93)", async () => {
    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/grades`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({
        entries: [
          { studentUserId: ownStudentId, score: 15, notes: null },
          { studentUserId: otherGroupStudentId, score: 20, notes: null },
        ],
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("student_not_in_scope");
    // Whole-batch rejection, not skip-the-offender: a client bug must be loud,
    // and the valid half must not land while the caller is told it failed.
    expect(await db.quizGrade.count({ where: { quizId } })).toBe(0);
  });

  it("rejects a score above the quiz's maxScore rather than clamping (R88, D7)", async () => {
    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/grades`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ entries: [{ studentUserId: ownStudentId, score: 21, notes: null }] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("score_exceeds_max");
    // v1 had no server bound at all: the only clamp was Math.min in the form,
    // so an above-max score stored fine and rendered as a >100% average.
    expect(await db.quizGrade.count({ where: { quizId } })).toBe(0);
  });

  it("takes a score with two decimals, refuses three, and a same-score re-save stays silent", async () => {
    const send = (score: number) =>
      request(app)
        .post(`/api/v1/quizzes/${quizId}/grades`)
        .set("authorization", `Bearer ${leaderToken}`)
        .send({ entries: [{ studentUserId: ownStudentId, score, notes: null }] });
    const before = await quizGradedCount();

    const saved = await send(12.75);
    expect(saved.status).toBe(200);
    const row = saved.body.data.rows.find((r: { studentUserId: number }) => r.studentUserId === ownStudentId);
    expect(row.score).toBe(12.75);
    expect((await quizGradedCount()) - before).toBe(1);

    expect((await send(12.75)).status).toBe(200);
    expect((await quizGradedCount()) - before).toBe(1);

    expect((await send(12.755)).status).toBe(400);
  });

  it("clears a grade when the score is null (diverging from R89)", async () => {
    await request(app)
      .post(`/api/v1/quizzes/${quizId}/grades`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ entries: [{ studentUserId: ownStudentId, score: 12, notes: "Typo." }] });
    expect(await db.quizGrade.count({ where: { quizId } })).toBe(1);

    const cleared = await request(app)
      .post(`/api/v1/quizzes/${quizId}/grades`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ entries: [{ studentUserId: ownStudentId, score: null, notes: null }] });
    expect(cleared.status).toBe(200);
    // v1 skipped null entries entirely, so a grade entered against the wrong
    // student could never be removed.
    expect(await db.quizGrade.count({ where: { quizId } })).toBe(0);
  });

  it("refuses a PAPER grade against an ONLINE quiz (R94, D10)", async () => {
    const online = await db.quiz.create({
      data: { seasonId, sessionId, title: "Online", kind: "ONLINE", maxScore: 5, publishedAt: new Date() },
      select: { id: true },
    });
    const res = await request(app)
      .post(`/api/v1/quizzes/${online.id}/grades`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ entries: [{ studentUserId: ownStudentId, score: 5, notes: null }] });
    // Such a row was invisible to the student (their PAPER read filters on
    // kind) but counted in every staff "graded" number and in the export.
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("wrong_quiz_kind");
  });

  it("refuses a student caller outright", async () => {
    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/grades`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ entries: [{ studentUserId: ownStudentId, score: 20, notes: null }] });
    expect(res.status).toBe(403);
  });
});
