import type { Workbook } from "exceljs";
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import type { SessionUser } from "../../lib/auth/tokens";
import { buildSeasonWorkbook } from "../../lib/exports/season-workbook";
import { loadSeasonRecord } from "../../lib/queries/me/season-record";
import { lockStudentInQuiz } from "../../lib/quizzes/student-lock";
import { bearer, cleanupTestData } from "./fixtures";
import { buildPublishedQuizIn, seedQuizFixtures, setLatestAttempt, type QuizFixtures } from "./quizzes-setup";

jest.setTimeout(60000);

const app = createApp();
let f: QuizFixtures;

beforeAll(async () => {
  f = await seedQuizFixtures(app);
});

afterAll(async () => {
  await cleanupTestData();
});

let quizCount = 0;

/** An ONLINE quiz out of 10 (choice 2, essay 5, multi 3), answers held unless `released`, with its own title. */
async function onlineQuiz(released = false): Promise<{ quizId: number; title: string }> {
  const { quizId } = await buildPublishedQuizIn(f.seasonId, f.sessionId, {
    withEssay: true,
    withTypes: ["MULTI_CHOICE"],
    released,
  });
  quizCount += 1;
  const title = `Readers quiz ${quizCount}`;
  await db.quiz.update({ where: { id: quizId }, data: { title } });
  return { quizId, title };
}

async function gradedAttempt(quizId: number, studentUserId: number, score: number, attemptNumber = 1) {
  await db.quizAttempt.create({ data: { quizId, studentUserId, attemptNumber, shuffleSeed: 1 } });
  await setLatestAttempt(quizId, studentUserId, { status: "GRADED", totalScore: score });
}

function putScore(quizId: number, studentUserId: number, body: { score: number; notes: string | null }) {
  return request(app)
    .put(`/api/v1/quizzes/${quizId}/manual-scores/${studentUserId}`)
    .set(bearer(f.adminToken))
    .send(body);
}

function clearScore(quizId: number, studentUserId: number) {
  return request(app).delete(`/api/v1/quizzes/${quizId}/manual-scores/${studentUserId}`).set(bearer(f.adminToken));
}

const detail = (quizId: number) => request(app).get(`/api/v1/quizzes/${quizId}`).set(bearer(f.studentToken));

async function listRow(quizId: number) {
  const res = await request(app).get(`/api/v1/quizzes?seasonId=${f.seasonId}`).set(bearer(f.studentToken));
  expect(res.status).toBe(200);
  return { raw: res.text, row: res.body.data.items.find((r: { quizId: number }) => r.quizId === quizId) };
}

async function grading(quizId: number) {
  const res = await request(app).get(`/api/v1/quizzes/${quizId}/attempts`).set(bearer(f.adminToken));
  expect(res.status).toBe(200);
  return res.body.data;
}

function gradesCell(workbook: Workbook, title: string, studentName: string): unknown {
  const sheet = workbook.getWorksheet("Grades");
  if (!sheet) throw new Error("no Grades sheet");
  const rows: unknown[][] = [];
  sheet.eachRow((row) => rows.push((row.values as unknown[]).slice(1)));
  const col = (rows[0] as string[]).findIndex((h) => h.startsWith(`${title} (`));
  return rows.find((r) => r[0] === studentName)?.[col];
}

/** The season record reads a finished enrolment only: finish it for the read, then put it back. */
async function recordScore(quizId: number): Promise<number | null> {
  const where = { seasonId: f.seasonId, studentUserId: f.ownStudentId };
  await db.seasonEnrollment.updateMany({ where, data: { status: "COMPLETED" } });
  try {
    const record = await loadSeasonRecord({ userId: f.ownStudentId } as SessionUser, f.seasonId);
    return record?.quizzes.find((q) => q.id === quizId)?.score ?? null;
  } finally {
    await db.seasonEnrollment.updateMany({ where, data: { status: "ACTIVE" } });
  }
}

async function keyTextOf(quizId: number): Promise<string[]> {
  const questions = await db.quizQuestion.findMany({
    where: { quizId },
    select: { prompt: true, quizOptions: { select: { label: true } } },
  });
  // Short labels ("3", "True") would match ids and keys; the prompts and longer labels are the leak.
  return questions.flatMap((q) => [q.prompt, ...q.quizOptions.map((o) => o.label)]).filter((t) => t.length >= 6);
}

describe("the admin's score is the score that counts", () => {
  it("every reader agrees on the manual score", async () => {
    const { quizId, title } = await onlineQuiz();
    await gradedAttempt(quizId, f.ownStudentId, 9);
    expect((await putScore(quizId, f.ownStudentId, { score: 4, notes: null })).status).toBe(200);

    const d = await detail(quizId);
    expect(d.status).toBe(200);
    expect(d.body.data).toMatchObject({ stage: "graded", totalScore: 4, adminScore: { score: 4, notes: null } });

    const { row } = await listRow(quizId);
    expect(row).toMatchObject({ score: 4, adminScore: { score: 4, notes: null } });

    const page = await grading(quizId);
    const item = page.items.find((i: { studentUserId: number }) => i.studentUserId === f.ownStudentId);
    expect(item).toMatchObject({ bestScore: 4, totalScore: 9, adminScore: { score: 4, notes: null } });
    expect(item.adminScore.gradedByName).toBe("Test admin");
    expect(typeof item.adminScore.gradedAt).toBe("string");

    const book = (await buildSeasonWorkbook(f.seasonId))!;
    expect(gradesCell(book.workbook, title, "Test student")).toBe(4);

    expect(await recordScore(quizId)).toBe(4);
  });

  it("clearing returns to the best attempt", async () => {
    const graded = await onlineQuiz();
    await gradedAttempt(graded.quizId, f.ownStudentId, 9);
    await putScore(graded.quizId, f.ownStudentId, { score: 4, notes: "Paper copy." });
    expect((await clearScore(graded.quizId, f.ownStudentId)).status).toBe(204);
    expect((await detail(graded.quizId)).body.data).toMatchObject({ stage: "graded", totalScore: 9, adminScore: null });
    expect((await listRow(graded.quizId)).row).toMatchObject({ score: 9, adminScore: null });
    const item = (await grading(graded.quizId)).items[0];
    expect(item).toMatchObject({ bestScore: 9, adminScore: null });
    expect(await recordScore(graded.quizId)).toBe(9);

    const untaken = await onlineQuiz();
    await putScore(untaken.quizId, f.ownStudentId, { score: 4, notes: null });
    await clearScore(untaken.quizId, f.ownStudentId);
    expect((await detail(untaken.quizId)).body.data).toMatchObject({ stage: "not_started", totalScore: null });
    expect((await listRow(untaken.quizId)).row).toMatchObject({ score: null, adminScore: null });

    const waiting = await onlineQuiz();
    await db.quizAttempt.create({
      data: { quizId: waiting.quizId, studentUserId: f.ownStudentId, attemptNumber: 1, shuffleSeed: 1 },
    });
    await setLatestAttempt(waiting.quizId, f.ownStudentId, { status: "SUBMITTED" });
    await putScore(waiting.quizId, f.ownStudentId, { score: 4, notes: null });
    expect((await detail(waiting.quizId)).body.data).toMatchObject({ stage: "graded", totalScore: 4 });
    await clearScore(waiting.quizId, f.ownStudentId);
    expect((await detail(waiting.quizId)).body.data).toMatchObject({ stage: "submitted", totalScore: null });
  });

  it("manual score alone never reaches the answers stage", async () => {
    const { quizId } = await onlineQuiz(true);
    await putScore(quizId, f.ownStudentId, { score: 6, notes: "Taken on paper." });

    const d = await detail(quizId);
    expect(d.body.data).toMatchObject({ stage: "graded", answersReleased: true, totalScore: 6, questions: [] });
    const { raw: listRaw } = await listRow(quizId);
    for (const raw of [d.text, listRaw]) {
      for (const text of await keyTextOf(quizId)) expect(raw).not.toContain(text);
      expect(raw).not.toContain("isCorrect");
      expect(raw).not.toContain("matchId");
      expect(raw).not.toContain("expected");
      expect(raw).not.toContain("review");
    }
  });

  it("start is refused once a manual score exists", async () => {
    const { quizId } = await onlineQuiz();
    await putScore(quizId, f.ownStudentId, { score: 5, notes: null });
    const res = await request(app).put(`/api/v1/quizzes/${quizId}/attempt`).set(bearer(f.studentToken));
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({
      code: "manual_score_entered",
      message: "Your admin has entered your score for this quiz.",
    });
    expect(await db.quizAttempt.count({ where: { quizId } })).toBe(0);
  });

  it("a start racing a score being saved waits for it, then is refused", async () => {
    const { quizId } = await onlineQuiz();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let locked: () => void = () => undefined;
    const holding = new Promise<void>((resolve) => (locked = resolve));
    // The save's own lock order (lib/quizzes/student-lock.ts), held open until the start is waiting.
    const save = db.$transaction(
      async (tx) => {
        await lockStudentInQuiz(tx, quizId, f.ownStudentId);
        await tx.quizGrade.create({ data: { quizId, studentUserId: f.ownStudentId, score: 5, gradedAt: new Date() } });
        locked();
        await gate;
      },
      { timeout: 20000 },
    );
    await holding;
    const start = request(app)
      .put(`/api/v1/quizzes/${quizId}/attempt`)
      .set(bearer(f.studentToken))
      .then((r) => r);
    await new Promise((resolve) => setTimeout(resolve, 500));
    release();
    await save;
    const res = await start;
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("manual_score_entered");
    expect(await db.quizAttempt.count({ where: { quizId } })).toBe(0);
  });

  it("a retake is refused once a manual score exists, and so is starting one opened before it", async () => {
    const { quizId } = await onlineQuiz();
    await gradedAttempt(quizId, f.ownStudentId, 9);
    await putScore(quizId, f.ownStudentId, { score: 4, notes: null });
    const reopen = await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/reopen`)
      .set(bearer(f.adminToken))
      .send({ studentUserId: f.ownStudentId });
    expect(reopen.status).toBe(409);
    expect(reopen.body.error).toEqual({
      code: "manual_score_entered",
      message: "The admin has entered this student's score. Clear it to allow a retake.",
    });
    expect(await db.quizAttempt.count({ where: { quizId } })).toBe(1);

    // A retake opened before the score (the order the locks allow): its start PUT is refused.
    await clearScore(quizId, f.ownStudentId);
    const reopened = await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/reopen`)
      .set(bearer(f.adminToken))
      .send({ studentUserId: f.ownStudentId });
    expect(reopened.status).toBe(201);
    await db.quizGrade.create({
      data: { quizId, studentUserId: f.ownStudentId, score: 4, gradedAt: new Date() },
    });
    const start = await request(app).put(`/api/v1/quizzes/${quizId}/attempt`).set(bearer(f.studentToken));
    expect(start.status).toBe(409);
    expect(start.body.error).toEqual({
      code: "manual_score_entered",
      message: "Your admin has entered your score for this quiz.",
    });
  });

  it("the student sees the admin's note", async () => {
    const { quizId } = await onlineQuiz();
    await putScore(quizId, f.ownStudentId, { score: 7.5, notes: "Taken on paper after the phone died." });
    const note = { score: 7.5, notes: "Taken on paper after the phone died." };
    expect((await detail(quizId)).body.data.adminScore).toEqual(note);
    expect((await listRow(quizId)).row.adminScore).toEqual(note);
  });

  it("a student with only an admin score is a waiting row carrying it, and counts as graded once", async () => {
    const { quizId } = await onlineQuiz();
    await putScore(quizId, f.ownStudentId, { score: 3, notes: null });
    const page = await grading(quizId);
    const row = page.waiting.find((w: { studentUserId: number }) => w.studentUserId === f.ownStudentId);
    expect(row.adminScore).toMatchObject({ score: 3, notes: null, gradedByName: "Test admin" });
    const other = page.waiting.find((w: { studentUserId: number }) => w.studentUserId === f.otherGroupStudentId);
    expect(other.adminScore).toBeNull();

    const counted = async () => {
      const res = await request(app).get(`/api/v1/quizzes?seasonId=${f.seasonId}`).set(bearer(f.adminToken));
      return res.body.data.items.find((q: { id: number }) => q.id === quizId).gradedCount;
    };
    expect(await counted()).toBe(1);
    // Also graded in the app: still one student.
    await clearScore(quizId, f.ownStudentId);
    await gradedAttempt(quizId, f.ownStudentId, 9);
    await putScore(quizId, f.ownStudentId, { score: 3, notes: null });
    expect(await counted()).toBe(1);
  });
});

describe("the admin's score freezes the questions", () => {
  it("refuses a question edit once a score exists, and shows the builder as locked", async () => {
    const { quizId } = await onlineQuiz();
    await putScore(quizId, f.ownStudentId, { score: 5, notes: null });
    const question = await db.quizQuestion.findFirstOrThrow({ where: { quizId }, select: { id: true } });

    const removed = await request(app)
      .delete(`/api/v1/quizzes/${quizId}/questions/${question.id}`)
      .set(bearer(f.adminToken));
    expect(removed.status).toBe(409);
    expect(removed.body.error.code).toBe("quiz_has_attempts");
    expect(await db.quizQuestion.count({ where: { quizId } })).toBe(3);
    expect((await db.quiz.findUniqueOrThrow({ where: { id: quizId } })).maxScore).toBe(10);

    const authoring = await request(app).get(`/api/v1/quizzes/${quizId}`).set(bearer(f.adminToken));
    expect(authoring.body.data.canEditStructure).toBe(false);

    await clearScore(quizId, f.ownStudentId);
    const after = await request(app).get(`/api/v1/quizzes/${quizId}`).set(bearer(f.adminToken));
    expect(after.body.data.canEditStructure).toBe(true);
  });
});
