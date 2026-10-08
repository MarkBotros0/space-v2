import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { canViewNote, noteVisibilityWhere } from "../../lib/permissions";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

jest.setTimeout(60000);

/**
 * REG-97 leak detector. The owner's rule: the staff-only profile `notes` field
 * and every pastoral (EngagementNote) body are NEVER visible to the student they
 * are about. Each case seeds recognisable secrets, calls a route a student can
 * reach, and asserts the secret string is nowhere in the response — so a future
 * select that picks the column up, or a spread that carries it, fails here
 * whatever the field is called.
 */
const app = createApp();

const PROFILE_SECRET = "SECRET-PROFILE-NOTE-4f1c";
const PASTORAL_SECRET = "SECRET-PASTORAL-NOTE-9a7e";

let seasonId: number;
let studentId: number;
let studentToken: string;
let alumnusToken: string;
let superToken: string;
let noteId: number;

beforeAll(async () => {
  await cleanupTestData();
  seasonId = (await createTestSeason()).id;

  const superUser = await createTestUser("super", "SUPER");
  const student = await createTestUser("student", "STUDENT");
  const alumnus = await createTestUser("alumnus", "STUDENT");
  studentId = student.id;
  await db.user.update({ where: { id: alumnus.id }, data: { graduationYear: 2024 } });

  await db.studentProfile.create({
    data: {
      userId: studentId,
      activeSeasonId: seasonId,
      university: "Test University",
      notes: PROFILE_SECRET,
    },
  });
  await db.studentProfile.create({
    data: { userId: alumnus.id, notes: PROFILE_SECRET },
  });
  await db.seasonEnrollment.create({
    data: { studentUserId: studentId, seasonId, status: "ACTIVE" },
  });
  await db.seasonEnrollment.create({
    data: { studentUserId: alumnus.id, seasonId, status: "COMPLETED", completedAt: new Date() },
  });

  for (const visibility of ["LEADERS", "MENTORS", "ADMINS"] as const) {
    const n = await db.engagementNote.create({
      data: {
        studentUserId: studentId,
        authorUserId: superUser.id,
        seasonId,
        body: `<p>${PASTORAL_SECRET} ${visibility}</p>`,
        visibility,
        followUpFlagged: true,
      },
      select: { id: true },
    });
    noteId = n.id;
  }

  superToken = await login(app, superUser.email);
  studentToken = await login(app, student.email);
  alumnusToken = await login(app, alumnus.email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

const as = (token: string) => ({
  get: (path: string) => request(app).get(path).set("authorization", `Bearer ${token}`),
  patch: (path: string, body: object) =>
    request(app).patch(path).set("authorization", `Bearer ${token}`).send(body),
  post: (path: string, body: object) =>
    request(app).post(path).set("authorization", `Bearer ${token}`).send(body),
});

function expectNoSecrets(res: { text: string }): void {
  expect(res.text).not.toContain(PROFILE_SECRET);
  expect(res.text).not.toContain(PASTORAL_SECRET);
  expect(res.text).not.toMatch(/"notes"/);
}

describe("a student never receives the profile notes or pastoral notes (REG-97)", () => {
  it("sanity: staff do see the profile note, so the secrets are really in the data", async () => {
    const res = await as(superToken).get(`/api/v1/students/${studentId}`);
    expect(res.body.data.profile.notes).toBe(PROFILE_SECRET);
    const notes = await as(superToken).get(`/api/v1/students/${studentId}/notes`);
    expect(notes.text).toContain(PASTORAL_SECRET);
  });

  it.each([
    ["/api/v1/me"],
    ["/api/v1/me/profile"],
    ["/api/v1/me/season"],
    ["/api/v1/me/season-history"],
    ["/api/v1/me/attendance"],
    ["/api/v1/me/dashboard"],
    ["/api/v1/me/notification-preferences"],
    ["/api/v1/notifications"],
  ])("GET %s carries neither secret nor any `notes` key", async (path) => {
    const res = await as(studentToken).get(path);
    expect([200, 403, 404]).toContain(res.status);
    expectNoSecrets(res);
  });

  it("GET /students/:id for the student themselves omits notes (private arm)", async () => {
    const res = await as(studentToken).get(`/api/v1/students/${studentId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.profile).toHaveProperty("university", "Test University");
    expectNoSecrets(res);
  });

  it("the student's engagement arm and the session/enrolment views carry none", async () => {
    for (const path of [
      `/api/v1/students/${studentId}/engagement`,
      `/api/v1/seasons/${seasonId}`,
      `/api/v1/seasons/${seasonId}/sessions`,
    ]) {
      expectNoSecrets(await as(studentToken).get(path));
    }
  });

  it("every note route refuses a student", async () => {
    expect((await as(studentToken).get(`/api/v1/students/${studentId}/notes`)).status).toBe(403);
    expect((await as(studentToken).get("/api/v1/me/notes")).status).toBe(403);
    const post = await as(studentToken).post(`/api/v1/students/${studentId}/notes`, {
      body: "about me",
      visibility: "LEADERS",
    });
    expect(post.status).toBe(403);
    const patch = await as(studentToken).patch(`/api/v1/notes/${noteId}`, { body: "rewrite" });
    expect(patch.status).toBe(403);
    expectNoSecrets(patch);
  });

  it("refuses a self-edit that names `notes`, on both write routes, and writes nothing", async () => {
    for (const [path, body] of [
      ["/api/v1/me/profile", { notes: "mine now" }],
      [`/api/v1/students/${studentId}`, { notes: "mine now" }],
    ] as const) {
      const res = await as(studentToken).patch(path, body);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("forbidden_field");
      expectNoSecrets(res);
    }
    const row = await db.studentProfile.findUnique({
      where: { userId: studentId },
      select: { notes: true },
    });
    expect(row?.notes).toBe(PROFILE_SECRET);
  });

  it("a legitimate self-edit answers without notes", async () => {
    const res = await as(studentToken).patch("/api/v1/me/profile", { university: "New U" });
    expect(res.status).toBe(200);
    expectNoSecrets(res);
  });

  it("an alumnus (a student with graduationYear) is held to the same rule", async () => {
    for (const path of ["/api/v1/me", "/api/v1/me/profile"]) {
      expectNoSecrets(await as(alumnusToken).get(path));
    }
  });
});

describe("the pastoral-note surfaces refuse a student outright (REG-97)", () => {
  it.each([
    ["student", () => studentToken],
    ["alumnus", () => alumnusToken],
  ])("%s gets 403 and no body from every note route", async (_label, token) => {
    const list = await as(token()).get(`/api/v1/students/${studentId}/notes`);
    const mine = await as(token()).get("/api/v1/me/notes");
    const edit = await as(token()).patch(`/api/v1/notes/${noteId}`, { body: "<p>x</p>" });
    for (const res of [list, mine, edit]) {
      expect(res.status).toBe(403);
      expectNoSecrets(res);
    }
  });

  it("the shared visibility rule is closed for a student, even about themselves", async () => {
    const student = {
      userId: studentId,
      role: "STUDENT" as const,
      seasonAdminIds: [],
      groupLeaderIds: [],
      activeSeasonId: seasonId,
      graduationYear: null,
    };
    expect(noteVisibilityWhere(student)).toBeNull();
    expect(await canViewNote(student, noteId)).toBe(false);
  });
});
