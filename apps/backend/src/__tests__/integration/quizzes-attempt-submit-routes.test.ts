import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { addQuizQuestion } from "../../lib/quizzes/questions";
import { toScore } from "../../lib/quizzes/score";
import { bearer, cleanupTestData, createTestUser, login } from "./fixtures";
import { buildPublishedQuizIn, keyOf, quizGradedCountFor, seedQuizFixtures } from "./quizzes-setup";

// Same reason as the submissions suite: the shared Neon staging Postgres
// autosuspends, and the first query after idling has been measured at ~18s.
jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let sessionId: number;
let ownStudentId: number;
let adminToken: string;
let studentToken: string;

beforeAll(async () => {
  ({ seasonId, sessionId, ownStudentId, adminToken, studentToken } = await seedQuizFixtures(app));
});

afterAll(async () => {
  await cleanupTestData();
});

/** See `quizGradedCountFor` in ./quizzes-setup. */
function quizGradedCount(): Promise<number> {
  return quizGradedCountFor(ownStudentId);
}

const start = (quizId: number) => request(app).put(`/api/v1/quizzes/${quizId}/attempt`).set(bearer(studentToken));
const save = (quizId: number, answers: unknown[]) =>
  request(app).patch(`/api/v1/quizzes/${quizId}/attempt`).set(bearer(studentToken)).send({ answers });
const submit = (quizId: number) =>
  request(app).post(`/api/v1/quizzes/${quizId}/attempt/submit`).set(bearer(studentToken));

/** The single-choice sample answered with the option labelled `label` ("Paris" is right). */
async function pick(questionId: number, label: "Paris" | "London") {
  return { type: "SINGLE_CHOICE", questionId, optionId: (await keyOf(questionId)).optionId(label) };
}

function latestAttempt(quizId: number) {
  return db.quizAttempt.findFirstOrThrow({
    where: { quizId, studentUserId: ownStudentId },
    orderBy: { attemptNumber: "desc" },
    select: {
      id: true,
      autoScore: true,
      manualScore: true,
      totalScore: true,
      submittedAt: true,
      gradedAt: true,
      gradedById: true,
    },
  });
}

describe("submitting an attempt", () => {
  it("submits a quiz with an essay to SUBMITTED with autoScore only (R63)", async () => {
    const built = await buildPublishedQuizIn(seasonId, sessionId, { withEssay: true });
    const before = await quizGradedCount();
    await start(built.quizId);
    const saved = await save(built.quizId, [
      await pick(built.mcqId, "Paris"),
      { type: "ESSAY", questionId: built.essayId, text: "Because." },
    ]);
    expect(saved.status).toBe(200);

    const res = await submit(built.quizId);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("SUBMITTED");
    expect(res.body.data.totalScore).toBeNull();
    expect(res.body.data.questions).toEqual([]);

    const attempt = await latestAttempt(built.quizId);
    expect(toScore(attempt.autoScore)).toBe(2);
    expect(attempt.manualScore).toBeNull();
    expect(attempt.totalScore).toBeNull();
    expect(attempt.submittedAt).not.toBeNull();
    // Nothing graded yet, so nothing to tell the student.
    expect((await quizGradedCount()) - before).toBe(0);
  });

  it('auto-grades an all-auto quiz and notifies "score is in" before answers are released (R64)', async () => {
    const built = await buildPublishedQuizIn(seasonId, sessionId, { withEssay: false, released: false });
    const before = await quizGradedCount();
    await start(built.quizId);
    await save(built.quizId, [await pick(built.mcqId, "London")]);

    const res = await submit(built.quizId);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: "GRADED", stage: "graded", totalScore: 0, questions: [] });
    // The score only: no options, no own answer, no key before the release.
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain("Paris");
    expect(raw).not.toContain("London");

    const attempt = await latestAttempt(built.quizId);
    // gradedById stays null on the auto path — nobody graded it.
    expect(toScore(attempt.manualScore)).toBe(0);
    expect(attempt.gradedById).toBeNull();
    expect(attempt.gradedAt).not.toBeNull();
    expect((await quizGradedCount()) - before).toBe(1);
  });

  it("mixed auto quiz grades on submit with partial marks", async () => {
    const built = await buildPublishedQuizIn(seasonId, sessionId, { withEssay: false });
    const multi = await addQuizQuestion(built.quizId, {
      type: "MULTI_CHOICE",
      prompt: "Pick the gospels",
      points: 1,
      options: [
        { label: "Mark", isCorrect: true },
        { label: "Luke", isCorrect: true },
        { label: "John", isCorrect: true },
        { label: "Acts", isCorrect: false },
      ],
    });
    const matching = await addQuizQuestion(built.quizId, {
      type: "MATCHING",
      prompt: "Match",
      points: 4,
      pairs: ["A", "B", "C", "D", "E"].map((x) => ({ left: `${x}1`, right: `${x}2` })),
    });
    const multiKey = await keyOf(multi.id);
    const matchKey = await keyOf(matching.id);
    // 3 of 5 pairs right: the last two swapped.
    const pairs = matchKey.lefts.map((l, i) => {
      const rightOf = (j: number) => matchKey.lefts[j]?.matchId as number;
      return { leftId: l.id, rightId: rightOf(i === 3 ? 4 : i === 4 ? 3 : i) };
    });

    await start(built.quizId);
    const saved = await save(built.quizId, [
      await pick(built.mcqId, "Paris"),
      { type: "MULTI_CHOICE", questionId: multi.id, optionIds: [multiKey.optionId("Mark"), multiKey.optionId("Luke")] },
      { type: "MATCHING", questionId: matching.id, pairs },
    ]);
    expect(saved.status).toBe(200);

    const res = await submit(built.quizId);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("GRADED");
    // 2 (single) + 2/3 of 1 = 0.67 + 3/5 of 4 = 2.4 → 5.07
    expect(res.body.data.totalScore).toBe(5.07);

    const attempt = await latestAttempt(built.quizId);
    const answers = await db.quizAnswer.findMany({ where: { attemptId: attempt.id }, select: { pointsAwarded: true } });

    // total equals sum of awarded: the SQL CHECK and the per-question rows agree.
    const awarded = answers.reduce((sum, a) => sum + (toScore(a.pointsAwarded) ?? 0), 0);
    expect(toScore(attempt.totalScore)).toBe(Math.round(awarded * 100) / 100);
    expect(toScore(attempt.totalScore)).toBe((toScore(attempt.autoScore) ?? 0) + (toScore(attempt.manualScore) ?? 0));
  });

  it("refuses submit while a matching question has an unpaired left item", async () => {
    const built = await buildPublishedQuizIn(seasonId, sessionId, { withEssay: false, withTypes: ["MATCHING"] });
    const matchingId = built.questionIds[1] as number;
    const key = await keyOf(matchingId);
    const first = key.lefts[0];
    await start(built.quizId);
    await save(built.quizId, [
      await pick(built.mcqId, "Paris"),
      { type: "MATCHING", questionId: matchingId, pairs: [{ leftId: first?.id, rightId: first?.matchId }] },
    ]);

    const res = await submit(built.quizId);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("attempt_incomplete");
  });

  it("refuses more ticks than Choose N, and a type that is not the question's, writing nothing", async () => {
    const built = await buildPublishedQuizIn(seasonId, sessionId, { withEssay: false, withTypes: ["MULTI_CHOICE"] });
    const multiId = built.questionIds[1] as number;
    const key = await keyOf(multiId);
    await start(built.quizId);

    const tooMany = await save(built.quizId, [
      { type: "MULTI_CHOICE", questionId: multiId, optionIds: ["2", "3", "4"].map(key.optionId) },
    ]);
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.error).toEqual({ code: "too_many_choices", message: "Choose at most 2." });

    const wrongType = await save(built.quizId, [{ type: "ESSAY", questionId: built.mcqId, text: "Paris" }]);
    expect(wrongType.status).toBe(400);
    expect(wrongType.body.error.code).toBe("wrong_answer_type");

    const attempt = await latestAttempt(built.quizId);
    expect(await db.quizAnswer.count({ where: { attemptId: attempt.id } })).toBe(0);
  });

  it("scores exactly once when submits race, and a save never lands after scoring (REG-111)", async () => {
    const built = await buildPublishedQuizIn(seasonId, sessionId, { withEssay: false });
    const before = await quizGradedCount();
    await start(built.quizId);
    await save(built.quizId, [await pick(built.mcqId, "Paris")]);
    const wrong = await pick(built.mcqId, "London");

    const results = await Promise.all([...[0, 1, 2, 3].map(() => submit(built.quizId)), save(built.quizId, [wrong])]);
    const submits = results.slice(0, 4);
    expect(submits.filter((r) => r.status === 200)).toHaveLength(1);
    expect(submits.filter((r) => r.status === 409)).toHaveLength(3);
    expect((await quizGradedCount()) - before).toBe(1);

    // Whatever order the lock serialised them in, the stored answer and the
    // stored score agree: nothing was saved after scoring without being scored.
    const attempt = await latestAttempt(built.quizId);
    const answer = await db.quizAnswer.findFirstOrThrow({
      where: { attemptId: attempt.id },
      select: { isCorrect: true, pointsAwarded: true },
    });
    expect(answer.isCorrect).not.toBeNull();
    expect(toScore(attempt.totalScore)).toBe(toScore(answer.pointsAwarded));
  });

  it("a save that was waiting on the attempt lock is refused once the attempt closes (REG-111)", async () => {
    const built = await buildPublishedQuizIn(seasonId, sessionId, { withEssay: false });
    await start(built.quizId);
    const right = await pick(built.mcqId, "Paris");
    await save(built.quizId, [right]);
    const wrong = await pick(built.mcqId, "London");
    const attempt = await latestAttempt(built.quizId);

    // Hold the attempt row ourselves: the save passes its cheap IN_PROGRESS
    // pre-check, then must queue on the lock. We close the attempt before
    // releasing it, so only a save that re-reads the status under the lock
    // can notice.
    let waiting: Promise<request.Response> | undefined;
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "QuizAttempt" WHERE "id" = ${attempt.id} FOR UPDATE`;
      waiting = Promise.resolve(save(built.quizId, [wrong]));
      await new Promise((resolve) => setTimeout(resolve, 700));
      await tx.quizAttempt.update({ where: { id: attempt.id }, data: { status: "SUBMITTED" } });
    });

    const res = await waiting;
    expect(res?.status).toBe(409);
    expect(res?.body.error.code).toBe("attempt_closed");
    const stored = await db.quizAnswerSelection.findMany({
      where: { answer: { attemptId: attempt.id } },
      select: { optionId: true },
    });
    expect(stored).toEqual([{ optionId: right.optionId }]);
  });

  it("refuses a second submit and a save after submit (R49, R58)", async () => {
    const built = await buildPublishedQuizIn(seasonId, sessionId, { withEssay: false });
    await start(built.quizId);
    await save(built.quizId, [await pick(built.mcqId, "Paris")]);
    await submit(built.quizId);

    const resubmit = await submit(built.quizId);
    expect(resubmit.status).toBe(409);
    expect(resubmit.body.error.code).toBe("attempt_closed");

    const lateSave = await save(built.quizId, [await pick(built.mcqId, "London")]);
    expect(lateSave.status).toBe(409);
    expect(lateSave.body.error.code).toBe("attempt_closed");

    const restart = await start(built.quizId);
    // R45: one attempt per student unless staff reopen it.
    expect(restart.status).toBe(409);
    expect(restart.body.error.code).toBe("attempt_closed");
  });

  it("refuses an attempt from staff and from a student outside the season", async () => {
    const built = await buildPublishedQuizIn(seasonId, sessionId, { withEssay: true });
    const staff = await request(app).put(`/api/v1/quizzes/${built.quizId}/attempt`).set(bearer(adminToken));
    expect(staff.status).toBe(403);

    const outsider = await createTestUser("outsider", "STUDENT");
    const outsiderToken = await login(app, outsider.email);
    const res = await request(app).put(`/api/v1/quizzes/${built.quizId}/attempt`).set(bearer(outsiderToken));
    expect(res.status).toBe(403);
  });
});
