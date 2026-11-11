/**
 * Alumni module: a graduated student (role STUDENT, graduationYear set) keeps
 * a read-only view of their own past and the alumni events, and nothing of
 * the current season they were never part of.
 *
 * The alumnus completed "other season" and is not in the world's season.
 */
import request from "supertest";

import { createApp } from "../../app";
import { cleanupTestData } from "./fixtures";
import { expectStatuses, seedModuleWorld, type ModuleWorld } from "./module-world";

jest.setTimeout(120000);

const app = createApp();
let w: ModuleWorld;
const asAlumnus = () => ({ authorization: `Bearer ${w.tokens.alumnus}` });

beforeAll(async () => {
  w = await seedModuleWorld(app);
});

afterAll(async () => {
  await cleanupTestData();
});

describe("alumni reads", () => {
  it("own record, history and their own past season", async () => {
    await expectStatuses(app, w.tokens.alumnus, [
      ["get", "/api/v1/me", 200],
      ["get", "/api/v1/me/profile", 200],
      ["get", "/api/v1/me/season-history", 200],
      ["get", "/api/v1/me/season", 200],
      ["get", "/api/v1/me/attendance", 200],
      ["get", "/api/v1/notifications", 200],
      ["get", `/api/v1/seasons/${w.otherSeasonId}`, 200],
      ["get", "/api/v1/events", 200],
    ]);
  });

  it("history rows carry code and outcome, and the past season opens as a record", async () => {
    const hist = await request(app).get("/api/v1/me/season-history").set(asAlumnus());
    expect(hist.status).toBe(200);
    expect(hist.body.data.seasons.length).toBeGreaterThan(0);
    for (const row of hist.body.data.seasons) {
      expect(typeof row.code).toBe("string");
      expect(["PASSED", "NOT_PASSED", "COMPLETED", "DROPPED"]).toContain(row.outcome);
    }
    const first = hist.body.data.seasons[0];
    const rec = await request(app).get(`/api/v1/me/seasons/${first.seasonId}`).set(asAlumnus());
    expect(rec.status).toBe(200);
    expect(rec.body.data.record.outcome).toBe(first.outcome);
  });

  it("sees alumni-only events that current students cannot", async () => {
    await expectStatuses(app, w.tokens.alumnus, [
      ["get", `/api/v1/events/${w.eventAlumniId}`, 200],
      ["get", `/api/v1/events/${w.eventAllId}`, 200],
    ]);
    await expectStatuses(app, w.tokens.studentA, [["get", `/api/v1/events/${w.eventAlumniId}`, 404]]);
  });

  it("has no active season", async () => {
    const res = await request(app).get("/api/v1/me/season").set(asAlumnus());
    expect(res.body.data.season).toBeNull();
  });

  it("reads their own past season's assignment, read-only (COMPLETED enrolment)", async () => {
    const res = await request(app).get(`/api/v1/assignments/${w.otherAssignmentId}`).set(asAlumnus());
    expect(res.status).toBe(200);
    expect(res.body.data.readOnly).toBe(true);
  });

  it("refused: the current season, current students and the student dashboard", async () => {
    await expectStatuses(app, w.tokens.alumnus, [
      ["get", "/api/v1/me/dashboard", 403],
      ["get", `/api/v1/seasons/${w.seasonId}`, 403],
      ["get", `/api/v1/seasons/${w.seasonId}/sessions`, 403],
      ["get", `/api/v1/assignments/${w.assignmentId}`, 403],
      ["get", `/api/v1/sessions/${w.sessionId}/video-quiz`, 403],
      ["get", `/api/v1/groups/${w.groupAId}`, 403],
      ["get", `/api/v1/students/${w.ids.studentA}`, 403],
      ["get", "/api/v1/students", 403],
      ["get", `/api/v1/submissions/${w.submissionBPublicId}`, 403],
      ["get", "/api/v1/users", 403],
    ]);
  });
});

describe("alumni writes", () => {
  it("their record is read-only", async () => {
    const res = await request(app).patch("/api/v1/me/profile").set(asAlumnus()).send({ university: "Changed" });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/read-only/);
  });

  it("cannot write an essay on the current season's assignment", async () => {
    const res = await request(app)
      .put(`/api/v1/assignments/${w.assignmentId}/parts/${w.essayPartId}/essay`)
      .set(asAlumnus())
      .send({ text: "x" });
    expect([403, 404]).toContain(res.status);
  });
});
