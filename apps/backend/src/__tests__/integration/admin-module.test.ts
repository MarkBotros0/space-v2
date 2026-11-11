/**
 * Admin module: a season admin runs their own season and nothing else.
 *
 * "admin" administers the world's season; "otherAdmin" administers a
 * different season. The rules under test:
 *  - a season admin reads everything in their season, across all groups,
 *    including the roster, exports, check-in codes and video questions;
 *  - creates and edits sessions, quizzes and check-in in their season, and
 *    reviews any submission in it;
 *  - never touches another season, and never holds SUPER powers
 *    (users, organisation report, imports);
 *  - an admin of another season is refused this season's data.
 */
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData } from "./fixtures";
import { expectStatuses, seedModuleWorld, type ModuleWorld } from "./module-world";

jest.setTimeout(120000);

const app = createApp();
let w: ModuleWorld;
const asAdmin = () => ({ authorization: `Bearer ${w.tokens.admin}` });

beforeAll(async () => {
  w = await seedModuleWorld(app);
});

afterAll(async () => {
  await cleanupTestData();
});

describe("reads a season admin is allowed", () => {
  it("everything in their season, across both groups", async () => {
    await expectStatuses(app, w.tokens.admin, [
      ["get", `/api/v1/seasons/${w.seasonId}`, 200],
      ["get", `/api/v1/seasons/${w.seasonId}/roster`, 200],
      ["get", `/api/v1/seasons/${w.seasonId}/exports/manifest`, 200],
      ["get", `/api/v1/sessions/${w.sessionId}/attendance`, 200],
      ["get", `/api/v1/sessions/${w.sessionId}/check-in`, 200],
      ["get", `/api/v1/sessions/${w.sessionId}/video-questions`, 200],
      ["get", `/api/v1/sessions/${w.sessionId}/video-quiz/results`, 200],
      ["get", `/api/v1/assignments/${w.assignmentId}/progress`, 200],
      ["get", `/api/v1/groups/${w.groupAId}`, 200],
      ["get", `/api/v1/groups/${w.groupBId}`, 200],
      ["get", `/api/v1/groups/${w.groupAId}/impact`, 200],
      ["get", `/api/v1/students/${w.ids.studentA}`, 200],
      ["get", `/api/v1/students/${w.ids.studentB}`, 200],
      ["get", `/api/v1/students/${w.ids.studentA}/notes`, 200],
      ["get", `/api/v1/students/${w.ids.studentB}/submissions`, 200],
      ["get", `/api/v1/submissions/${w.submissionBPublicId}`, 200],
      ["get", `/api/v1/quizzes/${w.quizId}/grades`, 200],
      ["get", "/api/v1/reports/engagement", 200],
    ]);
  });
});

describe("reads a season admin is refused", () => {
  it("another season", async () => {
    await expectStatuses(app, w.tokens.admin, [
      ["get", `/api/v1/seasons/${w.otherSeasonId}`, 403],
      ["get", `/api/v1/sessions/${w.otherSessionId}`, 403],
      ["get", `/api/v1/assignments/${w.otherAssignmentId}`, 403],
    ]);
  });

  it("SUPER-only surfaces and student self-service", async () => {
    await expectStatuses(app, w.tokens.admin, [
      ["get", "/api/v1/reports/organisation", 403],
      ["get", "/api/v1/users", 403],
      ["get", "/api/v1/imports/students/template", 403],
      ["get", "/api/v1/me/season", 403],
      ["get", "/api/v1/me/profile", 403],
    ]);
  });

  it("an admin of another season is refused all of this season's data", async () => {
    await expectStatuses(app, w.tokens.otherAdmin, [
      ["get", `/api/v1/seasons/${w.seasonId}`, 403],
      ["get", `/api/v1/seasons/${w.seasonId}/roster`, 403],
      ["get", `/api/v1/seasons/${w.seasonId}/exports/manifest`, 403],
      ["get", `/api/v1/sessions/${w.sessionId}`, 403],
      ["get", `/api/v1/sessions/${w.sessionId}/attendance`, 403],
      ["get", `/api/v1/assignments/${w.assignmentId}`, 403],
      ["get", `/api/v1/groups/${w.groupAId}`, 403],
      ["get", `/api/v1/students/${w.ids.studentA}`, 403],
      ["get", `/api/v1/students/${w.ids.studentA}/notes`, 403],
      ["get", `/api/v1/submissions/${w.submissionBPublicId}`, 403],
      ["get", `/api/v1/quizzes/${w.quizId}/grades`, 403],
    ]);
  });
});

describe("season-admin writes", () => {
  it("creates a session in their season and is refused in another", async () => {
    const body = { title: "Admin session", startDay: "2099-05-01", startTime: "18:00", durationMinutes: 60 };
    const ok = await request(app)
      .post("/api/v1/sessions")
      .set(asAdmin())
      .send({ ...body, seasonId: w.seasonId });
    expect(ok.status).toBe(201);
    const other = await request(app)
      .post("/api/v1/sessions")
      .set(asAdmin())
      .send({ ...body, seasonId: w.otherSeasonId });
    expect(other.status).toBe(403);
    expect(await db.session.count({ where: { seasonId: w.otherSeasonId, title: "Admin session" } })).toBe(0);
  });

  it("creates a quiz in their season and is refused in another", async () => {
    const body = { title: "Admin quiz", kind: "PAPER", maxScore: 20 };
    const ok = await request(app)
      .post("/api/v1/quizzes")
      .set(asAdmin())
      .send({ ...body, seasonId: w.seasonId });
    expect(ok.status).toBe(201);
    const other = await request(app)
      .post("/api/v1/quizzes")
      .set(asAdmin())
      .send({ ...body, seasonId: w.otherSeasonId });
    expect(other.status).toBe(403);
  });

  it("opens check-in for their season's session, not another season's", async () => {
    const ok = await request(app).post(`/api/v1/sessions/${w.sessionId}/check-in-open`).set(asAdmin());
    expect(ok.status).toBe(200);
    const other = await request(app).post(`/api/v1/sessions/${w.otherSessionId}/check-in-open`).set(asAdmin());
    expect(other.status).toBe(403);
  });

  it("marks attendance for any group in their season", async () => {
    const res = await request(app)
      .post(`/api/v1/sessions/${w.sessionId}/attendance`)
      .set(asAdmin())
      .send({
        entries: [
          { studentUserId: w.ids.studentA, status: "PRESENT" },
          { studentUserId: w.ids.studentB, status: "LATE", lateMinutes: 10 },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.data.saved).toBe(2);
  });

  it("reviews an essay from either group", async () => {
    const res = await request(app)
      .post(`/api/v1/submissions/${w.submissionBPublicId}/review`)
      .set(asAdmin())
      .send({ action: "reviewed", feedback: "Well done" });
    expect(res.status).toBe(200);
    const essay = await db.assignmentPartWork.findUnique({ where: { publicId: w.submissionBPublicId } });
    expect(essay?.status).toBe("REVIEWED");
  });

  it("renames a group in their season", async () => {
    const res = await request(app)
      .patch(`/api/v1/groups/${w.groupAId}`)
      .set(asAdmin())
      .send({ name: "Group A renamed" });
    expect(res.status).toBe(200);
    expect((await db.group.findUnique({ where: { id: w.groupAId } }))?.name).toBe("Group A renamed");
  });

  it("an admin of another season can't write here", async () => {
    await expectStatuses(app, w.tokens.otherAdmin, [
      [
        "post",
        "/api/v1/sessions",
        403,
        { seasonId: w.seasonId, title: "Intruder", startDay: "2099-05-01", startTime: "18:00", durationMinutes: 60 },
      ],
      ["post", `/api/v1/sessions/${w.sessionId}/check-in-open`, 403],
      ["patch", `/api/v1/groups/${w.groupBId}`, 403, { name: "Intruder" }],
      ["post", `/api/v1/submissions/${w.submissionBPublicId}/review`, 403, { feedback: "Intruder" }],
    ]);
    expect((await db.group.findUnique({ where: { id: w.groupBId } }))?.name).toBe("Group B");
  });

  it("cannot manage users", async () => {
    await expectStatuses(app, w.tokens.admin, [
      ["patch", `/api/v1/users/${w.ids.leaderA}`, 403, { name: "Hijacked", role: "ADMIN", graduationYear: 2015 }],
      ["post", `/api/v1/users/${w.ids.studentA}/deactivate`, 403],
    ]);
  });
});
