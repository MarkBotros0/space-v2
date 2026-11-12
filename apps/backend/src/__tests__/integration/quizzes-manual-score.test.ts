import request from "supertest";

import { manualScoreSchema } from "../../../../../packages/shared/src/index";
import { createApp } from "../../app";
import { db } from "../../db/client";
import { bearer, cleanupTestData, createTestSeason, createTestUser } from "./fixtures";
import { buildPublishedQuizIn, quizGradedCountFor, seedQuizFixtures, type QuizFixtures } from "./quizzes-setup";

jest.setTimeout(60000);

const app = createApp();
let f: QuizFixtures;

beforeAll(async () => {
  f = await seedQuizFixtures(app);
});

afterAll(async () => {
  await cleanupTestData();
});

/** An ONLINE quiz out of 14 (choice 2, essay 5, multi 3, matching 4), so 7.5 fits. */
async function onlineQuiz(): Promise<number> {
  const built = await buildPublishedQuizIn(f.seasonId, f.sessionId, {
    withEssay: true,
    withTypes: ["MULTI_CHOICE", "MATCHING"],
  });
  return built.quizId;
}

function put(quizId: number, studentUserId: number, token: string, body: unknown) {
  return request(app)
    .put(`/api/v1/quizzes/${quizId}/manual-scores/${studentUserId}`)
    .set(bearer(token))
    .send(body as object);
}

function del(quizId: number, studentUserId: number, token: string) {
  return request(app).delete(`/api/v1/quizzes/${quizId}/manual-scores/${studentUserId}`).set(bearer(token));
}

function gradeRow(quizId: number, studentUserId: number) {
  return db.quizGrade.findUnique({ where: { quizId_studentUserId: { quizId, studentUserId } } });
}

describe("the admin's manual score on an online quiz", () => {
  it("only the season admin or a super", async () => {
    const quizId = await onlineQuiz();
    const body = { score: 5, notes: null };

    expect((await put(quizId, f.ownStudentId, f.leaderToken, body)).status).toBe(403);
    expect((await put(quizId, f.ownStudentId, f.otherAdminToken, body)).status).toBe(403);
    expect((await put(quizId, f.ownStudentId, f.studentToken, body)).status).toBe(403);
    expect((await del(quizId, f.ownStudentId, f.leaderToken)).status).toBe(403);
    expect((await del(quizId, f.ownStudentId, f.otherAdminToken)).status).toBe(403);
    expect(await gradeRow(quizId, f.ownStudentId)).toBeNull();

    const asSuper = await put(quizId, f.ownStudentId, f.superToken, body);
    expect(asSuper.status).toBe(200);
    expect(asSuper.body.data).toMatchObject({ score: 5, notes: null, gradedBy: { name: "Test super" } });

    const asAdmin = await put(quizId, f.ownStudentId, f.adminToken, { score: 6, notes: "Paper copy." });
    expect(asAdmin.status).toBe(200);
    expect(asAdmin.body.data).toMatchObject({ score: 6, notes: "Paper copy.", gradedBy: { name: "Test admin" } });
    expect(typeof asAdmin.body.data.gradedAt).toBe("string");
    expect(typeof asAdmin.body.data.gradedBy.id).toBe("number");
  });

  it("refused on a paper quiz", async () => {
    const paper = await db.quiz.create({
      data: { seasonId: f.seasonId, sessionId: f.sessionId, title: "Paper", kind: "PAPER", maxScore: 20 },
      select: { id: true },
    });
    const saved = await put(paper.id, f.ownStudentId, f.adminToken, { score: 5, notes: null });
    expect(saved.status).toBe(409);
    expect(saved.body.error.code).toBe("quiz_not_online");
    const cleared = await del(paper.id, f.ownStudentId, f.adminToken);
    expect(cleared.status).toBe(409);
    expect(cleared.body.error.code).toBe("quiz_not_online");
  });

  it("refused while an attempt is open", async () => {
    const quizId = await onlineQuiz();
    await db.quizAttempt.create({
      data: { quizId, studentUserId: f.ownStudentId, attemptNumber: 1, shuffleSeed: 1 },
    });
    const res = await put(quizId, f.ownStudentId, f.adminToken, { score: 5, notes: null });
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({ code: "attempt_open", message: "End their attempt first." });
    expect(await gradeRow(quizId, f.ownStudentId)).toBeNull();
  });

  it("score bounds and two decimals", async () => {
    const quizId = await onlineQuiz();

    const ok = await put(quizId, f.ownStudentId, f.adminToken, { score: 7.5, notes: null });
    expect(ok.status).toBe(200);
    expect(ok.body.data.score).toBe(7.5);
    expect(Number((await gradeRow(quizId, f.ownStudentId))?.score)).toBe(7.5);

    // 7.55 is 7.549999… in binary: still two decimals, stored as 7.55.
    const awkward = await put(quizId, f.ownStudentId, f.adminToken, { score: 7.55, notes: null });
    expect(awkward.status).toBe(200);
    expect(awkward.body.data.score).toBe(7.55);
    expect(Number((await gradeRow(quizId, f.ownStudentId))?.score)).toBe(7.55);

    for (const score of [7.555, -1, 14.5]) {
      const res = await put(quizId, f.ownStudentId, f.adminToken, { score, notes: null });
      expect(res.status).toBe(400);
    }
    expect((await put(quizId, f.ownStudentId, f.adminToken, { score: 14, notes: null })).status).toBe(200);
    expect((await put(quizId, f.ownStudentId, f.adminToken, { score: 0, notes: null })).status).toBe(200);
    expect((await put(quizId, f.ownStudentId, f.adminToken, { notes: null })).status).toBe(400);
  });

  it("student outside the quiz's scope → 404", async () => {
    const quizId = await onlineQuiz();
    const stranger = await createTestUser("stranger", "STUDENT");
    expect((await put(quizId, stranger.id, f.adminToken, { score: 5, notes: null })).status).toBe(404);
    expect((await del(quizId, stranger.id, f.adminToken)).status).toBe(404);
    expect((await put(999999999, f.ownStudentId, f.adminToken, { score: 5, notes: null })).status).toBe(404);
    expect(await gradeRow(quizId, stranger.id)).toBeNull();
  });

  it('re-save with the same score and notes notifies nothing; a change notifies "Your score is in" once', async () => {
    const quizId = await onlineQuiz();
    const at = async () => quizGradedCountFor(f.ownStudentId);

    const start = await at();
    expect((await put(quizId, f.ownStudentId, f.adminToken, { score: 6, notes: "Done on paper." })).status).toBe(200);
    expect((await at()) - start).toBe(1);
    const latest = await db.notification.findFirstOrThrow({
      where: { userId: f.ownStudentId, type: "QUIZ_GRADED" },
      orderBy: { id: "desc" },
      select: { body: true },
    });
    expect(latest.body).toBe("Your score is in.");

    const first = await gradeRow(quizId, f.ownStudentId);
    expect((await put(quizId, f.ownStudentId, f.adminToken, { score: 6, notes: "Done on paper." })).status).toBe(200);
    expect((await at()) - start).toBe(1);
    // A no-op re-save leaves the row as it was.
    expect((await gradeRow(quizId, f.ownStudentId))?.gradedAt).toEqual(first?.gradedAt);

    expect((await put(quizId, f.ownStudentId, f.adminToken, { score: 6.5, notes: "Done on paper." })).status).toBe(200);
    expect((await at()) - start).toBe(2);
  });

  it("clear deletes the row and notifies nothing", async () => {
    const quizId = await onlineQuiz();
    await put(quizId, f.ownStudentId, f.adminToken, { score: 6, notes: null });
    const before = await quizGradedCountFor(f.ownStudentId);

    const res = await del(quizId, f.ownStudentId, f.adminToken);
    expect(res.status).toBe(204);
    expect(await gradeRow(quizId, f.ownStudentId)).toBeNull();
    expect((await quizGradedCountFor(f.ownStudentId)) - before).toBe(0);

    // Clearing what is already clear is a no-op, not an error.
    expect((await del(quizId, f.ownStudentId, f.adminToken)).status).toBe(204);
  });

  it("raw JSON has no question text or answers", async () => {
    const quizId = await onlineQuiz();
    const res = await put(quizId, f.ownStudentId, f.adminToken, { score: 6, notes: null });
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.data).sort()).toEqual(["gradedAt", "gradedBy", "notes", "score"]);
    expect(manualScoreSchema.strict().safeParse(res.body.data).success).toBe(true);
    const raw = JSON.stringify(res.body);
    for (const leak of ["Capital of France", "Paris", "Discuss the reading", "isCorrect", "prompt", "answers"]) {
      expect(raw).not.toContain(leak);
    }
  });

  it("a notes-only edit is saved but silent; a float-noise re-save is silent", async () => {
    const quizId = await onlineQuiz();
    expect((await put(quizId, f.ownStudentId, f.adminToken, { score: 0.3, notes: "First." })).status).toBe(200);
    const start = await quizGradedCountFor(f.ownStudentId);
    const first = await gradeRow(quizId, f.ownStudentId);

    const edited = await put(quizId, f.ownStudentId, f.adminToken, { score: 0.3, notes: "Second." });
    expect(edited.status).toBe(200);
    expect(edited.body.data.notes).toBe("Second.");
    const row = await gradeRow(quizId, f.ownStudentId);
    expect(row?.notes).toBe("Second.");
    expect(row!.gradedAt!.getTime()).toBeGreaterThanOrEqual(first!.gradedAt!.getTime());
    expect((await quizGradedCountFor(f.ownStudentId)) - start).toBe(0);

    const noisy = await put(quizId, f.ownStudentId, f.adminToken, { score: 0.1 + 0.2, notes: "Second." });
    expect(noisy.status).toBe(200);
    expect(noisy.body.data.score).toBe(0.3);
    expect((await quizGradedCountFor(f.ownStudentId)) - start).toBe(0);
  });

  it("refused on an unpublished quiz; clearing still works there", async () => {
    const quizId = await onlineQuiz();
    expect((await put(quizId, f.ownStudentId, f.adminToken, { score: 5, notes: null })).status).toBe(200);
    await db.quiz.update({ where: { id: quizId }, data: { publishedAt: null } });

    const res = await put(quizId, f.ownStudentId, f.adminToken, { score: 6, notes: null });
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({
      code: "quiz_not_published",
      message: "Publish the quiz before entering a score.",
    });
    expect(Number((await gradeRow(quizId, f.ownStudentId))?.score)).toBe(5);

    expect((await del(quizId, f.ownStudentId, f.adminToken)).status).toBe(204);
    expect(await gradeRow(quizId, f.ownStudentId)).toBeNull();
  });

  it("a deleted season or a deleted student → 404", async () => {
    const gone = await createTestSeason();
    const goneQuiz = await db.quiz.create({
      data: { seasonId: gone.id, title: "Gone", kind: "ONLINE", maxScore: 10, publishedAt: new Date() },
      select: { id: true },
    });
    const enrolled = await createTestUser("gone-student", "STUDENT");
    await db.seasonEnrollment.create({ data: { seasonId: gone.id, studentUserId: enrolled.id, status: "ACTIVE" } });
    await db.season.update({ where: { id: gone.id }, data: { deletedAt: new Date() } });
    expect((await put(goneQuiz.id, enrolled.id, f.superToken, { score: 5, notes: null })).status).toBe(404);
    expect((await del(goneQuiz.id, enrolled.id, f.superToken)).status).toBe(404);

    const quizId = await onlineQuiz();
    const deleted = await createTestUser("deleted-student", "STUDENT");
    await db.seasonEnrollment.create({ data: { seasonId: f.seasonId, studentUserId: deleted.id, status: "ACTIVE" } });
    await db.user.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });
    const res = await put(quizId, deleted.id, f.adminToken, { score: 5, notes: null });
    expect(res.status).toBe(404);
    expect((await del(quizId, deleted.id, f.adminToken)).status).toBe(404);
    expect(await gradeRow(quizId, deleted.id)).toBeNull();
  });
});
