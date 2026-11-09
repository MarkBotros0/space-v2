import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestUser } from "./fixtures";
import { resetAnswers, seedVideoQuizFixtures } from "./video-quiz-setup";

jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let sessionId: number;
let q1: number;
let studentId: number;
let studentToken: string;
let adminToken: string;
let leaderToken: string;

beforeAll(async () => {
  ({ seasonId, sessionId, q1, studentId, studentToken, adminToken, leaderToken } = await seedVideoQuizFixtures(app));
});

beforeEach(() => resetAnswers(sessionId));

afterAll(async () => {
  await cleanupTestData();
});

describe("video question authoring", () => {
  it("lists questions WITH the answer key for a season admin", async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}/video-questions`)
      .set("authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.questions).toHaveLength(3);
    expect(res.body.data.questions[0]).toMatchObject({ correctIndex: 0, responseCount: 0 });
  });

  it("refuses the authoring list to a student, a leader and a mentor", async () => {
    // This is the read that carries correctIndex for every question. In v1 the
    // query authorizes nothing at all and the admin page is the only gate
    // (spec 13 R68/R73) — the exact protection that evaporates behind an API.
    for (const token of [studentToken, leaderToken]) {
      const res = await request(app)
        .get(`/api/v1/sessions/${sessionId}/video-questions`)
        .set("authorization", `Bearer ${token}`);
      expect(res.status).toBe(403);
    }
  });

  it("creates a question and refuses one whose correct index is out of range", async () => {
    const ok = await request(app)
      .post(`/api/v1/sessions/${sessionId}/video-questions`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({
        atSeconds: 120,
        prompt: "space-v2-test new question",
        options: ["a", "b"],
        correctIndex: 1,
        points: 4,
      });
    expect(ok.status).toBe(201);
    expect(ok.body.data.question).toMatchObject({ atSeconds: 120, points: 4, responseCount: 0 });

    const bad = await request(app)
      .post(`/api/v1/sessions/${sessionId}/video-questions`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({
        atSeconds: 120,
        prompt: "space-v2-test bad question",
        options: ["a", "b"],
        correctIndex: 2,
      });
    expect(bad.status).toBe(400);

    await db.sessionVideoQuestion.deleteMany({ where: { id: ok.body.data.question.id } });
  });

  it("refuses creation by a leader — authoring is ADMIN/SUPER only (v1 R1)", async () => {
    const res = await request(app)
      .post(`/api/v1/sessions/${sessionId}/video-questions`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({
        atSeconds: 10,
        prompt: "space-v2-test nope",
        options: ["a", "b"],
        correctIndex: 0,
      });
    expect(res.status).toBe(403);
  });

  it("RE-GRADES existing answers when the key changes (spec 13 D5)", async () => {
    // v1 freezes isCorrect at answer time and the update touches only the
    // question row, so fixing a wrong answer key leaves every prior grade
    // wrong — silently, with responseCount displayed two lines away.
    await request(app)
      .post(`/api/v1/sessions/${sessionId}/video-quiz/answers`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ questionId: q1, selectedIndex: 1 }); // wrong under correctIndex 0

    const patched = await request(app)
      .patch(`/api/v1/video-questions/${q1}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({
        atSeconds: 30,
        prompt: "space-v2-test q1",
        options: ["a", "b"],
        correctIndex: 1, // the key was wrong; fix it
        points: 2,
      });

    expect(patched.status).toBe(200);
    expect(patched.body.data.regradedCount).toBe(1);

    const response = await db.sessionVideoQuestionResponse.findUnique({
      where: { questionId_studentUserId: { questionId: q1, studentUserId: studentId } },
      select: { isCorrect: true },
    });
    expect(response?.isCorrect).toBe(true);

    // Restore the fixture's key for the suite's other cases.
    await db.sessionVideoQuestion.update({ where: { id: q1 }, data: { correctIndex: 0 } });
  });

  it("reports zero re-grades when only the points change", async () => {
    await request(app)
      .post(`/api/v1/sessions/${sessionId}/video-quiz/answers`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ questionId: q1, selectedIndex: 0 });

    const res = await request(app)
      .patch(`/api/v1/video-questions/${q1}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({
        atSeconds: 30,
        prompt: "space-v2-test q1",
        options: ["a", "b"],
        correctIndex: 0,
        points: 7,
      });
    expect(res.body.data.regradedCount).toBe(0);
    // Points are not stored on a response, so every earned score moved anyway.
    expect(res.body.data.pointsChanged).toBe(true);

    await db.sessionVideoQuestion.update({ where: { id: q1 }, data: { points: 2 } });
  });

  it("reports how many recorded answers a delete destroys (spec 13 D6)", async () => {
    const doomed = await db.sessionVideoQuestion.create({
      data: {
        sessionId,
        atSeconds: 200,
        prompt: "space-v2-test doomed",
        options: ["a", "b"],
        correctIndex: 0,
      },
      select: { id: true },
    });
    await db.sessionVideoQuestionResponse.create({
      data: { questionId: doomed.id, studentUserId: studentId, selectedIndex: 0, isCorrect: true },
    });

    const res = await request(app)
      .delete(`/api/v1/video-questions/${doomed.id}`)
      .set("authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    // v1 destroys student work behind a static confirm string with no count.
    expect(res.body.data).toEqual({ deleted: true, responsesRemoved: 1 });
    expect(await db.sessionVideoQuestion.count({ where: { id: doomed.id } })).toBe(0);
  });

  it("404s an unknown question on PATCH and DELETE", async () => {
    for (const call of [
      request(app)
        .patch("/api/v1/video-questions/987654321")
        .send({
          atSeconds: 1,
          prompt: "space-v2-test",
          options: ["a", "b"],
          correctIndex: 0,
        }),
      request(app).delete("/api/v1/video-questions/987654321"),
    ]) {
      const res = await call.set("authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    }
  });
});

describe("GET /api/v1/sessions/:id/video-quiz/results", () => {
  it("gives an admin every student's score — a capability v1 has for nobody", async () => {
    await request(app)
      .post(`/api/v1/sessions/${sessionId}/video-quiz/answers`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ questionId: q1, selectedIndex: 0 });

    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}/video-quiz/results`)
      .set("authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.questionCount).toBe(3);
    expect(res.body.data.totalPoints).toBe(6);
    const row = res.body.data.rows.find((r: { studentUserId: number }) => r.studentUserId === studentId);
    // Every ACTIVE student appears, including those who have answered nothing.
    expect(row).toMatchObject({ answeredCount: 1, earnedPoints: 2, completedAt: null });
  });

  it("gives a leader only their own group's members", async () => {
    // An ACTIVE student in a group this leader does NOT lead. Without them the
    // assertion below would pass for an admin too (every row would be in-group
    // by construction), so the test could not tell a scoped read from a
    // season-wide one.
    const groupB = await db.group.create({
      data: { seasonId, name: "Group B" },
      select: { id: true },
    });
    const outsider = await createTestUser("vqoutsider", "STUDENT");
    await db.seasonEnrollment.create({
      data: { seasonId, studentUserId: outsider.id, groupId: groupB.id, status: "ACTIVE" },
    });

    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}/video-quiz/results`)
      .set("authorization", `Bearer ${leaderToken}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.rows.map((r: { studentUserId: number }) => r.studentUserId);
    expect(ids).toContain(studentId);
    expect(ids).not.toContain(outsider.id);

    // The control: the season admin does see the outsider.
    const asAdmin = await request(app)
      .get(`/api/v1/sessions/${sessionId}/video-quiz/results`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(asAdmin.body.data.rows.map((r: { studentUserId: number }) => r.studentUserId)).toContain(outsider.id);
  });

  it("refuses a student outright", async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}/video-quiz/results`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
  });
});
