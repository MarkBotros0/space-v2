// Community model, Build 3, Task 5: an alumnus studying in a community-wide
// season gets the student experience and stays an alumnus. An alumnus who
// isn't studying keeps today's refusals.
import request from "supertest";

import { db } from "../../db/client";
import { verifyAccessToken } from "../../lib/auth/tokens";
import { buildPublishedQuizIn } from "./quizzes-setup";
import { add, adminTokenOf, app, as, ctx, person, season, seedEnrollmentFixtures, teardownEnrollmentFixtures } from "./season-enrollments-setup";
import { createTestUser, login, PASSWORD, reviewedOf, testEventTitle } from "./fixtures";

jest.setTimeout(120000);

const NAME = "Studying Alumnus";
const GRADUATE = "Regular Graduate";

let wideId: number;
let regularId: number;
let sessionId: number;
let assignmentId: number;
let studyingId: number;
let studying: string;
let notStudying: string;
let ordinary: string;
let admin: string;
let mentor: string;
let alumniEventTitle: string;

const get = (path: string, token: string) => request(app).get(`/api/v1${path}`).set(as(token));
/** Whole-body check: these rows differ in shape, and the name is what a staff member reads. */
const lists = (body: unknown, name: string) => JSON.stringify(body).includes(name);

beforeAll(async () => {
  await seedEnrollmentFixtures();
  wideId = await season("ACTIVE", "Community Season");
  await db.season.update({ where: { id: wideId }, data: { isCommunityWide: true } });
  regularId = await season("COMPLETED", "Old Regular");

  const alumnus = await person(NAME, 2019);
  studyingId = alumnus.id;
  const graduate = await person(GRADUATE, 2018);
  const plain = await person("Plain Student", null);
  await db.seasonEnrollment.createMany({
    data: [
      { seasonId: wideId, studentUserId: alumnus.id, status: "ACTIVE" },
      { seasonId: wideId, studentUserId: plain.id, status: "ACTIVE" },
      { seasonId: regularId, studentUserId: alumnus.id, status: "COMPLETED", result: "PASSED" },
      { seasonId: regularId, studentUserId: graduate.id, status: "COMPLETED", result: "PASSED" },
    ],
  });
  sessionId = (await db.session.create({
    data: { seasonId: wideId, title: "Wide session", startsAt: new Date(Date.now() + 30 * 60_000), durationMinutes: 90 },
    select: { id: true },
  })).id;
  assignmentId = (await db.assignment.create({
    data: { seasonId: wideId, title: "Wide essay", description: "Write it", isAllGroups: true, dueAt: new Date("2099-04-01T00:00:00.000Z") },
    select: { id: true },
  })).id;

  alumniEventTitle = testEventTitle("alumni-only");
  await db.jpcEvent.create({
    data: { title: alumniEventTitle, visibility: "ALUMNI_ONLY", date: new Date("2099-05-01T18:00:00.000Z"), createdById: ctx.superId },
  });

  studying = await login(app, alumnus.email);
  notStudying = await login(app, graduate.email);
  ordinary = await login(app, plain.email);
  admin = await adminTokenOf(wideId);
  mentor = await login(app, (await createTestUser("se-mentor", "MENTOR")).email);
});

afterAll(teardownEnrollmentFixtures);

describe("the token", () => {
  it("/me carries the season and the graduation year together", async () => {
    const res = await get("/me", studying);
    expect(res.status).toBe(200);
    expect(res.body.data.scopes).toMatchObject({ activeSeasonId: wideId, graduationYear: 2019 });
    expect(res.body.data.user.role).toBe("STUDENT");
    const own = await get("/me/profile", studying);
    expect(own.body.data.profile).toMatchObject({ graduationYear: 2019, activeSeasonTitle: "Community Season" });
  });
});

describe("their own student pages", () => {
  it("Today has student content, not a 403", async () => {
    const res = await get("/me/dashboard", studying);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual((await get("/me/dashboard", ordinary)).body.data);
  });

  it("an alumnus who isn't studying still gets the 403", async () => {
    expect((await get("/me/dashboard", notStudying)).status).toBe(403);
  });

  it("their season, attendance and history read as a student's", async () => {
    expect((await get("/me/season", studying)).body.data.season.id).toBe(wideId);
    expect((await get("/me/attendance", studying)).status).toBe(200);
    const history = await get("/me/season-history", studying);
    expect(history.body.data.seasons.map((s: { seasonId: number }) => s.seasonId)).toEqual([regularId]);
  });

  it("edits their own student profile; an alumnus who isn't studying can't", async () => {
    const body = { university: "Cairo University", universityGraduationYear: 2030 };
    const res = await request(app).patch("/api/v1/me/profile").set(as(studying)).send(body);
    expect(res.status).toBe(200);
    const row = await db.user.findUniqueOrThrow({ where: { id: studyingId }, select: { graduationYear: true } });
    // The university's year never touches the community's.
    expect(row.graduationYear).toBe(2019);
    expect((await request(app).patch("/api/v1/me/profile").set(as(notStudying)).send(body)).status).toBe(403);
  });
});

describe("their work", () => {
  it("starts, saves and submits a quiz attempt; an alumnus who isn't studying is refused", async () => {
    const quiz = await buildPublishedQuizIn(wideId, sessionId, { withEssay: false });
    const path = `/api/v1/quizzes/${quiz.quizId}/attempt`;
    expect((await request(app).put(path).set(as(studying))).status).toBe(200);
    const save = await request(app).patch(path).set(as(studying))
      .send({ answers: [{ questionId: quiz.mcqId, selectedIndex: 1, text: null }] });
    expect(save.status).toBe(200);
    const submit = await request(app).post(`${path}/submit`).set(as(studying));
    expect(submit.status).toBe(200);
    expect(submit.body.data.status).toBe("GRADED");
    expect((await request(app).put(path).set(as(notStudying))).status).toBe(403);
  });

  it("submits an assignment; an alumnus who isn't studying is refused", async () => {
    const start = await request(app).put(`/api/v1/submissions/by-assignment/${assignmentId}`).set(as(studying));
    expect(start.status).toBeLessThan(300);
    const submit = await request(app)
      .patch(`/api/v1/submissions/${start.body.data.publicId}`)
      .set(as(studying))
      .send({ text: "real work", submit: true });
    expect(submit.status).toBe(200);
    expect((await db.submission.findUniqueOrThrow({ where: { publicId: start.body.data.publicId }, select: { status: true } })).status).toBe("SUBMITTED");
    const refused = await request(app).put(`/api/v1/submissions/by-assignment/${assignmentId}`).set(as(notStudying));
    expect(refused.status).toBe(403);
  });

  it("checks in; an alumnus who isn't studying is refused", async () => {
    const open = await request(app).post(`/api/v1/sessions/${sessionId}/check-in-open`).set(as(admin));
    const token = open.body.data.checkInToken;
    const res = await request(app).post("/api/v1/sessions/check-in").set(as(studying)).send({ token });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("PRESENT");
    const refused = await request(app).post("/api/v1/sessions/check-in").set(as(notStudying)).send({ token });
    expect(refused.status).toBe(403);
  });
});

describe("what staff read for the season", () => {
  it.each([
    ["attendance roster", () => `/sessions/${sessionId}/attendance`],
    ["assignment tracker", () => `/assignments/${assignmentId}/tracker`],
    ["season roster", () => `/seasons/${wideId}/roster`],
    ["End's review", () => `/seasons/${wideId}/end-check`],
    ["engagement report", () => `/reports/engagement/students?seasonId=${wideId}`],
    ["students of the season", () => `/students?status=active&seasonId=${wideId}`],
    ["an admin's own Students", () => "/students?status=active"],
  ])("%s lists them", async (_label, path) => {
    const res = await get(path(), admin);
    expect(res.status).toBe(200);
    expect(lists(res.body, NAME)).toBe(true);
  });

  it("a Super's global Students list keeps to graduationYear; the Alumni list keeps them", async () => {
    const all = await get("/students?status=active&limit=100", ctx.superToken);
    expect(lists(all.body, NAME)).toBe(false);
    expect(lists(all.body, "Plain Student")).toBe(true);
    const alumni = await get("/students?status=alumni&limit=100", ctx.superToken);
    expect(lists(alumni.body, NAME)).toBe(true);
  });

  it("a Super filtering on the season finds them", async () => {
    const res = await get(`/students?status=active&seasonId=${wideId}`, ctx.superToken);
    expect(lists(res.body, NAME)).toBe(true);
  });

  it("a Super and a Mentor filtering on the community-wide season's group find them", async () => {
    const group = await db.group.create({ data: { seasonId: wideId, name: "Wide Group" } });
    await db.groupStudent.create({ data: { groupId: group.id, seasonId: wideId, studentUserId: studyingId } });
    await db.seasonEnrollment.updateMany({
      where: { seasonId: wideId, studentUserId: studyingId },
      data: { groupId: group.id },
    });
    for (const token of [ctx.superToken, mentor]) {
      const res = await get(`/students?status=active&groupId=${group.id}&limit=100`, token);
      expect(res.status).toBe(200);
      expect(lists(res.body, NAME)).toBe(true);
    }
  });

  it("a regular season's graduates stay off its student list", async () => {
    const res = await get(`/students?status=active&seasonId=${regularId}`, ctx.superToken);
    expect(lists(res.body, GRADUATE)).toBe(false);
    expect(lists(res.body, NAME)).toBe(false);
  });

  it("a Mentor's feed shows their marks in this season, not an alumnus's marks from before", async () => {
    const old = await db.session.create({
      data: { seasonId: regularId, title: "Old regular session", startsAt: new Date("2020-03-01T18:00:00.000Z"), durationMinutes: 90 },
      select: { id: true },
    });
    await db.attendance.create({ data: { sessionId: old.id, studentUserId: studyingId, status: "PRESENT", markedAt: new Date() } });
    const res = await get("/me/dashboard", mentor);
    expect(res.status).toBe(200);
    expect(lists(res.body, "Wide session")).toBe(true);
    expect(lists(res.body, "Old regular session")).toBe(false);
  });
});

describe("events", () => {
  it("alumni-only events still list for them, and not for a student", async () => {
    expect(lists((await get("/events", studying)).body, alumniEventTitle)).toBe(true);
    expect(lists((await get("/events", notStudying)).body, alumniEventTitle)).toBe(true);
    expect(lists((await get("/events", ordinary)).body, alumniEventTitle)).toBe(false);
  });
});

describe("a token crossing the season's start and end", () => {
  it("an alumnus joins, the season starts, refresh gives the season; End clears it and the old attempt is refused", async () => {
    // A community-wide season runs alone: the file's live one is done before this one starts.
    await db.season.update({ where: { id: wideId }, data: { status: "COMPLETED" } });
    const draft = await season("DRAFT", "Crossing Season");
    await db.season.update({
      where: { id: draft },
      data: { isCommunityWide: true, startDate: new Date("2099-01-01T00:00:00.000Z"), endDate: new Date("2099-06-01T00:00:00.000Z") },
    });
    const alumnus = await person("Crossing Alumnus", 2017);
    const email = alumnus.email;
    const first = await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD });
    const refreshOf = (res: request.Response) => res.body.data.refreshToken as string;
    const refresh = async (token: string) => request(app).post("/api/v1/auth/refresh").send({ refreshToken: token });
    const claim = async (res: request.Response) => (await verifyAccessToken(res.body.data.accessToken))?.activeSeasonId ?? null;

    expect((await add(draft, { userIds: [alumnus.id] })).status).toBe(201);
    const started = await request(app).post(`/api/v1/seasons/${draft}/start`).set(as(ctx.superToken));
    expect([started.status, started.body.error?.message]).toEqual([200, undefined]);
    const during = await refresh(refreshOf(first));
    expect(during.status).toBe(200);
    expect(await claim(during)).toBe(draft);

    const quiz = await buildPublishedQuizIn(draft, (await db.session.create({
      data: { seasonId: draft, title: "Crossing session", startsAt: new Date("2099-03-01T18:00:00.000Z"), durationMinutes: 60 },
      select: { id: true },
    })).id, { withEssay: false });
    const path = `/api/v1/quizzes/${quiz.quizId}/attempt`;
    const oldToken = during.body.data.accessToken as string;
    expect((await request(app).put(path).set(as(oldToken))).status).toBe(200);

    const end = await request(app).post(`/api/v1/seasons/${draft}/end`).set(as(ctx.superToken)).send({ notPassed: [], reviewed: await reviewedOf(draft) });
    expect(end.status).toBe(200);
    const after = await refresh(refreshOf(during));
    expect(after.status).toBe(200);
    expect(await claim(after)).toBeNull();
    expect((await request(app).put(path).set(as(after.body.data.accessToken as string))).status).toBe(403);
  });
});
