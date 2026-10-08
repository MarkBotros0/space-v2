import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

// Same reason as the submissions suite: the shared Neon staging Postgres
// autosuspends, and the first query after idling has been measured at ~18s.
jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let otherSeasonId: number;
let sessionId: number;
let ownStudentId: number;
let otherGroupStudentId: number;
let superToken: string;
let adminToken: string;
let otherAdminToken: string;
let leaderToken: string;
let studentToken: string;
let paperQuizId: number;

beforeAll(async () => {
  await cleanupTestData();

  const season = await createTestSeason();
  seasonId = season.id;
  const otherSeason = await createTestSeason();
  otherSeasonId = otherSeason.id;

  const superUser = await createTestUser("super", "SUPER");
  const admin = await createTestUser("admin", "ADMIN");
  const otherAdmin = await createTestUser("otheradmin", "ADMIN");
  const leader = await createTestUser("leader", "LEADER");
  const student = await createTestUser("student", "STUDENT");
  const otherStudent = await createTestUser("otherstudent", "STUDENT");
  ownStudentId = student.id;
  otherGroupStudentId = otherStudent.id;

  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  // The D1 fixture: an ADMIN of a DIFFERENT season. v1 let this user write
  // grades into any season at all, because its season check ran only for LEADER.
  await db.seasonAdmin.create({ data: { seasonId: otherSeasonId, userId: otherAdmin.id } });

  const groupA = await db.group.create({
    data: {
      seasonId,
      name: "Group A",
      leaders: { create: { userId: leader.id } },
      students: { create: { studentUserId: student.id } },
    },
    select: { id: true },
  });
  const groupB = await db.group.create({
    data: { seasonId, name: "Group B" },
    select: { id: true },
  });

  // Ruling C9: membership for a season is the enrolment's groupId, not
  // GroupStudent (which is unique on studentUserId across the whole database).
  await db.seasonEnrollment.createMany({
    data: [
      { seasonId, studentUserId: student.id, groupId: groupA.id, status: "ACTIVE" },
      { seasonId, studentUserId: otherStudent.id, groupId: groupB.id, status: "ACTIVE" },
    ],
  });

  const session = await db.session.create({
    data: {
      seasonId,
      title: "Week 1",
      startsAt: new Date("2099-03-01T18:00:00.000Z"),
      durationMinutes: 90,
    },
    select: { id: true },
  });
  sessionId = session.id;

  superToken = await login(app, superUser.email);
  adminToken = await login(app, admin.email);
  otherAdminToken = await login(app, otherAdmin.email);
  leaderToken = await login(app, leader.email);
  studentToken = await login(app, student.email);
});

afterAll(async () => {
  await cleanupTestData();
});

describe("POST /api/v1/quizzes", () => {
  it("creates a PAPER quiz with the author's max score", async () => {
    const res = await request(app)
      .post("/api/v1/quizzes")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ seasonId, sessionId, title: "Paper quiz", kind: "PAPER", maxScore: 20 });

    expect(res.status).toBe(201);
    paperQuizId = res.body.data.id;
    const row = await db.quiz.findUnique({
      where: { id: paperQuizId },
      select: { maxScore: true, kind: true, createdById: true, publishedAt: true },
    });
    expect(row).toMatchObject({ maxScore: 20, kind: "PAPER", publishedAt: null });
    // R5/D13: the audit column v1 wrote and never read. Kept, and now read back
    // on the grading screen.
    expect(row?.createdById).not.toBeNull();
  });

  it("creates an ONLINE quiz at maxScore 0 and refuses a caller-supplied one", async () => {
    const refused = await request(app)
      .post("/api/v1/quizzes")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ seasonId, sessionId, title: "Online quiz", kind: "ONLINE", maxScore: 50 });
    expect(refused.status).toBe(400);

    const ok = await request(app)
      .post("/api/v1/quizzes")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ seasonId, sessionId, title: "Online quiz", kind: "ONLINE" });
    expect(ok.status).toBe(201);
    const row = await db.quiz.findUnique({
      where: { id: ok.body.data.id },
      select: { maxScore: true },
    });
    // Derived from question points from here on (R11).
    expect(row?.maxScore).toBe(0);
  });

  it("refuses a session that belongs to another season (R7)", async () => {
    const strayer = await db.session.create({
      data: {
        seasonId: otherSeasonId,
        title: "Elsewhere",
        startsAt: new Date("2099-03-02T18:00:00.000Z"),
        durationMinutes: 60,
      },
      select: { id: true },
    });
    const res = await request(app)
      .post("/api/v1/quizzes")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ seasonId, sessionId: strayer.id, title: "Mismatched", kind: "PAPER", maxScore: 10 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("session_not_in_season");
  });

  it("allows a session-less quiz (D12) — the column is nullable", async () => {
    const res = await request(app)
      .post("/api/v1/quizzes")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ seasonId, sessionId: null, title: "Season-level", kind: "PAPER", maxScore: 10 });
    expect(res.status).toBe(201);
  });

  it("refuses an admin of another season, a leader, and a student", async () => {
    const body = { seasonId, sessionId, title: "Nope", kind: "PAPER", maxScore: 10 };
    for (const token of [otherAdminToken, leaderToken, studentToken]) {
      const res = await request(app)
        .post("/api/v1/quizzes")
        .set("authorization", `Bearer ${token}`)
        .send(body);
      expect(res.status).toBe(403);
    }
  });

  it("lets SUPER create in any season", async () => {
    const res = await request(app)
      .post("/api/v1/quizzes")
      .set("authorization", `Bearer ${superToken}`)
      .send({ seasonId: otherSeasonId, sessionId: null, title: "Super", kind: "PAPER", maxScore: 5 });
    expect(res.status).toBe(201);
  });
});

describe("PATCH /api/v1/quizzes/:id", () => {
  it("renames a quiz", async () => {
    const res = await request(app)
      .patch(`/api/v1/quizzes/${paperQuizId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ title: "Paper quiz (renamed)" });
    expect(res.status).toBe(200);
    const row = await db.quiz.findUnique({ where: { id: paperQuizId }, select: { title: true } });
    expect(row?.title).toBe("Paper quiz (renamed)");
  });

  it("refuses maxScore on an ONLINE quiz, and on a PAPER quiz that has grades", async () => {
    const online = await db.quiz.create({
      data: { seasonId, sessionId, title: "Online", kind: "ONLINE", maxScore: 0 },
      select: { id: true },
    });
    const wrongKind = await request(app)
      .patch(`/api/v1/quizzes/${online.id}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ maxScore: 30 });
    expect(wrongKind.status).toBe(409);
    expect(wrongKind.body.error.code).toBe("wrong_quiz_kind");

    const graded = await db.quiz.create({
      data: { seasonId, sessionId, title: "Graded paper", kind: "PAPER", maxScore: 10 },
      select: { id: true },
    });
    await db.quizGrade.create({
      data: { quizId: graded.id, studentUserId: ownStudentId, score: 8, gradedAt: new Date() },
    });
    const rebase = await request(app)
      .patch(`/api/v1/quizzes/${graded.id}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ maxScore: 30 });
    // Moving the denominator under scores already awarded is R13's corruption
    // in its PAPER form. Refused, not silently applied.
    expect(rebase.status).toBe(409);
    expect(rebase.body.error.code).toBe("quiz_has_grades");
  });

  it("never accepts kind", async () => {
    const res = await request(app)
      .patch(`/api/v1/quizzes/${paperQuizId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ kind: "ONLINE" });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/quizzes", () => {
  it("lists a season's quizzes for staff with one server-side graded count", async () => {
    const res = await request(app)
      .get(`/api/v1/quizzes?seasonId=${seasonId}`)
      .set("authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const row = res.body.data.items.find((q: { id: number }) => q.id === paperQuizId);
    expect(row).toBeTruthy();
    // Two ACTIVE enrolments in this season; an admin sees both (R106).
    expect(row.studentCount).toBe(2);
    expect(row.gradedCount).toBe(0);
    expect(row.seasonCode).toBeTruthy();
  });

  it("narrows a leader's counts to their own group (R108/R110)", async () => {
    const res = await request(app)
      .get(`/api/v1/quizzes?seasonId=${seasonId}`)
      .set("authorization", `Bearer ${leaderToken}`);
    expect(res.status).toBe(200);
    const row = res.body.data.items.find((q: { id: number }) => q.id === paperQuizId);
    // Group A holds one student; Group B's is another leader's problem.
    expect(row.studentCount).toBe(1);
  });

  it("serves a STUDENT their own results, never the staff row shape", async () => {
    await db.quizGrade.upsert({
      where: { quizId_studentUserId: { quizId: paperQuizId, studentUserId: ownStudentId } },
      create: {
        quizId: paperQuizId, studentUserId: ownStudentId, score: 15,
        notes: "Nice work.", gradedAt: new Date(),
      },
      update: { score: 15, notes: "Nice work.", gradedAt: new Date() },
    });

    const res = await request(app)
      .get(`/api/v1/quizzes?seasonId=${seasonId}`)
      .set("authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    const row = res.body.data.items.find((q: { quizId: number }) => q.quizId === paperQuizId);
    expect(row).toMatchObject({ score: 15, notes: "Nice work.", kind: "PAPER" });
    // The staff shape's fields must not exist on a student's row at all.
    expect(row.gradedCount).toBeUndefined();
    expect(row.studentCount).toBeUndefined();
  });

  it("keeps the other group's student enrolled — the fixture every scope test rests on", async () => {
    // Group B's student is what makes the leader's studentCount of 1 meaningful
    // and what Tasks 5 and 6 use as the out-of-scope target. Asserted here so
    // the binding is real rather than an unused variable.
    const enrolment = await db.seasonEnrollment.findUnique({
      where: { studentUserId_seasonId: { studentUserId: otherGroupStudentId, seasonId } },
      select: { groupId: true },
    });
    expect(enrolment?.groupId).not.toBeNull();
  });

  it("refuses a season the caller has no staff scope in", async () => {
    const res = await request(app)
      .get(`/api/v1/quizzes?seasonId=${otherSeasonId}`)
      .set("authorization", `Bearer ${leaderToken}`);
    expect(res.status).toBe(403);
  });
});

describe("question authoring", () => {
  let quizId: number;

  beforeEach(async () => {
    const quiz = await db.quiz.create({
      data: { seasonId, sessionId, title: "Authoring", kind: "ONLINE", maxScore: 0 },
      select: { id: true },
    });
    quizId = quiz.id;
  });

  it("adds a question, orders it at the end, and recomputes maxScore (R11, R20)", async () => {
    const first = await request(app)
      .post(`/api/v1/quizzes/${quizId}/questions`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ type: "MCQ", prompt: "Capital of France?", points: 2,
        options: ["London", "Paris"], correctIndex: 1 });
    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({ order: 0, correctIndex: 1, points: 2 });

    const second = await request(app)
      .post(`/api/v1/quizzes/${quizId}/questions`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ type: "ESSAY", prompt: "Discuss the reading.", points: 5,
        options: [], correctIndex: null });
    expect(second.status).toBe(201);
    expect(second.body.data).toMatchObject({ order: 1, options: [], correctIndex: null });

    const quiz = await db.quiz.findUnique({ where: { id: quizId }, select: { maxScore: true } });
    expect(quiz?.maxScore).toBe(7);
  });

  it("renumbers survivors on delete instead of leaving order sparse (R21)", async () => {
    const ids: number[] = [];
    for (const prompt of ["One", "Two", "Three"]) {
      const res = await request(app)
        .post(`/api/v1/quizzes/${quizId}/questions`)
        .set("authorization", `Bearer ${adminToken}`)
        .send({ type: "ESSAY", prompt, points: 1, options: [], correctIndex: null });
      ids.push(res.body.data.id);
    }

    const del = await request(app)
      .delete(`/api/v1/quizzes/${quizId}/questions/${ids[1]}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(del.status).toBe(200);

    const rows = await db.quizQuestion.findMany({
      where: { quizId }, orderBy: { order: "asc" }, select: { prompt: true, order: true },
    });
    // v1 left gaps (0, 2, ...) because nothing renumbered; harmless for display
    // but it made `order` a label rather than a position, which a reorder
    // endpoint cannot live with.
    expect(rows.map((r) => r.order)).toEqual([0, 1]);
    expect(rows.map((r) => r.prompt)).toEqual(["One", "Three"]);
    const quiz = await db.quiz.findUnique({ where: { id: quizId }, select: { maxScore: true } });
    expect(quiz?.maxScore).toBe(2);
  });

  it("reorders by an explicit permutation and refuses anything else", async () => {
    const ids: number[] = [];
    for (const prompt of ["One", "Two", "Three"]) {
      const res = await request(app)
        .post(`/api/v1/quizzes/${quizId}/questions`)
        .set("authorization", `Bearer ${adminToken}`)
        .send({ type: "ESSAY", prompt, points: 1, options: [], correctIndex: null });
      ids.push(res.body.data.id);
    }

    const ok = await request(app)
      .put(`/api/v1/quizzes/${quizId}/questions/order`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ questionIds: [ids[2], ids[0], ids[1]] });
    expect(ok.status).toBe(200);
    expect(ok.body.data.questions.map((q: { prompt: string }) => q.prompt)).toEqual([
      "Three", "One", "Two",
    ]);

    const partial = await request(app)
      .put(`/api/v1/quizzes/${quizId}/questions/order`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ questionIds: [ids[0]] });
    expect(partial.status).toBe(400);
    expect(partial.body.error.code).toBe("invalid_order");
  });

  it("refuses every structural write once an attempt exists (spec D3)", async () => {
    const q = await request(app)
      .post(`/api/v1/quizzes/${quizId}/questions`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ type: "MCQ", prompt: "Pick", points: 2, options: ["a", "b"], correctIndex: 0 });
    const questionId = q.body.data.id;

    await request(app)
      .post(`/api/v1/quizzes/${quizId}/publish`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ publish: true });
    await db.quizAttempt.create({
      data: { quizId, studentUserId: ownStudentId, attemptNumber: 1 },
    });

    const add = await request(app)
      .post(`/api/v1/quizzes/${quizId}/questions`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ type: "ESSAY", prompt: "Late addition", points: 1, options: [], correctIndex: null });
    const edit = await request(app)
      .patch(`/api/v1/quizzes/${quizId}/questions/${questionId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ type: "MCQ", prompt: "Rewritten", points: 9, options: ["a", "b"], correctIndex: 1 });
    const remove = await request(app)
      .delete(`/api/v1/quizzes/${quizId}/questions/${questionId}`)
      .set("authorization", `Bearer ${adminToken}`);
    const reorder = await request(app)
      .put(`/api/v1/quizzes/${quizId}/questions/order`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ questionIds: [questionId] });

    // Three compounding v1 rules die here: R22 (edit a live quiz freely),
    // R13 (maxScore rebased under graded attempts), R23 (deleting a question
    // cascade-deletes QuizAnswer rows on GRADED attempts while their scores
    // keep the points those answers earned). Nothing versions or snapshots a
    // quiz, so refusing is the only honest option inside the frozen schema (C1).
    for (const res of [add, edit, remove, reorder]) {
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("quiz_has_attempts");
    }
  });

  it("refuses a question on a PAPER quiz (R25)", async () => {
    const paper = await db.quiz.create({
      data: { seasonId, sessionId, title: "Paper", kind: "PAPER", maxScore: 10 },
      select: { id: true },
    });
    const res = await request(app)
      .post(`/api/v1/quizzes/${paper.id}/questions`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ type: "ESSAY", prompt: "Nope", points: 1, options: [], correctIndex: null });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("wrong_quiz_kind");
  });

  it("refuses a leader — authoring is admin-only (R15)", async () => {
    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/questions`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ type: "ESSAY", prompt: "Nope", points: 1, options: [], correctIndex: null });
    expect(res.status).toBe(403);
  });

  it("refuses a question id from another quiz (R50 at the authoring edge)", async () => {
    const other = await db.quiz.create({
      data: { seasonId, sessionId, title: "Other", kind: "ONLINE", maxScore: 0 },
      select: { id: true },
    });
    const stray = await db.quizQuestion.create({
      data: { quizId: other.id, order: 0, type: "ESSAY", prompt: "Elsewhere", points: 1,
        options: [], correctIndex: null },
      select: { id: true },
    });
    const res = await request(app)
      .patch(`/api/v1/quizzes/${quizId}/questions/${stray.id}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ type: "ESSAY", prompt: "Hijack", points: 1, options: [], correctIndex: null });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("question_not_in_quiz");
  });
});

describe("publish / unpublish", () => {
  it("refuses to publish with no questions, or with an unanswerable MCQ (R28, R29)", async () => {
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

    // Written straight to the database: an MCQ whose correctIndex points past
    // the end of its options. R18 stops this at the question write, but R24's
    // positional key means an option edit can produce it later, which is
    // exactly why v1 re-checked at publish.
    await db.quizQuestion.create({
      data: { quizId: quiz.id, order: 0, type: "MCQ", prompt: "Broken", points: 1,
        options: ["a", "b"], correctIndex: 5 },
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
    await db.quizQuestion.create({
      data: { quizId: quiz.id, order: 0, type: "MCQ", prompt: "Pick", points: 1,
        options: ["a", "b"], correctIndex: 0 },
    });

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
      data: { seasonId, sessionId, title: "Live", kind: "ONLINE", maxScore: 1,
        publishedAt: new Date() },
      select: { id: true },
    });
    await db.quizQuestion.create({
      data: { quizId: quiz.id, order: 0, type: "MCQ", prompt: "Pick", points: 1,
        options: ["a", "b"], correctIndex: 0 },
    });
    await db.quizAttempt.create({
      data: { quizId: quiz.id, studentUserId: ownStudentId, attemptNumber: 1,
        status: "GRADED", autoScore: 1, manualScore: 0, totalScore: 1,
        submittedAt: new Date(), gradedAt: new Date() },
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

/**
 * QUIZ_GRADED rows for the suite's student. v1's link for this type is the
 * bare list path `/student/quizzes` (ruling X1), so a row cannot be tied to
 * one quiz by its link — and every quiz in this file grades the same
 * `ownStudentId`, while notifications are only cleaned in beforeAll/afterAll.
 * So every notification assertion in Tasks 4–6 is a DELTA from a baseline
 * taken inside the same test, never an absolute count. The suite runs
 * --runInBand and `ownStudentId` belongs to this file alone, so nothing else
 * writes these rows mid-test. (Tasks 5 and 6 append below and reuse this.)
 */
async function quizGradedCount(): Promise<number> {
  return db.notification.count({
    where: { userId: ownStudentId, type: "QUIZ_GRADED", link: "/student/quizzes" },
  });
}

describe("GET /api/v1/quizzes/:id and the attempt lifecycle", () => {
  let onlineQuizId: number;
  let mcqId: number;
  let essayId: number;

  async function buildPublishedQuiz(opts: { withEssay: boolean }) {
    const quiz = await db.quiz.create({
      data: { seasonId, sessionId, title: "Runner quiz", kind: "ONLINE", maxScore: 0 },
      select: { id: true },
    });
    const mcq = await db.quizQuestion.create({
      data: {
        quizId: quiz.id, order: 0, type: "MCQ",
        prompt: "Capital of France?", points: 2,
        options: ["London", "Paris"], correctIndex: 1,
      },
      select: { id: true },
    });
    let essay = { id: 0 };
    if (opts.withEssay) {
      essay = await db.quizQuestion.create({
        data: {
          quizId: quiz.id, order: 1, type: "ESSAY",
          prompt: "Discuss the reading.", points: 5, options: [], correctIndex: null,
        },
        select: { id: true },
      });
    }
    await db.quiz.update({
      where: { id: quiz.id },
      data: { maxScore: opts.withEssay ? 7 : 2, publishedAt: new Date() },
    });
    return { quizId: quiz.id, mcqId: mcq.id, essayId: essay.id };
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
  it("never lets the answer key reach a student, at the raw-JSON level", async () => {
    const res = await request(app)
      .get(`/api/v1/quizzes/${onlineQuizId}`)
      .set("authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain("correctIndex");
    // The value as well as the key: correctIndex is 1 here, and "Paris" is the
    // option it points at. The option list itself is legitimately present, so
    // the assertion is on the marker, not on the word.
    expect(res.body.data.questions[0]).not.toHaveProperty("correctIndex");
    expect(Object.keys(res.body.data.questions[0]).sort()).toEqual(
      ["id", "isCorrect", "options", "order", "pointsAwarded", "points", "prompt",
        "selectedIndex", "text", "type"].sort(),
    );

    // ...and the same guarantee on the two other student-facing responses.
    const started = await request(app)
      .put(`/api/v1/quizzes/${onlineQuizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(JSON.stringify(started.body)).not.toContain("correctIndex");

    const list = await request(app)
      .get(`/api/v1/quizzes?seasonId=${seasonId}`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(JSON.stringify(list.body)).not.toContain("correctIndex");
  });

  it("serves staff the authoring shape from the same path", async () => {
    const res = await request(app)
      .get(`/api/v1/quizzes/${onlineQuizId}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.questions[0].correctIndex).toBe(1);
    expect(res.body.data.canEditStructure).toBe(true);
    expect(res.body.data.canManage).toBe(true);
  });

  it("gives a leader the authoring shape but no manage rights", async () => {
    const res = await request(app)
      .get(`/api/v1/quizzes/${onlineQuizId}`)
      .set("authorization", `Bearer ${leaderToken}`);
    // A leader grades, and grading needs the key (R103) — same audience v1's
    // essay grader served it to.
    expect(res.status).toBe(200);
    expect(res.body.data.questions[0].correctIndex).toBe(1);
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

    const asAdmin = await request(app)
      .get(`/api/v1/quizzes/${draft.id}`)
      .set("authorization", `Bearer ${adminToken}`);
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
    await request(app)
      .get(`/api/v1/quizzes/${onlineQuizId}`)
      .set("authorization", `Bearer ${studentToken}`);
    const rows = await db.quizAttempt.count({ where: { quizId: onlineQuizId } });
    expect(rows).toBe(0);
  });

  it("saves a batch of answers and refuses a closed attempt", async () => {
    await request(app)
      .put(`/api/v1/quizzes/${onlineQuizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`);

    const save = await request(app)
      .patch(`/api/v1/quizzes/${onlineQuizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({
        answers: [
          { questionId: mcqId, selectedIndex: 1, text: null },
          { questionId: essayId, selectedIndex: null, text: "Because." },
        ],
      });
    expect(save.status).toBe(200);
    expect(save.body.data.saved).toBe(2);

    // Saving twice is an upsert on (attemptId, questionId) — one row per
    // question per attempt (R53), and no grading happens on save (R54).
    const again = await request(app)
      .patch(`/api/v1/quizzes/${onlineQuizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ answers: [{ questionId: mcqId, selectedIndex: 0, text: null }] });
    expect(again.status).toBe(200);
    const answers = await db.quizAnswer.findMany({
      where: { question: { quizId: onlineQuizId } },
      select: { questionId: true, selectedIndex: true, isCorrect: true, pointsAwarded: true },
    });
    expect(answers).toHaveLength(2);
    expect(answers.every((a) => a.isCorrect === null && a.pointsAwarded === null)).toBe(true);
  });

  it("bounds selectedIndex against THIS question's options, not a constant (R51)", async () => {
    await request(app)
      .put(`/api/v1/quizzes/${onlineQuizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`);
    const res = await request(app)
      .patch(`/api/v1/quizzes/${onlineQuizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`)
      // The MCQ has 2 options. v1's schema allowed 0-5 and checked nothing, so
      // an out-of-range index stored fine and simply scored 0 later.
      .send({ answers: [{ questionId: mcqId, selectedIndex: 4, text: null }] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("answer_out_of_range");
  });

  it("refuses a value of the wrong shape for the question type (R52)", async () => {
    await request(app)
      .put(`/api/v1/quizzes/${onlineQuizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`);
    const res = await request(app)
      .patch(`/api/v1/quizzes/${onlineQuizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ answers: [{ questionId: essayId, selectedIndex: 1, text: null }] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("wrong_answer_type");
  });

  it("refuses a question from another quiz (R50)", async () => {
    await request(app)
      .put(`/api/v1/quizzes/${onlineQuizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`);
    const other = await buildPublishedQuiz({ withEssay: false });
    const res = await request(app)
      .patch(`/api/v1/quizzes/${onlineQuizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ answers: [{ questionId: other.mcqId, selectedIndex: 0, text: null }] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("question_not_in_quiz");
  });

  it("refuses a submit with any question unanswered (R59)", async () => {
    await request(app)
      .put(`/api/v1/quizzes/${onlineQuizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`);
    await request(app)
      .patch(`/api/v1/quizzes/${onlineQuizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ answers: [{ questionId: mcqId, selectedIndex: 1, text: null }] });

    const res = await request(app)
      .post(`/api/v1/quizzes/${onlineQuizId}/attempt/submit`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("attempt_incomplete");
  });

  it("submits a mixed quiz to SUBMITTED with autoScore only (R63)", async () => {
    const before = await quizGradedCount();
    await request(app)
      .put(`/api/v1/quizzes/${onlineQuizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`);
    await request(app)
      .patch(`/api/v1/quizzes/${onlineQuizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({
        answers: [
          { questionId: mcqId, selectedIndex: 1, text: null },
          { questionId: essayId, selectedIndex: null, text: "Because." },
        ],
      });

    const res = await request(app)
      .post(`/api/v1/quizzes/${onlineQuizId}/attempt/submit`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("SUBMITTED");
    // The student sees no score yet — an essay is waiting for a human.
    expect(res.body.data.totalScore).toBeNull();

    const attempt = await db.quizAttempt.findFirst({
      where: { quizId: onlineQuizId, studentUserId: ownStudentId },
      select: { autoScore: true, manualScore: true, totalScore: true, submittedAt: true },
    });
    expect(attempt).toMatchObject({ autoScore: 2, manualScore: null, totalScore: null });
    expect(attempt?.submittedAt).not.toBeNull();

    // R65: the essay path notifies nobody — there is nothing graded to tell them about.
    expect((await quizGradedCount()) - before).toBe(0);
  });

  it("auto-grades an all-MCQ quiz, all-or-nothing, and notifies once (R60, R64, R65)", async () => {
    const built = await buildPublishedQuiz({ withEssay: false });
    const before = await quizGradedCount();
    await request(app)
      .put(`/api/v1/quizzes/${built.quizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`);
    await request(app)
      .patch(`/api/v1/quizzes/${built.quizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ answers: [{ questionId: built.mcqId, selectedIndex: 0, text: null }] });

    const res = await request(app)
      .post(`/api/v1/quizzes/${built.quizId}/attempt/submit`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("GRADED");
    // Wrong answer: full points or nothing — no partial credit anywhere (R60).
    expect(res.body.data.totalScore).toBe(0);
    expect(res.body.data.questions[0].isCorrect).toBe(false);
    // R34: the student learns WHICH question was wrong, never what was right.
    expect(JSON.stringify(res.body)).not.toContain("correctIndex");

    const attempt = await db.quizAttempt.findFirst({
      where: { quizId: built.quizId, studentUserId: ownStudentId },
      select: { manualScore: true, gradedAt: true, gradedById: true },
    });
    // R64: gradedById stays null on the auto path — nobody graded it.
    expect(attempt).toMatchObject({ manualScore: 0, gradedById: null });
    expect(attempt?.gradedAt).not.toBeNull();

    // Exactly one new row, carrying v1's link (ruling X1 — v1's three sites all
    // write the bare list path; the row is still rendered by v1 today).
    expect((await quizGradedCount()) - before).toBe(1);
  });

  it("scores exactly once when submits race, and a save never lands after scoring (REG-111)", async () => {
    const built = await buildPublishedQuiz({ withEssay: false });
    const before = await quizGradedCount();
    await request(app)
      .put(`/api/v1/quizzes/${built.quizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`);
    await request(app)
      .patch(`/api/v1/quizzes/${built.quizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ answers: [{ questionId: built.mcqId, selectedIndex: 1, text: null }] });

    const results = await Promise.all([
      ...[0, 1, 2, 3].map(() =>
        request(app)
          .post(`/api/v1/quizzes/${built.quizId}/attempt/submit`)
          .set("authorization", `Bearer ${studentToken}`),
      ),
      request(app)
        .patch(`/api/v1/quizzes/${built.quizId}/attempt`)
        .set("authorization", `Bearer ${studentToken}`)
        .send({ answers: [{ questionId: built.mcqId, selectedIndex: 0, text: null }] }),
    ]);
    const submits = results.slice(0, 4);
    expect(submits.filter((r) => r.status === 200)).toHaveLength(1);
    expect(submits.filter((r) => r.status === 409)).toHaveLength(3);
    expect((await quizGradedCount()) - before).toBe(1);

    // Whatever order the lock serialised them in, the stored answer and the
    // stored score agree: nothing was saved after scoring without being scored.
    const attempt = await db.quizAttempt.findFirst({
      where: { quizId: built.quizId, studentUserId: ownStudentId },
      select: { id: true, totalScore: true },
    });
    const answer = await db.quizAnswer.findFirst({
      where: { attemptId: attempt?.id },
      select: { isCorrect: true, pointsAwarded: true },
    });
    expect(answer?.isCorrect).not.toBeNull();
    expect(attempt?.totalScore).toBe(answer?.pointsAwarded);
  });

  it("a save that was waiting on the attempt lock is refused once the attempt closes (REG-111)", async () => {
    const built = await buildPublishedQuiz({ withEssay: false });
    await request(app)
      .put(`/api/v1/quizzes/${built.quizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`);
    await request(app)
      .patch(`/api/v1/quizzes/${built.quizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ answers: [{ questionId: built.mcqId, selectedIndex: 1, text: null }] });
    const attempt = await db.quizAttempt.findFirstOrThrow({
      where: { quizId: built.quizId, studentUserId: ownStudentId },
      select: { id: true },
    });

    // Hold the attempt row ourselves: the save passes its cheap IN_PROGRESS
    // pre-check, then must queue on the lock. We close the attempt before
    // releasing it, so only a save that re-reads the status under the lock
    // can notice.
    let waiting: Promise<request.Response> | undefined;
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "QuizAttempt" WHERE "id" = ${attempt.id} FOR UPDATE`;
      waiting = Promise.resolve(
        request(app)
          .patch(`/api/v1/quizzes/${built.quizId}/attempt`)
          .set("authorization", `Bearer ${studentToken}`)
          .send({ answers: [{ questionId: built.mcqId, selectedIndex: 0, text: null }] }),
      );
      await new Promise((resolve) => setTimeout(resolve, 700));
      await tx.quizAttempt.update({ where: { id: attempt.id }, data: { status: "SUBMITTED" } });
    });

    const res = await waiting;
    expect(res?.status).toBe(409);
    expect(res?.body.error.code).toBe("attempt_closed");
    const stored = await db.quizAnswer.findFirstOrThrow({
      where: { attemptId: attempt.id },
      select: { selectedIndex: true },
    });
    expect(stored.selectedIndex).toBe(1);
  });

  it("refuses a second submit and a save after submit (R49, R58)", async () => {
    const built = await buildPublishedQuiz({ withEssay: false });
    await request(app)
      .put(`/api/v1/quizzes/${built.quizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`);
    await request(app)
      .patch(`/api/v1/quizzes/${built.quizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ answers: [{ questionId: built.mcqId, selectedIndex: 1, text: null }] });
    await request(app)
      .post(`/api/v1/quizzes/${built.quizId}/attempt/submit`)
      .set("authorization", `Bearer ${studentToken}`);

    const resubmit = await request(app)
      .post(`/api/v1/quizzes/${built.quizId}/attempt/submit`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(resubmit.status).toBe(409);
    expect(resubmit.body.error.code).toBe("attempt_closed");

    const lateSave = await request(app)
      .patch(`/api/v1/quizzes/${built.quizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ answers: [{ questionId: built.mcqId, selectedIndex: 0, text: null }] });
    expect(lateSave.status).toBe(409);
    expect(lateSave.body.error.code).toBe("attempt_closed");

    const restart = await request(app)
      .put(`/api/v1/quizzes/${built.quizId}/attempt`)
      .set("authorization", `Bearer ${studentToken}`);
    // R45: one attempt per student unless staff reopen it.
    expect(restart.status).toBe(409);
    expect(restart.body.error.code).toBe("attempt_closed");
  });

  it("refuses an attempt from staff and from a student outside the season", async () => {
    const staff = await request(app)
      .put(`/api/v1/quizzes/${onlineQuizId}/attempt`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(staff.status).toBe(403);

    const outsider = await createTestUser("outsider", "STUDENT");
    const outsiderToken = await login(app, outsider.email);
    const res = await request(app)
      .put(`/api/v1/quizzes/${onlineQuizId}/attempt`)
      .set("authorization", `Bearer ${outsiderToken}`);
    expect(res.status).toBe(403);
  });
});

describe("ONLINE grading", () => {
  let quizId: number;
  let mcqId: number;
  let essayId: number;
  let attemptId: number;

  beforeEach(async () => {
    const quiz = await db.quiz.create({
      data: {
        seasonId, sessionId, title: "Graded quiz", kind: "ONLINE",
        maxScore: 7, publishedAt: new Date(),
      },
      select: { id: true },
    });
    quizId = quiz.id;
    const mcq = await db.quizQuestion.create({
      data: { quizId, order: 0, type: "MCQ", prompt: "Capital of France?", points: 2,
        options: ["London", "Paris"], correctIndex: 1 },
      select: { id: true },
    });
    const essay = await db.quizQuestion.create({
      data: { quizId, order: 1, type: "ESSAY", prompt: "Discuss.", points: 5,
        options: [], correctIndex: null },
      select: { id: true },
    });
    mcqId = mcq.id;
    essayId = essay.id;

    const attempt = await db.quizAttempt.create({
      data: {
        quizId, studentUserId: ownStudentId, attemptNumber: 1,
        status: "SUBMITTED", autoScore: 2, submittedAt: new Date(),
        answers: {
          create: [
            { questionId: mcqId, selectedIndex: 1, isCorrect: true, pointsAwarded: 2 },
            { questionId: essayId, text: "Because of the river." },
          ],
        },
      },
      select: { id: true },
    });
    attemptId = attempt.id;
  });

  it("lists attempts for the caller's own students, never a client-supplied set", async () => {
    const res = await request(app)
      .get(`/api/v1/quizzes/${quizId}/attempts`)
      .set("authorization", `Bearer ${leaderToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0]).toMatchObject({
      attemptId, studentUserId: ownStudentId, status: "SUBMITTED", autoScore: 2,
    });
    // The grader gets the answer key — correct for this audience (R103).
    const mcqAnswer = res.body.data.items[0].answers.find(
      (a: { questionId: number }) => a.questionId === mcqId,
    );
    expect(mcqAnswer.correctIndex).toBe(1);
    // Leader scope = their own group only, so the other group's student is not
    // in the population at all.
    expect(res.body.data.studentCount).toBe(1);
  });

  it("shows a student whose latest attempt is still in progress instead of hiding them (R102, D5)", async () => {
    await db.quizAttempt.update({ where: { id: attemptId }, data: { status: "IN_PROGRESS" } });

    const res = await request(app)
      .get(`/api/v1/quizzes/${quizId}/attempts`)
      .set("authorization", `Bearer ${leaderToken}`);

    expect(res.status).toBe(200);
    // v1's read filtered to SUBMITTED|GRADED and took one row per student, so a
    // student with an in-progress attempt vanished from the grading list — as
    // did any student an admin had just granted a retake to, whose earlier
    // graded attempt disappeared behind the new one.
    expect(res.body.data.items).toHaveLength(0);
    expect(res.body.data.waiting).toEqual([
      expect.objectContaining({ studentUserId: ownStudentId }),
    ]);
    expect(res.body.data.waiting[0].startedAt).not.toBeNull();
  });

  it("lists a never-started student as waiting with a null startedAt", async () => {
    const res = await request(app)
      .get(`/api/v1/quizzes/${quizId}/attempts`)
      .set("authorization", `Bearer ${adminToken}`);
    // The admin's scope is the whole season: our student (SUBMITTED) plus the
    // other group's student, who has not started.
    expect(res.body.data.studentCount).toBe(2);
    expect(res.body.data.waiting).toEqual([
      expect.objectContaining({ studentUserId: otherGroupStudentId, startedAt: null }),
    ]);
  });

  it("grades essays, requires every essay, and rejects an over-max award", async () => {
    const before = await quizGradedCount();
    const incomplete = await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/${attemptId}/grade`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ awards: [{ questionId: mcqId, points: 2 }] });
    // Awards naming a non-essay question were silently skipped in v1 (R71),
    // and manualScore was recomputed from only what arrived, so a partial
    // payload quietly lowered the total (R72).
    expect(incomplete.status).toBe(400);
    expect(incomplete.body.error.code).toBe("awards_incomplete");

    const tooHigh = await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/${attemptId}/grade`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ awards: [{ questionId: essayId, points: 99 }] });
    // v1 clamped silently (R70); D8 says reject, so a miskey is visible.
    expect(tooHigh.status).toBe(400);
    expect(tooHigh.body.error.code).toBe("score_exceeds_max");

    const ok = await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/${attemptId}/grade`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ awards: [{ questionId: essayId, points: 4 }] });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({
      status: "GRADED", autoScore: 2, manualScore: 4, totalScore: 6,
    });
    expect(ok.body.data.gradedByName).toBe("Test leader");

    expect((await quizGradedCount()) - before).toBe(1);

    // A re-save at the same total is a no-op for the student (D8's unified
    // rule: notify on a first grade and on a score change, silent otherwise —
    // v1's two paths disagreed, R75 vs R92).
    await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/${attemptId}/grade`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ awards: [{ questionId: essayId, points: 4 }] });
    expect((await quizGradedCount()) - before).toBe(1);

    // A changed total does notify again.
    await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/${attemptId}/grade`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ awards: [{ questionId: essayId, points: 5 }] });
    expect((await quizGradedCount()) - before).toBe(2);
  });

  it("refuses grading an attempt whose student is outside the caller's scope (R68)", async () => {
    const strangerAttempt = await db.quizAttempt.create({
      data: {
        quizId, studentUserId: otherGroupStudentId, attemptNumber: 1,
        status: "SUBMITTED", autoScore: 0, submittedAt: new Date(),
        answers: { create: [{ questionId: essayId, text: "Mine." }] },
      },
      select: { id: true },
    });

    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/${strangerAttempt.id}/grade`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ awards: [{ questionId: essayId, points: 1 }] });
    // v1's gate was season-wide with no group check at all, so a leader could
    // grade any student in the season, including another leader's.
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("student_not_in_scope");
  });

  it("refuses grading an attempt that is still in progress (R69)", async () => {
    await db.quizAttempt.update({ where: { id: attemptId }, data: { status: "IN_PROGRESS" } });
    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/${attemptId}/grade`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ awards: [{ questionId: essayId, points: 1 }] });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("attempt_not_submitted");
  });

  it("lets a LEADER reopen an attempt, and tells the student (D5)", async () => {
    await db.quizAttempt.update({
      where: { id: attemptId },
      data: { status: "GRADED", manualScore: 4, totalScore: 6, gradedAt: new Date() },
    });
    const before = await quizGradedCount();

    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/reopen`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ studentUserId: ownStudentId });

    // v1 gated reopen on canManageQuiz — admin only — so the leader looking at
    // the grading screen could see a stuck student and do nothing about it.
    expect(res.status).toBe(201);
    expect(res.body.data.attemptNumber).toBe(2);

    const attempts = await db.quizAttempt.findMany({
      where: { quizId, studentUserId: ownStudentId },
      orderBy: { attemptNumber: "asc" },
      select: { attemptNumber: true, status: true, totalScore: true },
    });
    // History is preserved: the graded attempt is untouched (R81).
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toMatchObject({ attemptNumber: 1, status: "GRADED", totalScore: 6 });
    expect(attempts[1]).toMatchObject({ attemptNumber: 2, status: "IN_PROGRESS" });

    // v1 sent NOTHING on reopen — the student was never told they had a retake.
    expect((await quizGradedCount()) - before).toBe(1);
  });

  it("reopens a SUBMITTED attempt, then refuses while that one is open", async () => {
    // v1's action allowed reopening a SUBMITTED (ungraded) attempt — its only
    // status check was `!== IN_PROGRESS` — while its UI offered the control
    // only for GRADED (R82). The action's rule is the real one and is kept: a
    // student who submitted and needs another go should not have to wait for
    // someone to grade the attempt first.
    const first = await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/reopen`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ studentUserId: ownStudentId });
    expect(first.status).toBe(201);
    expect(first.body.data.attemptNumber).toBe(2);

    // Attempt 2 is now IN_PROGRESS, so a second reopen would create a third
    // live attempt for one student.
    const second = await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/reopen`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ studentUserId: ownStudentId });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("attempt_open");
  });

  it("refuses reopening for a student outside the caller's scope", async () => {
    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/reopen`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ studentUserId: otherGroupStudentId });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("student_not_in_scope");
  });

  it("refuses reopening when the student has never attempted", async () => {
    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/reopen`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ studentUserId: otherGroupStudentId });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("no_attempt");
  });
});

describe("PAPER grades", () => {
  let quizId: number;

  beforeEach(async () => {
    const quiz = await db.quiz.create({
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
    const row = res.body.data.rows.find(
      (r: { studentUserId: number }) => r.studentUserId === ownStudentId,
    );
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
      data: { seasonId, sessionId, title: "Online", kind: "ONLINE", maxScore: 5,
        publishedAt: new Date() },
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
