/**
 * Leader module: a group leader works only inside their own group.
 *
 * Leader A leads Group A (Student A); Leader B leads Group B (Student B), both
 * in the same season. The rules under test:
 *  - a leader reads their season and their own group's students, notes,
 *    attendance and submissions;
 *  - never the other group's students, submissions or notes, and never
 *    another season;
 *  - marks attendance, reviews and writes notes for their own students only;
 *  - holds no season-admin powers (sessions, assignments, roster, exports,
 *    check-in codes) and no SUPER powers.
 */
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData } from "./fixtures";
import { expectStatuses, seedModuleWorld, type ModuleWorld } from "./module-world";

jest.setTimeout(120000);

const app = createApp();
let w: ModuleWorld;
const as = (role: "leaderA" | "leaderB") => ({ authorization: `Bearer ${w.tokens[role]}` });

beforeAll(async () => {
  w = await seedModuleWorld(app);
});

afterAll(async () => {
  await cleanupTestData();
});

describe("reads a leader is allowed", () => {
  it("own season, own group, own students' records, notes and work", async () => {
    await expectStatuses(app, w.tokens.leaderA, [
      ["get", "/api/v1/me", 200],
      ["get", "/api/v1/me/notes", 200],
      ["get", "/api/v1/notifications", 200],
      ["get", `/api/v1/seasons/${w.seasonId}`, 200],
      ["get", `/api/v1/seasons/${w.seasonId}/sessions`, 200],
      ["get", `/api/v1/seasons/${w.seasonId}/assignments`, 200],
      ["get", `/api/v1/seasons/${w.seasonId}/groups`, 200],
      ["get", `/api/v1/seasons/${w.seasonId}/engagement`, 200],
      ["get", "/api/v1/sessions", 200],
      ["get", `/api/v1/sessions/${w.sessionId}`, 200],
      ["get", `/api/v1/sessions/${w.sessionId}/attendance`, 200],
      ["get", `/api/v1/sessions/${w.sessionId}/quizzes`, 200],
      ["get", `/api/v1/sessions/${w.sessionId}/video-quiz/results`, 200],
      ["get", `/api/v1/assignments/${w.assignmentId}`, 200],
      ["get", `/api/v1/assignments/${w.assignmentId}/tracker`, 200],
      ["get", "/api/v1/submissions", 200],
      ["get", `/api/v1/groups/${w.groupAId}`, 200],
      ["get", "/api/v1/students", 200],
      ["get", `/api/v1/students/${w.ids.studentA}`, 200],
      ["get", `/api/v1/students/${w.ids.studentA}/notes`, 200],
      ["get", `/api/v1/students/${w.ids.studentA}/engagement`, 200],
      ["get", `/api/v1/students/${w.ids.studentA}/attendance`, 200],
      ["get", `/api/v1/students/${w.ids.studentA}/submissions`, 200],
      ["get", `/api/v1/quizzes/${w.quizId}`, 200],
      ["get", `/api/v1/quizzes/${w.quizId}/grades`, 200],
      ["get", `/api/v1/quizzes/${w.quizId}/attempts`, 200],
      ["get", "/api/v1/events", 200],
    ]);
  });

  it("the student list and attendance sheet hold only their own group", async () => {
    const students = await request(app).get("/api/v1/students").set(as("leaderA"));
    const listed = JSON.stringify(students.body);
    expect(listed).toContain("mw-student-a");
    expect(listed).not.toContain("mw-student-b");

    const sheet = await request(app).get(`/api/v1/sessions/${w.sessionId}/attendance`).set(as("leaderA"));
    const sheetText = JSON.stringify(sheet.body);
    expect(sheetText).toContain(String(w.ids.studentA));
    expect(sheetText).not.toContain(`"studentUserId":${w.ids.studentB}`);
  });

  it("the submission queue holds only their own group's work", async () => {
    const res = await request(app).get("/api/v1/submissions").set(as("leaderA"));
    expect(JSON.stringify(res.body)).not.toContain(w.submissionBPublicId);
    const b = await request(app).get("/api/v1/submissions").set(as("leaderB"));
    expect(JSON.stringify(b.body)).toContain(w.submissionBPublicId);
  });
});

describe("reads a leader is refused", () => {
  it("the other group, its students and their work", async () => {
    await expectStatuses(app, w.tokens.leaderA, [
      ["get", `/api/v1/groups/${w.groupBId}`, 403],
      ["get", `/api/v1/students/${w.ids.studentB}`, 403],
      ["get", `/api/v1/students/${w.ids.studentB}/submissions`, 403],
      ["get", `/api/v1/submissions/${w.submissionBPublicId}`, 403],
    ]);
  });

  it("other seasons", async () => {
    await expectStatuses(app, w.tokens.leaderA, [
      ["get", `/api/v1/seasons/${w.otherSeasonId}`, 403],
      ["get", `/api/v1/sessions/${w.otherSessionId}`, 403],
      ["get", `/api/v1/assignments/${w.otherAssignmentId}`, 403],
    ]);
  });

  it("season-admin and SUPER surfaces", async () => {
    await expectStatuses(app, w.tokens.leaderA, [
      ["get", `/api/v1/seasons/${w.seasonId}/roster`, 403],
      ["get", `/api/v1/seasons/${w.seasonId}/exports/manifest`, 403],
      ["get", `/api/v1/sessions/${w.sessionId}/check-in`, 403],
      ["get", `/api/v1/sessions/${w.sessionId}/video-questions`, 403],
      ["get", `/api/v1/groups/${w.groupAId}/impact`, 403],
      ["get", "/api/v1/groups/leader-options", 403],
      ["get", "/api/v1/reports/engagement", 403],
      ["get", "/api/v1/reports/organisation", 403],
      ["get", "/api/v1/users", 403],
      ["get", "/api/v1/imports/students/template", 403],
    ]);
  });

  it("student-only self-service", async () => {
    await expectStatuses(app, w.tokens.leaderA, [
      ["get", "/api/v1/me/season", 403],
      ["get", "/api/v1/me/attendance", 403],
      ["get", "/api/v1/me/profile", 403],
      ["put", `/api/v1/submissions/by-assignment/${w.assignmentId}`, 403],
    ]);
  });

  it("Leader B cannot read Leader A's student's notes", async () => {
    await expectStatuses(app, w.tokens.leaderB, [["get", `/api/v1/students/${w.ids.studentA}/notes`, 403]]);
  });
});

describe("attendance", () => {
  it("marks their own student", async () => {
    const res = await request(app)
      .post(`/api/v1/sessions/${w.sessionId}/attendance`)
      .set(as("leaderA"))
      .send({ entries: [{ studentUserId: w.ids.studentA, status: "PRESENT" }] });
    expect(res.status).toBe(200);
    expect(res.body.data.saved).toBe(1);
    const row = await db.attendance.findFirst({ where: { sessionId: w.sessionId, studentUserId: w.ids.studentA } });
    expect(row?.status).toBe("PRESENT");
  });

  it("cannot mark the other group's student", async () => {
    const res = await request(app)
      .post(`/api/v1/sessions/${w.sessionId}/attendance`)
      .set(as("leaderA"))
      .send({ entries: [{ studentUserId: w.ids.studentB, status: "ABSENT" }] });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await db.attendance.count({ where: { sessionId: w.sessionId, studentUserId: w.ids.studentB } })).toBe(0);
  });

  it("cannot mark a session in another season", async () => {
    const res = await request(app)
      .post(`/api/v1/sessions/${w.otherSessionId}/attendance`)
      .set(as("leaderA"))
      .send({ entries: [{ studentUserId: w.ids.studentA, status: "PRESENT" }] });
    expect(res.status).toBe(403);
  });
});

describe("notes", () => {
  let noteId: number;

  it("writes a note on their own student", async () => {
    const res = await request(app)
      .post(`/api/v1/students/${w.ids.studentA}/notes`)
      .set(as("leaderA"))
      .send({ body: "Fake pastoral follow-up", visibility: "LEADERS", seasonId: w.seasonId });
    expect(res.status).toBe(201);
    noteId = res.body.data.note?.id ?? res.body.data.id;
    expect(typeof noteId).toBe("number");
  });

  it("cannot write a note on the other group's student", async () => {
    const res = await request(app)
      .post(`/api/v1/students/${w.ids.studentB}/notes`)
      .set(as("leaderA"))
      .send({ body: "Should not exist", visibility: "LEADERS" });
    expect(res.status).toBe(403);
    expect(await db.engagementNote.count({ where: { studentUserId: w.ids.studentB } })).toBe(0);
  });

  it("edits their own note, but another leader cannot", async () => {
    const own = await request(app).patch(`/api/v1/notes/${noteId}`).set(as("leaderA")).send({ body: "Edited body" });
    expect(own.status).toBe(200);
    const other = await request(app).patch(`/api/v1/notes/${noteId}`).set(as("leaderB")).send({ body: "Hijacked" });
    expect([403, 404]).toContain(other.status);
    const stored = (await db.engagementNote.findUnique({ where: { id: noteId } }))?.body ?? "";
    expect(stored).toContain("Edited body");
    expect(stored).not.toContain("Hijacked");
  });
});

describe("reviewing submissions", () => {
  it("reviews their own student's submission and returns it for revision", async () => {
    const start = await request(app)
      .put(`/api/v1/submissions/by-assignment/${w.assignmentId}`)
      .set({ authorization: `Bearer ${w.tokens.studentA}` });
    const publicId = start.body.data.publicId as string;
    await request(app)
      .patch(`/api/v1/submissions/${publicId}`)
      .set({ authorization: `Bearer ${w.tokens.studentA}` })
      .send({ text: "done", submit: true })
      .expect(200);

    const res = await request(app)
      .post(`/api/v1/submissions/${publicId}/review`)
      .set(as("leaderA"))
      .send({ feedback: "Please expand", returnForRevision: true });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ reviewed: true, returnedForRevision: true });
    expect((await db.submission.findUnique({ where: { publicId } }))?.status).toBe("RETURNED");
  });

  it("cannot review the other group's submission", async () => {
    const res = await request(app)
      .post(`/api/v1/submissions/${w.submissionBPublicId}/review`)
      .set(as("leaderA"))
      .send({ feedback: "nope" });
    expect(res.status).toBe(403);
    expect((await db.submission.findUnique({ where: { publicId: w.submissionBPublicId } }))?.status).toBe("SUBMITTED");
  });
});

describe("season-admin writes a leader is refused", () => {
  it("cannot create sessions, assignments, quizzes or check-in codes, or edit the group", async () => {
    await expectStatuses(app, w.tokens.leaderA, [
      ["post", "/api/v1/sessions", 403, { seasonId: w.seasonId, title: "Leader session", startDay: "2099-05-01", startTime: "18:00", durationMinutes: 60 }],
      ["patch", `/api/v1/sessions/${w.sessionId}`, 403, { title: "Hijacked", startDay: "2099-05-01", startTime: "18:00", durationMinutes: 60, scope: "one" }],
      ["post", `/api/v1/sessions/${w.sessionId}/check-in-open`, 403],
      ["post", "/api/v1/quizzes", 403, { seasonId: w.seasonId, title: "Leader quiz", kind: "PAPER", maxScore: 10 }],
      ["patch", `/api/v1/assignments/${w.assignmentId}`, 403, { title: "Hijacked" }],
      ["delete", `/api/v1/assignments/${w.assignmentId}`, 403],
      ["patch", `/api/v1/groups/${w.groupAId}`, 403, { name: "Hijacked" }],
      ["patch", `/api/v1/seasons/${w.seasonId}`, 403, { title: "Hijacked" }],
    ]);
    expect((await db.session.findUnique({ where: { id: w.sessionId } }))?.title).toBe("MW Session");
    expect((await db.group.findUnique({ where: { id: w.groupAId } }))?.name).toBe("Group A");
  });
});
