/**
 * Mentor module: mentors read across every season and write notes, but run
 * nothing.
 *
 * The rules under test:
 *  - a mentor reads every season, group, student, note and submission, and
 *    the engagement reports;
 *  - never reviews a submission, marks attendance, grades, sees check-in
 *    codes, or administers a season;
 *  - may write a pastoral note on any student;
 *  - holds no SUPER powers.
 */
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData } from "./fixtures";
import { expectStatuses, seedModuleWorld, type ModuleWorld } from "./module-world";

jest.setTimeout(120000);

const app = createApp();
let w: ModuleWorld;

beforeAll(async () => {
  w = await seedModuleWorld(app);
});

afterAll(async () => {
  await cleanupTestData();
});

describe("mentor reads", () => {
  it("every season, group, student, note and submission", async () => {
    await expectStatuses(app, w.tokens.mentor, [
      ["get", `/api/v1/seasons/${w.seasonId}`, 200],
      ["get", `/api/v1/seasons/${w.otherSeasonId}`, 200],
      ["get", `/api/v1/sessions/${w.sessionId}`, 200],
      ["get", `/api/v1/sessions/${w.otherSessionId}`, 200],
      ["get", `/api/v1/assignments/${w.assignmentId}`, 200],
      ["get", `/api/v1/assignments/${w.otherAssignmentId}`, 200],
      ["get", `/api/v1/groups/${w.groupAId}`, 200],
      ["get", `/api/v1/groups/${w.groupBId}`, 200],
      ["get", "/api/v1/students", 200],
      ["get", `/api/v1/students/${w.ids.studentA}`, 200],
      ["get", `/api/v1/students/${w.ids.studentB}`, 200],
      ["get", `/api/v1/students/${w.ids.studentA}/notes`, 200],
      ["get", `/api/v1/students/${w.ids.studentA}/attendance`, 200],
      ["get", `/api/v1/students/${w.ids.studentB}/submissions`, 200],
      ["get", "/api/v1/submissions", 200],
      ["get", `/api/v1/submissions/${w.submissionBPublicId}`, 200],
      ["get", "/api/v1/reports/engagement", 200],
      ["get", "/api/v1/reports/engagement/students", 200],
      ["get", "/api/v1/me/dashboard", 200],
    ]);
  });

  it("refused: operational and admin surfaces", async () => {
    await expectStatuses(app, w.tokens.mentor, [
      ["get", "/api/v1/sessions", 403],
      ["get", `/api/v1/sessions/${w.sessionId}/attendance`, 403],
      ["get", `/api/v1/sessions/${w.sessionId}/check-in`, 403],
      ["get", `/api/v1/sessions/${w.sessionId}/quizzes`, 403],
      ["get", `/api/v1/sessions/${w.sessionId}/video-questions`, 403],
      ["get", `/api/v1/sessions/${w.sessionId}/video-quiz/results`, 403],
      ["get", `/api/v1/assignments/${w.assignmentId}/tracker`, 403],
      ["get", `/api/v1/seasons/${w.seasonId}/roster`, 403],
      ["get", `/api/v1/seasons/${w.seasonId}/exports/manifest`, 403],
      ["get", `/api/v1/groups/${w.groupAId}/impact`, 403],
      ["get", `/api/v1/quizzes/${w.quizId}`, 403],
      ["get", `/api/v1/quizzes/${w.quizId}/grades`, 403],
      ["get", "/api/v1/reports/organisation", 403],
      ["get", "/api/v1/users", 403],
      ["get", "/api/v1/imports/students/template", 403],
    ]);
  });
});

describe("mentor writes", () => {
  it("writes a note on any student, in any group", async () => {
    for (const student of [w.ids.studentA, w.ids.studentB]) {
      const res = await request(app)
        .post(`/api/v1/students/${student}/notes`)
        .set({ authorization: `Bearer ${w.tokens.mentor}` })
        .send({ body: "Fake mentor note", visibility: "MENTORS" });
      expect(res.status).toBe(201);
    }
  });

  it("never reviews, marks attendance, grades or administers", async () => {
    await expectStatuses(app, w.tokens.mentor, [
      ["post", `/api/v1/submissions/${w.submissionBPublicId}/review`, 403, { feedback: "Mentor verdict" }],
      [
        "post",
        `/api/v1/sessions/${w.sessionId}/attendance`,
        403,
        { entries: [{ studentUserId: w.ids.studentA, status: "PRESENT" }] },
      ],
      ["post", `/api/v1/sessions/${w.sessionId}/check-in-open`, 403],
      [
        "post",
        "/api/v1/sessions",
        403,
        {
          seasonId: w.seasonId,
          title: "Mentor session",
          startDay: "2099-05-01",
          startTime: "18:00",
          durationMinutes: 60,
        },
      ],
      ["post", "/api/v1/quizzes", 403, { seasonId: w.seasonId, title: "Mentor quiz", kind: "PAPER", maxScore: 10 }],
      ["patch", `/api/v1/groups/${w.groupAId}`, 403, { name: "Mentor group" }],
    ]);
    expect((await db.submission.findUnique({ where: { publicId: w.submissionBPublicId } }))?.status).toBe("SUBMITTED");
    expect(await db.attendance.count({ where: { sessionId: w.sessionId } })).toBe(0);
  });
});
