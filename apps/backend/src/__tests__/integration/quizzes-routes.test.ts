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
