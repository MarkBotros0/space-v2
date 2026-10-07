import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let sessionId: number;
let q1: number;
let q2: number;
let q3: number;
let studentId: number;
let studentToken: string;
let droppedToken: string;
let adminToken: string;
let leaderToken: string;

async function resetAnswers(): Promise<void> {
  await db.sessionVideoQuestionResponse.deleteMany({ where: { question: { sessionId } } });
  await db.sessionVideoProgress.deleteMany({ where: { sessionId } });
}

beforeAll(async () => {
  await cleanupTestData();

  const season = await createTestSeason();
  seasonId = season.id;

  const student = await createTestUser("vqstudent", "STUDENT");
  const droppedStudent = await createTestUser("vqdropped", "STUDENT");
  const admin = await createTestUser("vqadmin", "ADMIN");
  const leader = await createTestUser("vqleader", "LEADER");
  studentId = student.id;

  const group = await db.group.create({
    data: { seasonId, name: "Group A", leaders: { create: { userId: leader.id } } },
    select: { id: true },
  });
  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  await db.seasonEnrollment.createMany({
    data: [
      { seasonId, studentUserId: student.id, groupId: group.id, status: "ACTIVE" },
      { seasonId, studentUserId: droppedStudent.id, groupId: group.id, status: "WITHDRAWN" },
    ],
  });

  const session = await db.session.create({
    data: {
      seasonId,
      title: "space-v2-test-video-session",
      startsAt: new Date("2099-03-01T18:00:00.000Z"),
      durationMinutes: 90,
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    },
    select: { id: true },
  });
  sessionId = session.id;

  const created = await db.$transaction([
    db.sessionVideoQuestion.create({
      data: {
        sessionId,
        atSeconds: 30,
        prompt: "space-v2-test q1",
        options: ["a", "b"],
        correctIndex: 0,
        points: 2,
      },
      select: { id: true },
    }),
    db.sessionVideoQuestion.create({
      data: {
        sessionId,
        atSeconds: 60,
        prompt: "space-v2-test q2",
        options: ["a", "b", "c"],
        correctIndex: 2,
        points: 3,
      },
      select: { id: true },
    }),
    db.sessionVideoQuestion.create({
      data: {
        sessionId,
        atSeconds: 90,
        prompt: "space-v2-test q3",
        options: ["a", "b"],
        correctIndex: 1,
        points: 1,
      },
      select: { id: true },
    }),
  ]);
  q1 = created[0].id;
  q2 = created[1].id;
  q3 = created[2].id;

  studentToken = await login(app, student.email);
  droppedToken = await login(app, droppedStudent.email);
  adminToken = await login(app, admin.email);
  leaderToken = await login(app, leader.email);
});

beforeEach(resetAnswers);

afterAll(async () => {
  await cleanupTestData();
});

describe("GET /api/v1/sessions/:id/video-quiz", () => {
  it("never sends the answer key to a student", async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}/video-quiz`)
      .set("authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.questions).toHaveLength(3);
    // The whole point of the split. Assert on the serialised body, not on a
    // property read, so an undefined-but-present key still fails.
    expect(JSON.stringify(res.body)).not.toMatch(/correctIndex/);
    for (const q of res.body.data.questions) {
      expect(Object.keys(q).sort()).toEqual(
        ["answered", "atSeconds", "id", "isCorrect", "options", "points", "prompt", "selectedIndex"],
      );
    }
  });

  it("resolves the video id server-side so the client never parses a URL", async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}/video-quiz`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(res.body.data.videoId).toBe("dQw4w9WgXcQ");
  });

  it("names the next answerable question and totals the points", async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}/video-quiz`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(res.body.data.nextQuestionId).toBe(q1);
    expect(res.body.data.totalPoints).toBe(6);
    expect(res.body.data.earnedPoints).toBe(0);
    expect(res.body.data.answeredCount).toBe(0);
    expect(res.body.data.furthestSeconds).toBe(0);
    expect(res.body.data.completedAt).toBeNull();
  });

  it("refuses a student whose enrolment is not ACTIVE (spec 13 D9)", async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}/video-quiz`)
      .set("authorization", `Bearer ${droppedToken}`);
    expect(res.status).toBe(403);
  });

  it("refuses staff — this is the student view, and staff have the other one", async () => {
    for (const token of [adminToken, leaderToken]) {
      const res = await request(app)
        .get(`/api/v1/sessions/${sessionId}/video-quiz`)
        .set("authorization", `Bearer ${token}`);
      expect(res.status).toBe(403);
    }
  });

  it("404s an unknown session", async () => {
    const res = await request(app)
      .get("/api/v1/sessions/987654321/video-quiz")
      .set("authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(404);
  });
});

describe("POST /api/v1/sessions/:id/video-quiz/answers", () => {
  it("grades the first question and advances the barrier", async () => {
    const res = await request(app)
      .post(`/api/v1/sessions/${sessionId}/video-quiz/answers`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ questionId: q1, selectedIndex: 0 });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      isCorrect: true,
      correctIndex: 0,
      furthestSeconds: 30,
      nextQuestionId: q2,
      completedAt: null,
    });
  });

  it("REFUSES an answer out of order — the gate v1 has only in the browser", async () => {
    // v1's barrier lives entirely in interactive-video-player.tsx; the action
    // never reads progress, never compares atSeconds and never checks order
    // (spec 13 R47). Behind an API that makes answering every question on a
    // session, having played no video at all, one scripted loop.
    const skip = await request(app)
      .post(`/api/v1/sessions/${sessionId}/video-quiz/answers`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ questionId: q3, selectedIndex: 1 });

    expect(skip.status).toBe(409);
    expect(skip.body.error.code).toBe("out_of_order");
    expect(await db.sessionVideoQuestionResponse.count({ where: { questionId: q3 } })).toBe(0);
  });

  it("replays a recorded answer instead of throwing on the unique constraint", async () => {
    // One answer per question, forever (v1 R54) — but v1 does not catch the
    // constraint violation, so a double tap surfaces a raw Prisma error
    // (spec 13 §10 D14). A double tap on a phone is far more likely than a
    // double click on a mouse.
    await request(app)
      .post(`/api/v1/sessions/${sessionId}/video-quiz/answers`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ questionId: q1, selectedIndex: 0 });

    const again = await request(app)
      .post(`/api/v1/sessions/${sessionId}/video-quiz/answers`)
      .set("authorization", `Bearer ${studentToken}`)
      // A different index: the recorded verdict must win, not this one.
      .send({ questionId: q1, selectedIndex: 1 });

    expect(again.status).toBe(200);
    expect(again.body.data.isCorrect).toBe(true);
    expect(await db.sessionVideoQuestionResponse.count({ where: { questionId: q1 } })).toBe(1);
  });

  it("derives completion when the last question is answered (spec 13 D3)", async () => {
    for (const [questionId, selectedIndex] of [
      [q1, 0],
      [q2, 2],
      [q3, 0],
    ] as const) {
      await request(app)
        .post(`/api/v1/sessions/${sessionId}/video-quiz/answers`)
        .set("authorization", `Bearer ${studentToken}`)
        .send({ questionId, selectedIndex });
    }

    const view = await request(app)
      .get(`/api/v1/sessions/${sessionId}/video-quiz`)
      .set("authorization", `Bearer ${studentToken}`);

    expect(view.body.data.completedAt).not.toBeNull();
    expect(view.body.data.nextQuestionId).toBeNull();
    expect(view.body.data.answeredCount).toBe(3);
    // q3 answered wrongly: 2 + 3 earned out of 6.
    expect(view.body.data.earnedPoints).toBe(5);
  });

  it("refuses an index outside the stored options", async () => {
    const res = await request(app)
      .post(`/api/v1/sessions/${sessionId}/video-quiz/answers`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ questionId: q1, selectedIndex: 5 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_answer");
  });

  it("404s a question that belongs to another session", async () => {
    // v1 addresses questions by bare id, which is what lets an authenticated
    // caller tell an existing question from a missing one (spec 13 R52).
    const other = await db.session.create({
      data: {
        seasonId,
        title: "space-v2-test-other-session",
        startsAt: new Date("2099-04-01T18:00:00.000Z"),
        durationMinutes: 60,
      },
      select: { id: true },
    });
    const res = await request(app)
      .post(`/api/v1/sessions/${other.id}/video-quiz/answers`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ questionId: q1, selectedIndex: 0 });
    expect(res.status).toBe(404);
  });

  it("refuses a dropped student and any staff role", async () => {
    for (const token of [droppedToken, adminToken, leaderToken]) {
      const res = await request(app)
        .post(`/api/v1/sessions/${sessionId}/video-quiz/answers`)
        .set("authorization", `Bearer ${token}`)
        .send({ questionId: q1, selectedIndex: 0 });
      expect(res.status).toBe(403);
    }
  });
});

describe("PUT /api/v1/sessions/:id/video-quiz/progress", () => {
  it("moves furthestSeconds forward and never backward (spec 13 D4)", async () => {
    const up = await request(app)
      .put(`/api/v1/sessions/${sessionId}/video-quiz/progress`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ furthestSeconds: 45 });
    expect(up.status).toBe(200);
    expect(up.body.data.furthestSeconds).toBe(45);

    const down = await request(app)
      .put(`/api/v1/sessions/${sessionId}/video-quiz/progress`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ furthestSeconds: 10 });
    expect(down.body.data.furthestSeconds).toBe(45);
  });

  it("cannot be used to claim completion (spec 13 D3)", async () => {
    const res = await request(app)
      .put(`/api/v1/sessions/${sessionId}/video-quiz/progress`)
      .set("authorization", `Bearer ${studentToken}`)
      // v1's action took `completed` on trust: one call with (sessionId, 0,
      // true) marked a student complete (R48).
      .send({ furthestSeconds: 0, completed: true });

    expect(res.status).toBe(200);
    expect(res.body.data.completedAt).toBeNull();
    const row = await db.sessionVideoProgress.findUnique({
      where: { sessionId_studentUserId: { sessionId, studentUserId: studentId } },
      select: { completedAt: true },
    });
    expect(row?.completedAt ?? null).toBeNull();
  });

  it("is idempotent — the same value twice changes nothing", async () => {
    const first = await request(app)
      .put(`/api/v1/sessions/${sessionId}/video-quiz/progress`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ furthestSeconds: 20 });
    const second = await request(app)
      .put(`/api/v1/sessions/${sessionId}/video-quiz/progress`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ furthestSeconds: 20 });
    expect(second.body.data).toEqual(first.body.data);
  });
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
      request(app).patch("/api/v1/video-questions/987654321").send({
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
    const row = res.body.data.rows.find(
      (r: { studentUserId: number }) => r.studentUserId === studentId,
    );
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
    expect(
      asAdmin.body.data.rows.map((r: { studentUserId: number }) => r.studentUserId),
    ).toContain(outsider.id);
  });

  it("refuses a student outright", async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}/video-quiz/results`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
  });
});
