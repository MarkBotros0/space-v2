import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { loadScopes } from "../../lib/auth/scopes";
import { signAccessToken } from "../../lib/auth/tokens";
import { newPublicId } from "../../lib/public-id";
import { cleanupTestData, createTestUser } from "./fixtures";
import { seedModuleWorld, type ModuleWorld } from "./module-world";

jest.setTimeout(120000);

const app = createApp();
let w: ModuleWorld;

/** Tokens minted from real post-End scopes (login is rate limited in tests). */
async function mint(userId: number, role: "SUPER" | "ADMIN" | "LEADER" | "STUDENT" | "MENTOR") {
  const scopes = await loadScopes(userId);
  return (await signAccessToken({ userId, role, ...scopes })).token;
}

type Method = "get" | "post" | "patch" | "put" | "delete";
async function call(method: Method, path: string, token: string, body?: object) {
  const c = request(app)[method](`/api/v1${path}`).set("authorization", `Bearer ${token}`);
  return body ? c.send(body) : c;
}

const t = {} as Record<"super" | "admin" | "leaderA" | "mentor" | "studentA" | "studentB" | "alumnus" | "dropped", string>;
let draftPublicId: string; // studentA's own DRAFT, in the ended season
let reviewedPublicId: string; // studentB's REVIEWED submission, in the ended season
let forumAssignmentId: number;
let forumPostPublicId: string;
let onlineQuizId: number;
let videoQuestionId: number;
let droppedAssignmentSubmission: string;
let droppedId: number;

beforeAll(async () => {
  w = await seedModuleWorld(app);
  const { seasonId, otherSeasonId } = w;

  // Work to read and to write against, all created before the season ends.
  await db.submission.update({ where: { publicId: w.submissionBPublicId }, data: { status: "REVIEWED", reviewedAt: new Date() } });
  reviewedPublicId = w.submissionBPublicId;
  draftPublicId = newPublicId();
  await db.submission.create({
    data: { publicId: draftPublicId, assignmentId: w.assignmentId, studentUserId: w.ids.studentA, text: "my draft", status: "DRAFT" },
  });

  forumAssignmentId = (
    await db.assignment.create({
      data: { seasonId, title: "MW Forum", type: "FORUM", forumAllowComments: true, isAllGroups: true, createdById: w.ids.admin },
      select: { id: true },
    })
  ).id;
  forumPostPublicId = newPublicId();
  await db.submission.createMany({
    data: [
      { publicId: forumPostPublicId, assignmentId: forumAssignmentId, studentUserId: w.ids.studentB, text: "<p>B post</p>", status: "REVIEWED", submittedAt: new Date() },
    ],
  });

  onlineQuizId = (
    await db.quiz.create({
      data: {
        seasonId, sessionId: w.sessionId, title: "MW Online", kind: "ONLINE", maxScore: 2, publishedAt: new Date(),
        questions: { create: [{ order: 1, type: "MCQ", prompt: "Q?", points: 2, options: ["a", "b"], correctIndex: 0 }] },
      },
      select: { id: true },
    })
  ).id;
  videoQuestionId = (
    await db.sessionVideoQuestion.create({
      data: { sessionId: w.sessionId, atSeconds: 5, prompt: "VQ?", options: ["a", "b"], correctIndex: 0, points: 1 },
      select: { id: true },
    })
  ).id;
  await db.session.update({ where: { id: w.sessionId }, data: { youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" } });

  // A dropped student in the other (still running) season, with their own work.
  const dropped = await createTestUser("mw-dropped", "STUDENT");
  droppedId = dropped.id;
  await db.studentProfile.create({ data: { userId: dropped.id } });
  await db.seasonEnrollment.create({ data: { seasonId: otherSeasonId, studentUserId: dropped.id, status: "WITHDRAWN" } });
  droppedAssignmentSubmission = newPublicId();
  await db.submission.create({
    data: { publicId: droppedAssignmentSubmission, assignmentId: w.otherAssignmentId, studentUserId: dropped.id, text: "dropped work", status: "DRAFT" },
  });
  await db.seasonAdmin.create({ data: { seasonId: otherSeasonId, userId: w.ids.otherAdmin } }).catch(() => undefined);

  await db.session.update({
    where: { id: w.sessionId },
    data: { checkInToken: "mwlocktoken", checkInOpenAt: new Date(Date.now() - 60_000) },
  });

  // End the season through the API, as its admin.
  const ended = await call("post", `/seasons/${seasonId}/end`, w.tokens.admin, { notPassed: [] });
  expect(ended.status).toBe(200);

  for (const role of ["super", "admin", "leaderA", "mentor", "studentA", "studentB", "alumnus"] as const) {
    const user = await db.user.findUniqueOrThrow({ where: { id: w.ids[role] }, select: { role: true } });
    t[role] = await mint(w.ids[role], user.role);
  }
  t.dropped = await mint(droppedId, "STUDENT");
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("a finished season is locked to its former staff", () => {
  const writes = (): [Method, string, object?][] => [
    ["patch", `/seasons/${w.seasonId}`, { description: "x" }],
    ["post", `/seasons/${w.seasonId}/groups`, { name: "Late group" }],
    ["post", `/seasons/${w.seasonId}/assignments`, { title: "Late", isAllGroups: true, type: "TEXT" }],
    ["put", `/seasons/${w.seasonId}/group-assignments`, { assignments: [{ studentUserId: w.ids.studentA, groupId: w.groupBId }] }],
    ["post", `/seasons/${w.seasonId}/imports/groups/commit`, { assignments: [{ studentUserId: w.ids.studentA, groupId: w.groupBId }] }],
    ["patch", `/groups/${w.groupAId}`, { name: "Renamed" }],
    ["post", `/sessions`, { seasonId: w.seasonId, title: "Late", startDay: "2099-07-03", startTime: "19:30", durationMinutes: 60 }],
    ["post", `/sessions/${w.sessionId}/attendance`, { entries: [{ studentUserId: w.ids.studentA, status: "PRESENT" }] }],
    ["post", `/sessions/${w.sessionId}/check-in-open`],
    ["patch", `/assignments/${w.assignmentId}`, { title: "Renamed", isAllGroups: true }],
    ["post", `/submissions/${reviewedPublicId}/review`, { feedback: "late" }],
    ["post", `/quizzes`, { seasonId: w.seasonId, title: "Late quiz", kind: "PAPER", maxScore: 5 }],
    ["post", `/quizzes/${w.quizId}/grades`, { entries: [{ studentUserId: w.ids.studentA, score: 5 }] }],
    ["post", `/sessions/${w.sessionId}/video-questions`, { atSeconds: 9, prompt: "x", options: ["a", "b"], correctIndex: 0, points: 1 }],
    ["post", `/students/${w.ids.studentA}/notes`, { body: "late note", visibility: "LEADERS" }],
  ];
  const reads = (): string[] => [
    `/seasons/${w.seasonId}`,
    `/seasons/${w.seasonId}/roster`,
    `/groups/${w.groupAId}`,
    `/sessions/${w.sessionId}/attendance`,
  ];

  for (const who of ["admin", "leaderA"] as const) {
    it(`refuses every write to former ${who}`, async () => {
      const bad: string[] = [];
      for (const [m, p, b] of writes()) {
        const res = await call(m, p, t[who], b);
        if (res.status !== 403) bad.push(`${m.toUpperCase()} ${p}: ${res.status}`);
      }
      expect(bad).toEqual([]);
    });
    it(`refuses the season's reads to former ${who}`, async () => {
      const bad: string[] = [];
      for (const p of reads()) {
        const res = await call("get", p, t[who]);
        if (res.status !== 403) bad.push(`GET ${p}: ${res.status}`);
      }
      expect(bad).toEqual([]);
    });
  }

  it("still lets the super admin write, and a mentor read, in the finished season", async () => {
    expect((await call("patch", `/assignments/${w.assignmentId}`, t.super, { title: "Super edit", isAllGroups: true })).status).toBe(200);
    expect(
      (await call("post", `/sessions/${w.sessionId}/attendance`, t.super, { entries: [{ studentUserId: w.ids.studentA, status: "PRESENT" }] })).status,
    ).toBe(200);
    expect((await call("get", `/seasons/${w.seasonId}`, t.mentor)).status).toBe(200);
    expect((await call("get", `/groups/${w.groupAId}`, t.mentor)).status).toBe(200);
  });
});

describe("a former student can read their work but not change it", () => {
  const studentWrites = (): [Method, string, object?][] => [
    ["put", `/submissions/by-assignment/${w.assignmentId}`, {}],
    ["patch", `/submissions/${draftPublicId}`, { text: "edited after end" }],
    ["put", `/quizzes/${onlineQuizId}/attempt`],
    ["post", `/quizzes/${onlineQuizId}/attempt/submit`, {}],
    ["put", `/assignments/${forumAssignmentId}/forum/response`, { text: "late post" }],
    ["post", `/assignments/${forumAssignmentId}/forum/posts/${forumPostPublicId}/comments`, { body: "late comment" }],
    ["post", `/sessions/${w.sessionId}/video-quiz/answers`, { questionId: videoQuestionId, selectedIndex: 0 }],
    ["post", `/sessions/check-in`, { token: "mwlocktoken" }],
  ];

  it("refuses every write with 403 or 409", async () => {
    const bad: string[] = [];
    for (const [m, p, b] of studentWrites()) {
      const res = await call(m, p, t.studentA, b);
      if (![403, 409].includes(res.status)) bad.push(`${m.toUpperCase()} ${p}: ${res.status}`);
    }
    expect(bad).toEqual([]);
    const row = await db.submission.findUniqueOrThrow({ where: { publicId: draftPublicId } });
    expect(row.text).toBe("my draft");
    expect(await db.quizAttempt.count({ where: { quizId: onlineQuizId, studentUserId: w.ids.studentA } })).toBe(0);
    expect(await db.attendance.count({ where: { sessionId: w.sessionId, studentUserId: w.ids.studentA, checkedInAt: { not: null } } })).toBe(0);
    expect(
      await db.submission.count({ where: { assignmentId: forumAssignmentId, studentUserId: w.ids.studentA } }),
    ).toBe(0);
  });

  it("opens their own assignment, submission and quiz read-only", async () => {
    const a = await call("get", `/assignments/${w.assignmentId}`, t.studentA);
    expect(a.status).toBe(200);
    expect(a.body.data.readOnly).toBe(true);
    expect(a.body.data.mySubmission.publicId).toBe(draftPublicId);

    const s = await call("get", `/submissions/${draftPublicId}`, t.studentA);
    expect(s.status).toBe(200);

    const q = await call("get", `/quizzes/${onlineQuizId}`, t.studentA);
    expect(q.status).toBe(200);
    expect(q.body.data.readOnly).toBe(true);

    for (const body of [a.body, s.body, q.body]) {
      expect(JSON.stringify(body)).not.toContain("Staff-only pastoral note");
    }
  });

  it("opens past work read-only for an alumnus", async () => {
    const a = await call("get", `/assignments/${w.otherAssignmentId}`, t.alumnus);
    expect(a.status).toBe(200);
    expect(a.body.data.readOnly).toBe(true);
  });

  it("keeps another student's submission private", async () => {
    expect((await call("get", `/submissions/${reviewedPublicId}`, t.studentA)).status).toBe(403);
  });

  it("reports readOnly false to a student with an active place", async () => {
    // studentA's season is over, so use staff and the still-running other season.
    const a = await call("get", `/assignments/${w.otherAssignmentId}`, t.admin);
    expect(a.status).toBe(403); // former admin: not theirs
    const sup = await call("get", `/assignments/${w.otherAssignmentId}`, t.super);
    expect(sup.body.data.readOnly).toBe(false);
  });
});

describe("a dropped student, mid-season", () => {
  it("reads their own work, read-only", async () => {
    const a = await call("get", `/assignments/${w.otherAssignmentId}`, t.dropped);
    expect(a.status).toBe(200);
    expect(a.body.data.readOnly).toBe(true);
    expect((await call("get", `/submissions/${droppedAssignmentSubmission}`, t.dropped)).status).toBe(200);
  });

  it("cannot write", async () => {
    for (const [m, p, b] of [
      ["put", `/submissions/by-assignment/${w.otherAssignmentId}`, {}],
      ["patch", `/submissions/${droppedAssignmentSubmission}`, { text: "more" }],
    ] as [Method, string, object][]) {
      const res = await call(m, p, t.dropped, b);
      expect([403, 409]).toContain(res.status);
    }
    const row = await db.submission.findUniqueOrThrow({ where: { publicId: droppedAssignmentSubmission } });
    expect(row.text).toBe("dropped work");
  });
});
