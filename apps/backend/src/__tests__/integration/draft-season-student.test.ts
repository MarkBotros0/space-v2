// I3: a draft's roster doesn't count yet. A student on it gets no notification,
// sees read-only, and can't submit into it.
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { loadScopes } from "../../lib/auth/scopes";
import { signAccessToken } from "../../lib/auth/tokens";
import { hasActiveEnrollment } from "../../lib/permissions";
import { cleanupTestData, createTestSeason, createTestUser } from "./fixtures";

jest.setTimeout(120000);

const app = createApp();

async function mint(userId: number) {
  const scopes = await loadScopes(userId);
  return (await signAccessToken({ userId, ...scopes })).token;
}
const call = (m: "get" | "post" | "put" | "delete", path: string, t: string) =>
  request(app)[m](`/api/v1${path}`).set("authorization", `Bearer ${t}`);

let adminT: string;
beforeAll(async () => {
  await cleanupTestData();
  adminT = await mint((await createTestUser("draft-super", "SUPER")).id);
});
afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

async function world(status: "DRAFT" | "ACTIVE", label: string) {
  const season = await createTestSeason({ status });
  const student = await createTestUser(`draft-${label}`, "STUDENT");
  await db.seasonEnrollment.create({ data: { seasonId: season.id, studentUserId: student.id, status: "ACTIVE" } });
  const assignment = await db.assignment.create({
    data: { seasonId: season.id, title: "Set work", isAllGroups: true },
    select: { id: true },
  });
  return { seasonId: season.id, studentId: student.id, assignmentId: assignment.id, token: await mint(student.id) };
}
const notices = (userId: number) => db.notification.count({ where: { userId } });

describe("hasActiveEnrollment", () => {
  const asUser = (userId: number) =>
    ({ userId, role: "STUDENT", seasonAdminIds: [], groupLeaderIds: [], activeSeasonId: null }) as unknown as Parameters<
      typeof hasActiveEnrollment
    >[0];

  it("is true only for an ACTIVE enrolment in an ACTIVE, live season", async () => {
    const active = await world("ACTIVE", "pred-active");
    expect(await hasActiveEnrollment(asUser(active.studentId), active.seasonId)).toBe(true);
    const draft = await world("DRAFT", "pred-draft");
    expect(await hasActiveEnrollment(asUser(draft.studentId), draft.seasonId)).toBe(false);
    const gone = await world("ACTIVE", "pred-gone");
    await db.season.update({ where: { id: gone.seasonId }, data: { deletedAt: new Date() } });
    expect(await hasActiveEnrollment(asUser(gone.studentId), gone.seasonId)).toBe(false);
  });
});

describe("a student on a draft's roster", () => {
  it("reads an assignment as readOnly and can't start a submission", async () => {
    const w = await world("DRAFT", "readonly");
    const read = await call("get", `/assignments/${w.assignmentId}`, w.token);
    expect(read.status).toBe(200);
    expect(read.body.data.readOnly).toBe(true);
    const start = await call("put", `/submissions/by-assignment/${w.assignmentId}`, w.token);
    expect(start.status).toBe(403);
    expect(await db.submission.count({ where: { assignmentId: w.assignmentId } })).toBe(0);
  });

  it("the same student in an ACTIVE season can work", async () => {
    const w = await world("ACTIVE", "works");
    const read = await call("get", `/assignments/${w.assignmentId}`, w.token);
    expect(read.body.data.readOnly).toBe(false);
    expect((await call("put", `/submissions/by-assignment/${w.assignmentId}`, w.token)).status).toBe(200);
  });

  it("can't check in to a draft's session", async () => {
    const w = await world("DRAFT", "checkin");
    await db.session.create({
      data: {
        seasonId: w.seasonId, title: "S", startsAt: new Date(), durationMinutes: 60,
        checkInToken: "draft-checkin-token", checkInOpenAt: new Date(Date.now() - 60_000),
      },
    });
    const res = await call("post", "/sessions/check-in", w.token).send({ token: "draft-checkin-token" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("not_enrolled");
  });

  it.each([
    ["DRAFT" as const, 0],
    ["ACTIVE" as const, 1],
  ])("creating an assignment in a %s season sends %i notification", async (status, expected) => {
    const w = await world(status, `assign-${status.toLowerCase()}`);
    const res = await call("post", `/seasons/${w.seasonId}/assignments`, adminT).send({
      title: "New work", isAllGroups: true, groupIds: [],
    });
    expect(res.status).toBe(201);
    expect(await notices(w.studentId)).toBe(expected);
  });

  it.each([
    ["DRAFT" as const, 0],
    ["ACTIVE" as const, 1],
  ])("publishing a quiz in a %s season sends %i notification", async (status, expected) => {
    const w = await world(status, `quiz-${status.toLowerCase()}`);
    const quiz = await db.quiz.create({
      data: {
        seasonId: w.seasonId, title: "Q", kind: "ONLINE", maxScore: 1,
        questions: { create: [{ order: 1, type: "MCQ", prompt: "?", points: 1, options: ["a", "b"], correctIndex: 0 }] },
      },
      select: { id: true },
    });
    const res = await call("post", `/quizzes/${quiz.id}/publish`, adminT).send({ publish: true });
    expect(res.status).toBe(200);
    expect(await notices(w.studentId)).toBe(expected);
  });

  it.each([
    ["DRAFT" as const, 0],
    ["ACTIVE" as const, 1],
  ])("cancelling a session in a %s season sends %i notification", async (status, expected) => {
    const w = await world(status, `cancel-${status.toLowerCase()}`);
    const session = await db.session.create({
      data: { seasonId: w.seasonId, title: "Later", startsAt: new Date(Date.now() + 86_400_000), durationMinutes: 60 },
      select: { id: true },
    });
    const res = await call("delete", `/sessions/${session.id}`, adminT).send({});
    expect(res.status).toBe(200);
    expect(await notices(w.studentId)).toBe(expected);
  });
});
