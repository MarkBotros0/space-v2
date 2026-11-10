import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { addQuizQuestion } from "../../lib/quizzes/questions";
import { cleanupTestData } from "./fixtures";
import { seedQuizFixtures } from "./quizzes-setup";

jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let sessionId: number;
let ownStudentId: number;
let adminToken: string;

beforeAll(async () => {
  ({ seasonId, sessionId, ownStudentId, adminToken } = await seedQuizFixtures(app));
});

afterAll(async () => {
  await cleanupTestData();
});

/** A valid single-choice request: "a" wrong, "b" right. */
const choice = (prompt: string, points: number) => ({
  type: "SINGLE_CHOICE" as const,
  prompt,
  points,
  options: [
    { label: "a", isCorrect: false },
    { label: "b", isCorrect: true },
  ],
});

describe("publish / unpublish", () => {
  it("refuses to publish with no questions, or with a question that has no correct answer (R28, R29)", async () => {
    const quiz = await db.quiz.create({
      data: { seasonId, sessionId, title: "Empty", kind: "ONLINE", maxScore: 0 },
      select: { id: true },
    });
    const empty = await request(app)
      .post(`/api/v1/quizzes/${quiz.id}/publish`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ publish: true });
    expect(empty.status).toBe(409);
    expect(empty.body.error.code).toBe("no_questions");

    // Written straight to the database: a single-choice question with no
    // correct option. The schema stops this at the question write, but the
    // publish check re-validates by type against the stored rows.
    const broken = await db.quizQuestion.create({
      data: { quizId: quiz.id, order: 0, type: "SINGLE_CHOICE", prompt: "Broken", points: 1 },
      select: { id: true },
    });
    await db.quizOption.createMany({
      data: [
        { questionId: broken.id, position: 0, label: "a" },
        { questionId: broken.id, position: 1, label: "b" },
      ],
    });
    const bad = await request(app)
      .post(`/api/v1/quizzes/${quiz.id}/publish`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ publish: true });
    expect(bad.status).toBe(409);
    expect(bad.body.error.code).toBe("mcq_without_answer");
  });

  it("publishes and unpublishes a clean quiz", async () => {
    const quiz = await db.quiz.create({
      data: { seasonId, sessionId, title: "Publishable", kind: "ONLINE", maxScore: 0 },
      select: { id: true },
    });
    await addQuizQuestion(quiz.id, choice("Pick", 1));

    const on = await request(app)
      .post(`/api/v1/quizzes/${quiz.id}/publish`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ publish: true });
    expect(on.status).toBe(200);
    expect(on.body.data.publishedAt).not.toBeNull();

    const off = await request(app)
      .post(`/api/v1/quizzes/${quiz.id}/publish`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ publish: false });
    expect(off.status).toBe(200);
    expect(off.body.data.publishedAt).toBeNull();
  });

  it("refuses to unpublish once an attempt has been graded (spec D4)", async () => {
    const quiz = await db.quiz.create({
      data: { seasonId, sessionId, title: "Live", kind: "ONLINE", maxScore: 1, publishedAt: new Date() },
      select: { id: true },
    });
    await addQuizQuestion(quiz.id, choice("Pick", 1));
    await db.quizAttempt.create({
      data: {
        quizId: quiz.id,
        studentUserId: ownStudentId,
        attemptNumber: 1,
        status: "GRADED",
        autoScore: 1,
        manualScore: 0,
        totalScore: 1,
        submittedAt: new Date(),
        gradedAt: new Date(),
      },
    });

    const res = await request(app)
      .post(`/api/v1/quizzes/${quiz.id}/publish`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ publish: false });
    // v1's unpublish ran no validation at all (R30) and both student reads
    // filter on publishedAt (R32, R37), so a graded student lost their own
    // result with no trace — and the notification they had already received
    // linked to a list the quiz was no longer in (R40, R118).
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("quiz_has_graded_attempts");
  });

  it("refuses publishing a PAPER quiz", async () => {
    const paper = await db.quiz.create({
      data: { seasonId, sessionId, title: "Paper", kind: "PAPER", maxScore: 10 },
      select: { id: true },
    });
    const res = await request(app)
      .post(`/api/v1/quizzes/${paper.id}/publish`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ publish: true });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("wrong_quiz_kind");
  });
});
