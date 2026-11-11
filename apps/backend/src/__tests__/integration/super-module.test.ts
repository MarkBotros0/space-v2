/**
 * Super module: SUPER reaches every surface, including the ones no other
 * role can (users, organisation report, imports), across every season.
 */
import request from "supertest";

import { createApp } from "../../app";
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

describe("super reads", () => {
  it("every season and every staff surface", async () => {
    await expectStatuses(app, w.tokens.super, [
      ["get", `/api/v1/seasons/${w.seasonId}`, 200],
      ["get", `/api/v1/seasons/${w.otherSeasonId}`, 200],
      ["get", `/api/v1/seasons/${w.seasonId}/roster`, 200],
      ["get", `/api/v1/seasons/${w.seasonId}/exports/manifest`, 200],
      ["get", `/api/v1/sessions/${w.otherSessionId}`, 200],
      ["get", `/api/v1/sessions/${w.sessionId}/attendance`, 200],
      ["get", `/api/v1/sessions/${w.sessionId}/check-in`, 200],
      ["get", `/api/v1/sessions/${w.sessionId}/video-questions`, 200],
      ["get", `/api/v1/assignments/${w.otherAssignmentId}`, 200],
      ["get", `/api/v1/assignments/${w.assignmentId}/progress`, 200],
      ["get", `/api/v1/groups/${w.groupBId}/impact`, 200],
      ["get", `/api/v1/students/${w.ids.studentB}/notes`, 200],
      ["get", `/api/v1/submissions/${w.submissionBPublicId}`, 200],
      ["get", `/api/v1/quizzes/${w.quizId}/grades`, 200],
      ["get", `/api/v1/events/${w.eventAlumniId}`, 200],
    ]);
  });

  it("the SUPER-only surfaces", async () => {
    await expectStatuses(app, w.tokens.super, [
      ["get", "/api/v1/reports/organisation", 200],
      ["get", "/api/v1/users", 200],
      ["get", `/api/v1/users/${w.ids.leaderA}`, 200],
      ["get", "/api/v1/users/invites/pending", 200],
      ["get", "/api/v1/imports/students/template", 200],
    ]);
  });

  it("is refused student self-service", async () => {
    await expectStatuses(app, w.tokens.super, [
      ["get", "/api/v1/me/season", 403],
      ["get", "/api/v1/me/profile", 403],
      ["put", `/api/v1/assignments/${w.assignmentId}/parts/${w.essayPartId}/essay`, 403, { text: "x" }],
    ]);
  });
});

describe("super writes", () => {
  it("creates sessions in any season and reviews any submission", async () => {
    const body = { title: "Super session", startDay: "2099-05-01", startTime: "18:00", durationMinutes: 60 };
    for (const seasonId of [w.seasonId, w.otherSeasonId]) {
      const res = await request(app)
        .post("/api/v1/sessions")
        .set({ authorization: `Bearer ${w.tokens.super}` })
        .send({ ...body, seasonId });
      expect(res.status).toBe(201);
    }
    const review = await request(app)
      .post(`/api/v1/submissions/${w.submissionBPublicId}/review`)
      .set({ authorization: `Bearer ${w.tokens.super}` })
      .send({ action: "reviewed", feedback: "Reviewed by super" });
    expect(review.status).toBe(200);
  });
});
