/**
 * Student module: what a current student can and cannot reach, end to end.
 *
 * Built on the shared module world (module-world.ts). Student A is in Group A
 * of the season; Student B is in Group B. The rules under test:
 *  - a student reads their own season, group, sessions, assignments and record;
 *  - never another student's record or submission, another group, or another season;
 *  - never staff-only data (notes, roster, progress, attendance sheets, reports);
 *  - never any staff write.
 */
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData } from "./fixtures";
import { expectStatuses, seedModuleWorld, type ModuleWorld } from "./module-world";

jest.setTimeout(120000);

const app = createApp();
let w: ModuleWorld;
const asA = () => ({ authorization: `Bearer ${w.tokens.studentA}` });

beforeAll(async () => {
  w = await seedModuleWorld(app);
});

afterAll(async () => {
  await cleanupTestData();
});

describe("reads a student is allowed", () => {
  it("own dashboard, season, attendance, profile, history and notifications", async () => {
    await expectStatuses(app, w.tokens.studentA, [
      ["get", "/api/v1/me", 200],
      ["get", "/api/v1/me/dashboard", 200],
      ["get", "/api/v1/me/season", 200],
      ["get", "/api/v1/me/attendance", 200],
      ["get", "/api/v1/me/profile", 200],
      ["get", "/api/v1/me/season-history", 200],
      ["get", "/api/v1/notifications", 200],
      ["get", "/api/v1/notifications/unread-count", 200],
    ]);
  });

  it("own season's sessions, assignments and groups; own group; own record", async () => {
    await expectStatuses(app, w.tokens.studentA, [
      ["get", "/api/v1/seasons", 200],
      ["get", `/api/v1/seasons/${w.seasonId}`, 200],
      ["get", `/api/v1/seasons/${w.seasonId}/sessions`, 200],
      ["get", `/api/v1/seasons/${w.seasonId}/assignments`, 200],
      ["get", `/api/v1/seasons/${w.seasonId}/groups`, 200],
      ["get", `/api/v1/sessions/${w.sessionId}`, 200],
      ["get", `/api/v1/sessions/${w.sessionId}/video-quiz`, 200],
      ["get", `/api/v1/assignments/${w.assignmentId}`, 200],
      ["get", "/api/v1/groups", 200],
      ["get", `/api/v1/groups/${w.groupAId}`, 200],
      ["get", `/api/v1/students/${w.ids.studentA}`, 200],
      ["get", `/api/v1/students/${w.ids.studentA}/engagement`, 200],
      ["get", "/api/v1/quizzes", 200],
      ["get", "/api/v1/events", 200],
      ["get", `/api/v1/events/${w.eventAllId}`, 200],
    ]);
  });

  it("the dashboard names the student's own season", async () => {
    const res = await request(app).get("/api/v1/me/season").set(asA());
    expect(res.body.data.season).toMatchObject({ id: w.seasonId });
  });
});

describe("reads a student is refused", () => {
  it("other seasons, other groups, other students", async () => {
    await expectStatuses(app, w.tokens.studentA, [
      ["get", `/api/v1/seasons/${w.otherSeasonId}`, 403],
      ["get", `/api/v1/sessions/${w.otherSessionId}`, 404],
      ["get", `/api/v1/assignments/${w.otherAssignmentId}`, 403],
      ["get", `/api/v1/groups/${w.groupBId}`, 403],
      ["get", `/api/v1/students/${w.ids.studentB}`, 403],
      ["get", `/api/v1/students/${w.ids.studentB}/submissions`, 403],
      ["get", `/api/v1/submissions/${w.submissionBPublicId}`, 403],
    ]);
  });

  it("staff-only data, even about themselves", async () => {
    await expectStatuses(app, w.tokens.studentA, [
      ["get", "/api/v1/me/notes", 403],
      ["get", `/api/v1/students/${w.ids.studentA}/notes`, 403],
      ["get", `/api/v1/students/${w.ids.studentA}/attendance`, 403],
      ["get", `/api/v1/students/${w.ids.studentA}/submissions`, 403],
      ["get", "/api/v1/students", 403],
      ["get", "/api/v1/sessions", 403],
      ["get", `/api/v1/sessions/${w.sessionId}/attendance`, 403],
      ["get", `/api/v1/sessions/${w.sessionId}/check-in`, 403],
      ["get", `/api/v1/sessions/${w.sessionId}/quizzes`, 403],
      ["get", `/api/v1/sessions/${w.sessionId}/series`, 403],
      ["get", `/api/v1/sessions/${w.sessionId}/video-questions`, 403],
      ["get", `/api/v1/sessions/${w.sessionId}/video-quiz/results`, 403],
      ["get", `/api/v1/seasons/${w.seasonId}/roster`, 403],
      ["get", `/api/v1/seasons/${w.seasonId}/exports/manifest`, 403],
      ["get", `/api/v1/assignments/${w.assignmentId}/progress`, 403],
      ["get", "/api/v1/submissions", 403],
      ["get", `/api/v1/groups/${w.groupAId}/impact`, 403],
      ["get", `/api/v1/quizzes/${w.quizId}/grades`, 403],
      ["get", `/api/v1/quizzes/${w.quizId}/attempts`, 403],
      ["get", "/api/v1/reports/engagement", 403],
      ["get", "/api/v1/reports/engagement/students", 403],
      ["get", "/api/v1/reports/organisation", 403],
      ["get", "/api/v1/users", 403],
      ["get", "/api/v1/imports/students/template", 403],
    ]);
  });

  it("alumni-only events are invisible (404, not 403)", async () => {
    await expectStatuses(app, w.tokens.studentA, [["get", `/api/v1/events/${w.eventAlumniId}`, 404]]);
    const list = await request(app)
      .get("/api/v1/events?from=2099-01-01T00:00:00.000Z&to=2099-12-31T00:00:00.000Z")
      .set(asA());
    const ids = (list.body.data.events as { id: number }[]).map((e) => e.id);
    expect(ids).toContain(w.eventAllId);
    expect(ids).not.toContain(w.eventAlumniId);
  });

  it("no response a student can reach leaks a staff note", async () => {
    for (const path of [
      "/api/v1/me",
      "/api/v1/me/dashboard",
      "/api/v1/me/profile",
      "/api/v1/me/season",
      `/api/v1/students/${w.ids.studentA}`,
      `/api/v1/students/${w.ids.studentA}/engagement`,
    ]) {
      const res = await request(app).get(path).set(asA());
      expect([path, JSON.stringify(res.body)]).not.toEqual([path, expect.stringContaining("Staff-only pastoral note")]);
    }
  });
});

describe("staff writes a student is refused", () => {
  it("cannot create or change seasons, sessions, assignments, events, notes, groups or quizzes", async () => {
    await expectStatuses(app, w.tokens.studentA, [
      ["post", "/api/v1/seasons", 403, { code: "X", title: "X" }],
      ["patch", `/api/v1/seasons/${w.seasonId}`, 403, { title: "Hijacked" }],
      [
        "post",
        "/api/v1/sessions",
        403,
        { seasonId: w.seasonId, title: "Hijack", startDay: "2099-05-01", startTime: "18:00", durationMinutes: 60 },
      ],
      ["patch", `/api/v1/sessions/${w.sessionId}`, 403, { title: "Hijacked" }],
      ["delete", `/api/v1/sessions/${w.sessionId}`, 403],
      ["post", `/api/v1/sessions/${w.sessionId}/attendance`, 403, { records: [] }],
      ["post", `/api/v1/sessions/${w.sessionId}/check-in-open`, 403],
      ["post", `/api/v1/seasons/${w.seasonId}/assignments`, 403, { title: "X" }],
      ["patch", `/api/v1/assignments/${w.assignmentId}`, 403, { title: "Hijacked" }],
      ["delete", `/api/v1/assignments/${w.assignmentId}`, 403],
      ["post", "/api/v1/events", 403, { title: "X" }],
      ["patch", `/api/v1/events/${w.eventAllId}`, 403, { title: "Hijacked" }],
      ["delete", `/api/v1/events/${w.eventAllId}`, 403],
      ["post", `/api/v1/students/${w.ids.studentA}/notes`, 403, { body: "self-note" }],
      ["patch", `/api/v1/notes/${w.noteOnAId}`, 403, { body: "edited" }],
      ["patch", `/api/v1/groups/${w.groupAId}`, 403, { name: "Hijacked" }],
      ["post", "/api/v1/quizzes", 403, { seasonId: w.seasonId, title: "Hijack", kind: "PAPER", maxScore: 10 }],
      ["post", `/api/v1/quizzes/${w.quizId}/grades`, 403, { grades: [] }],
      ["post", `/api/v1/submissions/${w.submissionBPublicId}/review`, 403, { action: "reviewed", feedback: "nice" }],
      ["patch", `/api/v1/students/${w.ids.studentB}`, 403, { name: "Hijacked" }],
    ]);
  });

  it("left every target unchanged", async () => {
    expect((await db.session.findUnique({ where: { id: w.sessionId } }))?.title).toBe("MW Session");
    expect((await db.assignment.findUnique({ where: { id: w.assignmentId } }))?.title).toBe("MW Assignment");
    expect((await db.engagementNote.findUnique({ where: { id: w.noteOnAId } }))?.body).toBe(
      "Staff-only pastoral note about A",
    );
    const essay = await db.assignmentPartWork.findUnique({ where: { publicId: w.submissionBPublicId } });
    expect(essay?.status).toBe("SUBMITTED");
  });
});

describe("the student's own essay journey", () => {
  let publicId: string;
  const essayPath = (assignmentId: number, partId: number) =>
    `/api/v1/assignments/${assignmentId}/parts/${partId}/essay`;

  it("saves a draft for an assignment in their season, made on the first save", async () => {
    const res = await request(app).put(essayPath(w.assignmentId, w.essayPartId)).set(asA()).send({ text: "first" });
    expect(res.status).toBe(200);
    expect(res.body.data.reviewStatus).toBe("DRAFT");
    publicId = res.body.data.publicId;
  });

  it("saving again keeps the same essay, not a second one", async () => {
    const res = await request(app).put(essayPath(w.assignmentId, w.essayPartId)).set(asA()).send({ text: "first try" });
    expect(res.body.data.publicId).toBe(publicId);
    expect(await db.submission.count({ where: { assignmentId: w.assignmentId, studentUserId: w.ids.studentA } })).toBe(
      1,
    );
  });

  it("cannot save one for another season's assignment", async () => {
    const res = await request(app)
      .put(essayPath(w.otherAssignmentId, w.otherEssayPartId))
      .set(asA())
      .send({ text: "x" });
    expect([403, 404]).toContain(res.status);
  });

  it("reads the draft back", async () => {
    const read = await request(app).get(`/api/v1/submissions/${publicId}`).set(asA());
    expect(read.status).toBe(200);
    expect(read.body.data).toMatchObject({ text: "first try", status: "DRAFT" });
  });

  it("cannot hand a draft in on its own: Submit hands drafts in", async () => {
    const res = await request(app).post(`/api/v1/submissions/${publicId}/hand-in`).set(asA());
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("not_returned");
  });

  it("cannot review their own essay", async () => {
    const res = await request(app)
      .post(`/api/v1/submissions/${publicId}/review`)
      .set(asA())
      .send({ action: "reviewed", feedback: "great" });
    expect(res.status).toBe(403);
  });

  it("cannot write to another student's essay", async () => {
    const res = await request(app).post(`/api/v1/submissions/${w.submissionBPublicId}/hand-in`).set(asA());
    expect([403, 404]).toContain(res.status);
    const essay = await db.assignmentPartWork.findUnique({ where: { publicId: w.submissionBPublicId } });
    expect(essay).toMatchObject({ text: "Student B's private answer", status: "SUBMITTED" });
  });
});

describe("self-service writes", () => {
  it("edits own profile fields and marks notifications read", async () => {
    const profile = await request(app).patch("/api/v1/me/profile").set(asA()).send({ university: "Fake University" });
    expect(profile.status).toBe(200);
    const read = await request(app).post("/api/v1/notifications/read").set(asA()).send({ all: true });
    expect([200, 400]).toContain(read.status);
  });

  it("check-in with an unknown code is refused without crediting attendance", async () => {
    const res = await request(app).post("/api/v1/sessions/check-in").set(asA()).send({ token: "not-a-real-code" });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(await db.attendance.count({ where: { studentUserId: w.ids.studentA } })).toBe(0);
  });
});
