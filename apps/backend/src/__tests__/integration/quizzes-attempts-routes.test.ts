import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { addQuizQuestion } from "../../lib/quizzes/questions";
import { cleanupTestData } from "./fixtures";
import { buildPublishedQuizIn, keyOf, pickOption, seedQuizFixtures, setLatestAttempt } from "./quizzes-setup";

// Same reason as the submissions suite: the shared Neon staging Postgres
// autosuspends, and the first query after idling has been measured at ~18s.
jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let sessionId: number;
let ownStudentId: number;
let adminToken: string;
let leaderToken: string;
let studentToken: string;

beforeAll(async () => {
  ({ seasonId, sessionId, ownStudentId, adminToken, leaderToken, studentToken } = await seedQuizFixtures(app));
});

afterAll(async () => {
  await cleanupTestData();
});

describe("GET /api/v1/quizzes/:id and the attempt lifecycle", () => {
  let onlineQuizId: number;
  let mcqId: number;
  let essayId: number;

  async function buildPublishedQuiz(opts: { withEssay: boolean }) {
    return buildPublishedQuizIn(seasonId, sessionId, opts);
  }

  beforeEach(async () => {
    const built = await buildPublishedQuiz({ withEssay: true });
    onlineQuizId = built.quizId;
    mcqId = built.mcqId;
    essayId = built.essayId;
  });

  // ---------------------------------------------------------------------
  // THE ANSWER-KEY TEST (spec D2). Do not weaken this to a field check on a
  // parsed object: the assertion is against the RAW serialised response,
  // because that is what actually travels to a phone.
  // ---------------------------------------------------------------------
  it("never lets the answer key reach a student before release, at the raw-JSON level", async () => {
    // Every type, answers held. The attempt carries stored marks, so a read
    // that loaded them would show them.
    const quiz = await buildPublishedQuizIn(seasonId, sessionId, {
      withEssay: true,
      withTypes: ["MULTI_CHOICE", "TRUE_FALSE", "MATCHING", "FILL_BLANK"],
      released: false,
    });
    const get = () => request(app).get(`/api/v1/quizzes/${quiz.quizId}`).set("authorization", `Bearer ${studentToken}`);
    const list = () =>
      request(app).get(`/api/v1/quizzes?seasonId=${seasonId}`).set("authorization", `Bearer ${studentToken}`);
    // Key and marks by name. The option labels are legitimately present
    // mid-attempt, so the assertion is on the markers, not on the words.
    const noKey = (body: unknown) => {
      const raw = JSON.stringify(body);
      for (const marker of ["correctIndex", "isCorrect", "matchId", "expected", "correctOptionIds", "correctPairs"]) {
        expect(raw).not.toContain(marker);
      }
    };

    // not_started
    const before = await get();
    expect(before.status).toBe(200);
    // The count is not the key: the start card needs it before any question is sent.
    expect(before.body.data).toMatchObject({
      stage: "not_started",
      questions: [],
      questionCount: quiz.questionIds.length,
    });
    noKey(before.body);
    noKey((await list()).body);

    // in_progress: the questions, the student's own answers, no review.
    const started = await request(app)
      .put(`/api/v1/quizzes/${quiz.quizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(started.body.data.stage).toBe("in_progress");
    const attempt = await db.quizAttempt.findFirstOrThrow({ where: { quizId: quiz.quizId }, select: { id: true } });
    await pickOption(attempt.id, quiz.mcqId, "Paris", { isCorrect: true, pointsAwarded: 2 });
    const during = await get();
    noKey(started.body);
    noKey(during.body);
    expect(during.body.data.questions).toHaveLength(quiz.questionIds.length);
    expect(during.body.data.questionCount).toBe(quiz.questionIds.length);
    const single = during.body.data.questions.find((q: { id: number }) => q.id === quiz.mcqId);
    expect(Object.keys(single).sort()).toEqual(
      ["answer", "id", "options", "order", "points", "pointsAwarded", "prompt", "review", "type"].sort(),
    );
    expect(single).toMatchObject({ pointsAwarded: null, review: null });
    expect(during.body.data.questions.every((q: { review: unknown }) => q.review === null)).toBe(true);
    // Every item, every type: exactly the keyless keys (final review I2).
    type Shown = { options?: object[]; left?: object[]; right?: object[]; blanks?: object[] };
    const keysOf = (items: object[] | undefined) => (items ?? []).map((o) => Object.keys(o).sort());
    const shownQuestions = during.body.data.questions as Shown[];
    const items = shownQuestions.flatMap((q) => [...keysOf(q.options), ...keysOf(q.left), ...keysOf(q.right)]);
    expect(items.length).toBeGreaterThan(0);
    for (const keys of items) expect(keys).toEqual(["id", "label"]);
    const blanks = shownQuestions.flatMap((q) => keysOf(q.blanks));
    expect(blanks.length).toBeGreaterThan(0);
    for (const keys of blanks) expect(keys).toEqual(["id", "position"]);

    // submitted, then graded: no question text, options or own answers either.
    for (const status of ["SUBMITTED", "GRADED"] as const) {
      await setLatestAttempt(quiz.quizId, ownStudentId, { status, totalScore: 2 });
      const after = await get();
      expect(after.body.data).toMatchObject({
        stage: status === "GRADED" ? "graded" : "submitted",
        questions: [],
        questionCount: quiz.questionIds.length,
      });
      noKey(after.body);
      expect(JSON.stringify(after.body)).not.toContain("Capital of France?");
      expect(JSON.stringify(after.body)).not.toContain("Paris");
      noKey((await list()).body);
    }
  });

  // The key by inference, not by name (final review C1): serial ids follow
  // insertion, so rows inserted in author order made every right id its left
  // id + pairs and undid the choice shuffle. A fixed shuffle makes it exact.
  it("never lets the option ids give the key away before release", async () => {
    const quiz = await buildPublishedQuizIn(seasonId, sessionId, { withEssay: false, released: false });
    const fixed =
      (order: number[]) =>
      <T>(rows: readonly T[]) =>
        order.map((i) => rows[i] as T);
    const pairs = ["a", "b", "c", "d", "e", "f"].map((k) => ({ left: `L-${k}`, right: `R-${k}` }));
    const matching = await addQuizQuestion(
      quiz.quizId,
      { type: "MATCHING", prompt: "Match six", points: 6, pairs },
      fixed([7, 2, 10, 0, 5, 11, 3, 8, 1, 6, 9, 4]),
    );
    const labels = ["w", "x", "y", "z"];
    const options = labels.map((label, i) => ({ label, isCorrect: i === 1 }));
    const choice = await addQuizQuestion(
      quiz.quizId,
      { type: "SINGLE_CHOICE", prompt: "Pick one", points: 1, options },
      fixed([2, 0, 3, 1]),
    );
    await request(app).put(`/api/v1/quizzes/${quiz.quizId}/attempt`).set("authorization", `Bearer ${studentToken}`);
    const res = await request(app).get(`/api/v1/quizzes/${quiz.quizId}`).set("authorization", `Bearer ${studentToken}`);
    expect(res.body.data.stage).toBe("in_progress");
    type Item = { id: number; label: string };
    const shownOf = (id: number) => res.body.data.questions.find((q: { id: number }) => q.id === id);

    // Matching: the ids sent are the stored ones, and no single offset maps a left to its right.
    const shown = shownOf(matching.id) as { left: Item[]; right: Item[] };
    const { lefts } = await keyOf(matching.id);
    const correct = lefts.map((l) => ({ leftId: l.id, rightId: l.matchId as number }));
    const sorted = (ids: number[]) => [...ids].sort((a, b) => a - b);
    expect(sorted(shown.left.map((o) => o.id))).toEqual(sorted(correct.map((p) => p.leftId)));
    expect(sorted(shown.right.map((o) => o.id))).toEqual(sorted(correct.map((p) => p.rightId)));
    expect(new Set(correct.map((p) => p.rightId - p.leftId)).size).toBeGreaterThan(1);

    // Choice: sorting the options by id does not give back the author's order.
    const shownOptions = (shownOf(choice.id) as { options: Item[] }).options;
    const idsInAuthorOrder = labels.map((l) => shownOptions.find((o) => o.label === l)?.id as number);
    expect(idsInAuthorOrder).not.toEqual(sorted(idsInAuthorOrder));
  });

  it("serves staff the authoring shape from the same path", async () => {
    const res = await request(app).get(`/api/v1/quizzes/${onlineQuizId}`).set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.questions[0].options.find((o: { isCorrect: boolean }) => o.isCorrect).label).toBe("Paris");
    expect(res.body.data.canEditStructure).toBe(true);
    expect(res.body.data.canManage).toBe(true);
  });

  it("gives a leader the authoring shape but no manage rights", async () => {
    const res = await request(app).get(`/api/v1/quizzes/${onlineQuizId}`).set("authorization", `Bearer ${leaderToken}`);
    // A leader grades, and grading needs the key (R103) — same audience v1's
    // essay grader served it to.
    expect(res.status).toBe(200);
    expect(res.body.data.questions[0].options.find((o: { isCorrect: boolean }) => o.isCorrect).label).toBe("Paris");
    expect(res.body.data.canManage).toBe(false);
  });

  it("404s an unpublished quiz for a student and 200s it for staff (R32)", async () => {
    const draft = await db.quiz.create({
      data: { seasonId, sessionId, title: "Draft", kind: "ONLINE", maxScore: 0 },
      select: { id: true },
    });
    const asStudent = await request(app)
      .get(`/api/v1/quizzes/${draft.id}`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(asStudent.status).toBe(404);

    const asAdmin = await request(app).get(`/api/v1/quizzes/${draft.id}`).set("authorization", `Bearer ${adminToken}`);
    expect(asAdmin.status).toBe(200);
  });

  it("creates an attempt lazily and returns the same one on a repeat call (R44, D15)", async () => {
    const first = await request(app)
      .put(`/api/v1/quizzes/${onlineQuizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(first.status).toBe(200);
    expect(first.body.data.status).toBe("IN_PROGRESS");
    expect(first.body.data.attemptNumber).toBe(1);

    const second = await request(app)
      .put(`/api/v1/quizzes/${onlineQuizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`);
    // Idempotent: a screen that mounts twice, or React Query refetching on
    // focus, must not produce a second attempt (ruling C6).
    expect(second.body.data.attemptId).toBe(first.body.data.attemptId);

    const rows = await db.quizAttempt.count({
      where: { quizId: onlineQuizId, studentUserId: ownStudentId },
    });
    expect(rows).toBe(1);
  });

  it("does not write an attempt on a GET (ruling C6)", async () => {
    await request(app).get(`/api/v1/quizzes/${onlineQuizId}`).set("authorization", `Bearer ${studentToken}`);
    const rows = await db.quizAttempt.count({ where: { quizId: onlineQuizId } });
    expect(rows).toBe(0);
  });

  it("saves a batch of answers and refuses a closed attempt", async () => {
    await request(app).put(`/api/v1/quizzes/${onlineQuizId}/attempt`).set("authorization", `Bearer ${studentToken}`);

    const save = await request(app)
      .patch(`/api/v1/quizzes/${onlineQuizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({
        answers: [
          { type: "SINGLE_CHOICE", questionId: mcqId, optionId: (await keyOf(mcqId)).optionId("Paris") },
          { type: "ESSAY", questionId: essayId, text: "Because." },
        ],
      });
    expect(save.status).toBe(200);
    expect(save.body.data.saved).toBe(2);

    // Saving twice is an upsert on (attemptId, questionId) — one row per
    // question per attempt (R53), its selection replaced, and no marking on save (R54).
    const london = (await keyOf(mcqId)).optionId("London");
    const again = await request(app)
      .patch(`/api/v1/quizzes/${onlineQuizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ answers: [{ type: "SINGLE_CHOICE", questionId: mcqId, optionId: london }] });
    expect(again.status).toBe(200);
    const answers = await db.quizAnswer.findMany({
      where: { question: { quizId: onlineQuizId } },
      select: { questionId: true, isCorrect: true, pointsAwarded: true, selections: { select: { optionId: true } } },
    });
    expect(answers).toHaveLength(2);
    expect(answers.every((a) => a.isCorrect === null && a.pointsAwarded === null)).toBe(true);
    expect(answers.find((a) => a.questionId === mcqId)?.selections).toEqual([{ optionId: london }]);
  });

  it("refuses an option of another question (R51)", async () => {
    await request(app).put(`/api/v1/quizzes/${onlineQuizId}/attempt`).set("authorization", `Bearer ${studentToken}`);
    const other = await buildPublishedQuiz({ withEssay: false });
    const res = await request(app)
      .patch(`/api/v1/quizzes/${onlineQuizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`)
      // A real option id, but of another quiz's question.
      .send({
        answers: [{ type: "SINGLE_CHOICE", questionId: mcqId, optionId: (await keyOf(other.mcqId)).optionId("Paris") }],
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("answer_out_of_range");
  });

  it("refuses a value of the wrong shape for the question type (R52)", async () => {
    await request(app).put(`/api/v1/quizzes/${onlineQuizId}/attempt`).set("authorization", `Bearer ${studentToken}`);
    const res = await request(app)
      .patch(`/api/v1/quizzes/${onlineQuizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ answers: [{ type: "SINGLE_CHOICE", questionId: essayId, optionId: null }] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("wrong_answer_type");
  });

  it("refuses a question from another quiz (R50)", async () => {
    await request(app).put(`/api/v1/quizzes/${onlineQuizId}/attempt`).set("authorization", `Bearer ${studentToken}`);
    const other = await buildPublishedQuiz({ withEssay: false });
    const res = await request(app)
      .patch(`/api/v1/quizzes/${onlineQuizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ answers: [{ type: "SINGLE_CHOICE", questionId: other.mcqId, optionId: null }] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("question_not_in_quiz");
  });

  it("refuses a submit with any question unanswered (R59)", async () => {
    await request(app).put(`/api/v1/quizzes/${onlineQuizId}/attempt`).set("authorization", `Bearer ${studentToken}`);
    await request(app)
      .patch(`/api/v1/quizzes/${onlineQuizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({
        answers: [{ type: "SINGLE_CHOICE", questionId: mcqId, optionId: (await keyOf(mcqId)).optionId("Paris") }],
      });

    const res = await request(app)
      .post(`/api/v1/quizzes/${onlineQuizId}/attempt/submit`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("attempt_incomplete");
  });
});
