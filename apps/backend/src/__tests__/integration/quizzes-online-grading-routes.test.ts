import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { addQuizQuestion } from "../../lib/quizzes/questions";
import { toScore } from "../../lib/quizzes/score";
import { bearer, cleanupTestData } from "./fixtures";
import { buildPublishedQuizIn, keyOf, quizGradedCountFor, seedQuizFixtures, type QuizFixtures } from "./quizzes-setup";

// Same reason as the submissions suite: the shared Neon staging Postgres
// autosuspends, and the first query after idling has been measured at ~18s.
jest.setTimeout(60000);

const app = createApp();
let f: QuizFixtures;

beforeAll(async () => {
  f = await seedQuizFixtures(app);
});

afterAll(async () => {
  await cleanupTestData();
});

/** See `quizGradedCountFor` in ./quizzes-setup. */
function quizGradedCount(): Promise<number> {
  return quizGradedCountFor(f.ownStudentId);
}

type Mark = { questionId: number; blankId: number | null; correct: boolean };

describe("ONLINE grading", () => {
  let quizId: number;
  let mcqId: number;
  let essayId: number;
  let fillId: number;
  let blankIds: number[];
  let parisId: number;
  let attemptId: number;

  const list = (token: string) => request(app).get(`/api/v1/quizzes/${quizId}/attempts`).set(bearer(token));
  const grade = (token: string, marks: Mark[], id = attemptId) =>
    request(app).post(`/api/v1/quizzes/${quizId}/attempts/${id}/grade`).set(bearer(token)).send({ marks });
  /** One mark per blank of the fill-blank question, then the essay's. */
  const marksFor = (blanks: boolean[], essay: boolean): Mark[] => [
    ...blankIds.map((blankId, i) => ({ questionId: fillId, blankId, correct: blanks[i] ?? false })),
    { questionId: essayId, blankId: null, correct: essay },
  ];

  beforeEach(async () => {
    // Answers held back: grading must still tell the student their score is in.
    const built = await buildPublishedQuizIn(f.seasonId, f.sessionId, { withEssay: true, released: false });
    quizId = built.quizId;
    mcqId = built.mcqId;
    essayId = built.essayId;
    const fill = await addQuizQuestion(quizId, {
      type: "FILL_BLANK",
      prompt: "{{blank}}, {{blank}} and {{blank}}.",
      points: 3,
      answers: ["Peter", "James", "John"],
    });
    fillId = fill.id;
    blankIds = (await keyOf(fillId)).blankIds;
    parisId = (await keyOf(mcqId)).optionId("Paris");

    // Through the student's own routes: start, save every answer, submit.
    const student = bearer(f.studentToken);
    await request(app).put(`/api/v1/quizzes/${quizId}/attempt`).set(student);
    await request(app)
      .patch(`/api/v1/quizzes/${quizId}/attempt`)
      .set(student)
      .send({
        answers: [
          { type: "SINGLE_CHOICE", questionId: mcqId, optionId: parisId },
          { type: "ESSAY", questionId: essayId, text: "Because of the river." },
          { type: "FILL_BLANK", questionId: fillId, blanks: blankIds.map((blankId) => ({ blankId, text: "Peter" })) },
        ],
      });
    const submitted = await request(app).post(`/api/v1/quizzes/${quizId}/attempt/submit`).set(student);
    expect(submitted.body.data.status).toBe("SUBMITTED");
    attemptId = submitted.body.data.attemptId;
  });

  it("lists the caller's own students with every answer and its key, in author order", async () => {
    const res = await list(f.leaderToken);

    expect(res.status).toBe(200);
    // Kept name, wider meaning: the quiz has leader-marked questions.
    expect(res.body.data.hasEssays).toBe(true);
    expect(res.body.data.items).toHaveLength(1);
    const item = res.body.data.items[0];
    expect(item).toMatchObject({ attemptId, studentUserId: f.ownStudentId, status: "SUBMITTED", autoScore: 2 });
    expect(item.answers.map((a: { type: string }) => a.type)).toEqual(["SINGLE_CHOICE", "ESSAY", "FILL_BLANK"]);
    // The grader gets the answer key — correct for this audience (R103).
    expect(item.answers[0]).toMatchObject({ selectedOptionId: parisId, pointsAwarded: 2 });
    expect(item.answers[0].options).toContainEqual({ id: parisId, label: "Paris", isCorrect: true });
    expect(item.answers[1]).toMatchObject({ text: "Because of the river.", correct: null, pointsAwarded: null });
    expect(item.answers[2].blanks).toEqual(
      ["Peter", "James", "John"].map((expected, i) => ({
        blankId: blankIds[i],
        position: i,
        expected,
        text: "Peter",
        correct: null,
      })),
    );
    // Leader scope = their own group only.
    expect(res.body.data.studentCount).toBe(1);
  });

  it("shows a student whose latest attempt is still in progress instead of hiding them (R102, D5)", async () => {
    await db.quizAttempt.update({ where: { id: attemptId }, data: { status: "IN_PROGRESS" } });
    const res = await list(f.leaderToken);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(0);
    expect(res.body.data.waiting).toEqual([expect.objectContaining({ studentUserId: f.ownStudentId })]);
    expect(res.body.data.waiting[0].startedAt).not.toBeNull();
  });

  it("lists a never-started student as waiting with a null startedAt", async () => {
    const res = await list(f.adminToken);
    expect(res.body.data.studentCount).toBe(2);
    expect(res.body.data.waiting).toEqual([
      expect.objectContaining({ studentUserId: f.otherGroupStudentId, startedAt: null }),
    ]);
  });

  it("fill blank waits SUBMITTED, leader marks 2 of 3 blanks right → GRADED with 2/3 of points", async () => {
    const res = await grade(f.leaderToken, marksFor([true, true, false], true));
    expect(res.status).toBe(200);
    // 2/3 of 3 = 2, essay right = 5; auto 2 → total 9.
    expect(res.body.data).toMatchObject({ status: "GRADED", autoScore: 2, manualScore: 7, totalScore: 9 });
    expect(res.body.data.gradedByName).toBe("Test leader");

    const stored = await db.quizAnswerBlank.findMany({
      where: { answer: { attemptId } },
      orderBy: { blankId: "asc" },
      select: { isCorrect: true },
    });
    expect(stored.map((b) => b.isCorrect)).toEqual([true, true, false]);

    const after = await list(f.leaderToken);
    const fill = after.body.data.items[0].answers[2];
    expect(fill.pointsAwarded).toBe(2);
    expect(fill.blanks.map((b: { correct: boolean }) => b.correct)).toEqual([true, true, false]);
  });

  it("essay marked wrong → 0, and the total is the sum of what was awarded", async () => {
    const res = await grade(f.leaderToken, marksFor([true, true, true], false));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ manualScore: 3, totalScore: 5 });

    const essay = await db.quizAnswer.findFirstOrThrow({
      where: { attemptId, questionId: essayId },
      select: { isCorrect: true, pointsAwarded: true },
    });
    expect(essay.isCorrect).toBe(false);
    expect(toScore(essay.pointsAwarded)).toBe(0);
    const answers = await db.quizAnswer.findMany({ where: { attemptId }, select: { pointsAwarded: true } });
    expect(answers.reduce((sum, a) => sum + (toScore(a.pointsAwarded) ?? 0), 0)).toBe(5);
  });

  it("refuses marks_incomplete when a blank is missing, and out-of-range or repeated marks", async () => {
    const missing = await grade(f.leaderToken, marksFor([true, true, true], true).slice(1));
    expect(missing.status).toBe(409);
    expect(missing.body.error.code).toBe("marks_incomplete");

    const twice = [
      ...marksFor([true, true, true], true),
      { questionId: fillId, blankId: blankIds[0] as number, correct: false },
    ];
    const repeated = await grade(f.leaderToken, twice);
    expect(repeated.status).toBe(400);
    expect(repeated.body.error.code).toBe("mark_out_of_range");

    const autoQuestion = await grade(f.leaderToken, [
      ...marksFor([true, true, true], true),
      { questionId: mcqId, blankId: null, correct: true },
    ]);
    expect(autoQuestion.status).toBe(400);
    expect(autoQuestion.body.error.code).toBe("mark_out_of_range");

    const attempt = await db.quizAttempt.findUniqueOrThrow({ where: { id: attemptId }, select: { status: true } });
    expect(attempt.status).toBe("SUBMITTED");
  });

  it("leader, admin and super can each mark", async () => {
    for (const [token, name] of [
      [f.leaderToken, "Test leader"],
      [f.adminToken, "Test admin"],
      [f.superToken, "Test super"],
    ] as const) {
      const res = await grade(token, marksFor([true, false, true], true));
      expect(res.status).toBe(200);
      expect(res.body.data.gradedByName).toBe(name);
    }
  });

  it('student is notified "score is in" on grading before answers are released', async () => {
    const before = await quizGradedCount();
    await grade(f.leaderToken, marksFor([true, true, false], true));
    expect((await quizGradedCount()) - before).toBe(1);

    // A re-save at the same total is silent; a changed total notifies again.
    await grade(f.leaderToken, marksFor([true, true, false], true));
    expect((await quizGradedCount()) - before).toBe(1);
    await grade(f.leaderToken, marksFor([true, true, true], true));
    expect((await quizGradedCount()) - before).toBe(2);

    const quiz = await db.quiz.findUniqueOrThrow({ where: { id: quizId }, select: { resultsReleasedAt: true } });
    expect(quiz.resultsReleasedAt).toBeNull();
  });

  it("shows a legacy essay marked with points as marked, keeping its points", async () => {
    await db.quizAnswer.update({
      where: { attemptId_questionId: { attemptId, questionId: essayId } },
      data: { pointsAwarded: 4, isCorrect: null },
    });
    const res = await list(f.leaderToken);
    expect(res.body.data.items[0].answers[1]).toMatchObject({ type: "ESSAY", pointsAwarded: 4, correct: true });
  });

  it("refuses grading an attempt whose student is outside the caller's scope (R68)", async () => {
    const strangerAttempt = await db.quizAttempt.create({
      data: {
        quizId,
        studentUserId: f.otherGroupStudentId,
        attemptNumber: 1,
        status: "SUBMITTED",
        autoScore: 0,
        submittedAt: new Date(),
        answers: { create: [{ questionId: essayId, text: "Mine." }] },
      },
      select: { id: true },
    });
    const res = await grade(f.leaderToken, marksFor([true, true, true], true), strangerAttempt.id);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("student_not_in_scope");
  });

  it("refuses grading an attempt that is still in progress (R69)", async () => {
    await db.quizAttempt.update({ where: { id: attemptId }, data: { status: "IN_PROGRESS" } });
    const res = await grade(f.leaderToken, marksFor([true, true, true], true));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("attempt_not_submitted");
  });

  it("lets a LEADER reopen an attempt, and tells the student (D5)", async () => {
    await grade(f.leaderToken, marksFor([true, true, true], true));
    const before = await quizGradedCount();

    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/reopen`)
      .set(bearer(f.leaderToken))
      .send({ studentUserId: f.ownStudentId });
    expect(res.status).toBe(201);
    expect(res.body.data.attemptNumber).toBe(2);

    const attempts = await db.quizAttempt.findMany({
      where: { quizId, studentUserId: f.ownStudentId },
      orderBy: { attemptNumber: "asc" },
      select: { attemptNumber: true, status: true, totalScore: true },
    });
    // History is preserved: the graded attempt is untouched (R81).
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toMatchObject({ attemptNumber: 1, status: "GRADED" });
    expect(toScore(attempts[0]?.totalScore ?? null)).toBe(10);
    expect(attempts[1]).toMatchObject({ attemptNumber: 2, status: "IN_PROGRESS" });
    expect((await quizGradedCount()) - before).toBe(1);
  });

  it("reopens a SUBMITTED attempt, then refuses while that one is open", async () => {
    const reopen = () =>
      request(app)
        .post(`/api/v1/quizzes/${quizId}/attempts/reopen`)
        .set(bearer(f.adminToken))
        .send({ studentUserId: f.ownStudentId });
    const first = await reopen();
    expect(first.status).toBe(201);
    expect(first.body.data.attemptNumber).toBe(2);

    const second = await reopen();
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("attempt_open");
  });

  it("refuses reopening for a student outside the caller's scope", async () => {
    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/reopen`)
      .set(bearer(f.leaderToken))
      .send({ studentUserId: f.otherGroupStudentId });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("student_not_in_scope");
  });

  it("refuses reopening when the student has never attempted", async () => {
    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/reopen`)
      .set(bearer(f.adminToken))
      .send({ studentUserId: f.otherGroupStudentId });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("no_attempt");
  });
});
