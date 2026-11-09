import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";

import { newPublicId } from "../../lib/public-id";
import { studentQuizDetailSchema } from "../../../../../packages/shared/src/index";
import { cleanupTestData, createTestUser, reviewedOf, tokenFor } from "./fixtures";
import { seedModuleWorld, type ModuleWorld } from "./module-world";

jest.setTimeout(180000);

const app = createApp();
let w: ModuleWorld;

type Who = "super" | "admin" | "leaderA" | "mentor" | "studentA" | "studentB" | "alumnus" | "dropped" | "active";
const t = {} as Record<Who, string>;

/** Tokens minted from real post-End scopes (login is rate limited in tests). */

type Method = "get" | "post" | "patch" | "put" | "delete";
async function call(method: Method, path: string, token: string, body?: object) {
  const c = request(app)[method](`/api/v1${path}`).set("authorization", `Bearer ${token}`);
  return body ? c.send(body) : c;
}

/** Everything one student can write to, in one season. */
interface Kit {
  assignmentId: number;
  draft: string; // the student's own DRAFT submission
  quizId: number;
  forumId: number;
  matePost: string; // a group-mate's REVIEWED forum post
  ownCommentId: number; // the student's own comment on it
  sessionId: number;
  questionId: number;
  token: string; // check-in token, open
}
const kit = {} as Record<"former" | "dropped", Kit>;
let reviewedPublicId: string;
let alumnusSubmission: string;
let droppedQuizId: number;
let droppedUserId: number;
let activeAssignmentSubmission: string;

/** Forum + quiz + video + check-in fixtures for one season, with a group-mate who has posted. */
async function buildKit(o: {
  seasonId: number;
  assignmentId: number;
  sessionId: number;
  groupId: number;
  student: number;
  mate: number;
  adminId: number;
  token: string;
}): Promise<Kit> {
  const draft = newPublicId();
  await db.submission.create({
    data: {
      publicId: draft,
      assignmentId: o.assignmentId,
      studentUserId: o.student,
      text: "my draft",
      status: "DRAFT",
    },
  });
  const forum = await db.assignment.create({
    data: {
      seasonId: o.seasonId,
      title: "MW Forum",
      type: "FORUM",
      forumAllowComments: true,
      isAllGroups: true,
      createdById: o.adminId,
    },
    select: { id: true },
  });
  const matePost = newPublicId();
  const post = (publicId: string, studentUserId: number) =>
    db.submission.create({
      data: {
        publicId,
        assignmentId: forum.id,
        studentUserId,
        text: "<p>post</p>",
        status: "REVIEWED",
        submittedAt: new Date(),
        reviewedAt: new Date(),
      },
      select: { id: true },
    });
  const mateRow = await post(matePost, o.mate);
  await post(newPublicId(), o.student); // the student has posted too, so post-first is satisfied
  const comment = await db.forumComment.create({
    data: { submissionId: mateRow.id, authorUserId: o.student, body: "earlier comment" },
    select: { id: true },
  });
  const quiz = await db.quiz.create({
    data: {
      seasonId: o.seasonId,
      sessionId: o.sessionId,
      title: "MW Online",
      kind: "ONLINE",
      maxScore: 2,
      publishedAt: new Date(),
      questions: { create: [{ order: 1, type: "MCQ", prompt: "Q?", points: 2, options: ["a", "b"], correctIndex: 0 }] },
      // An attempt in progress, so submit is refused by the lock and not by "no attempt".
      attempts: { create: [{ studentUserId: o.student, attemptNumber: 1, status: "IN_PROGRESS" }] },
    },
    select: { id: true },
  });
  const q = await db.sessionVideoQuestion.create({
    data: { sessionId: o.sessionId, atSeconds: 5, prompt: "VQ?", options: ["a", "b"], correctIndex: 0, points: 1 },
    select: { id: true },
  });
  await db.session.update({
    where: { id: o.sessionId },
    data: {
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      checkInToken: o.token,
      checkInOpenAt: new Date(Date.now() - 60_000),
    },
  });
  return {
    assignmentId: o.assignmentId,
    draft,
    quizId: quiz.id,
    forumId: forum.id,
    matePost,
    ownCommentId: comment.id,
    sessionId: o.sessionId,
    questionId: q.id,
    token: o.token,
  };
}

beforeAll(async () => {
  w = await seedModuleWorld(app);
  const { seasonId, otherSeasonId } = w;

  // The ended season: studentB's submission reviewed so End is not blocked; a group-mate for studentA.
  await db.submission.update({
    where: { publicId: w.submissionBPublicId },
    data: { status: "REVIEWED", reviewedAt: new Date() },
  });
  reviewedPublicId = w.submissionBPublicId;
  const mate = await createTestUser("mw-mate", "STUDENT");
  await db.studentProfile.create({ data: { userId: mate.id } });
  await db.seasonEnrollment.create({
    data: { seasonId, studentUserId: mate.id, groupId: w.groupAId, status: "ACTIVE" },
  });
  kit.former = await buildKit({
    seasonId,
    assignmentId: w.assignmentId,
    sessionId: w.sessionId,
    groupId: w.groupAId,
    student: w.ids.studentA,
    mate: mate.id,
    adminId: w.ids.admin,
    token: "mwlocktoken",
  });

  // The still-running other season: a group with a dropped student, an active student and an active mate.
  const otherGroup = await db.group.create({
    data: { seasonId: otherSeasonId, name: "Other group" },
    select: { id: true },
  });
  const mkStudent = async (label: string, status: "WITHDRAWN" | "ACTIVE") => {
    const u = await createTestUser(label, "STUDENT");
    await db.studentProfile.create({ data: { userId: u.id } });
    await db.seasonEnrollment.create({
      data: { seasonId: otherSeasonId, studentUserId: u.id, groupId: otherGroup.id, status },
    });
    return u.id;
  };
  const droppedId = await mkStudent("mw-dropped", "WITHDRAWN");
  droppedUserId = droppedId;
  const activeId = await mkStudent("mw-active", "ACTIVE");
  const otherMate = await mkStudent("mw-other-mate", "ACTIVE");
  kit.dropped = await buildKit({
    seasonId: otherSeasonId,
    assignmentId: w.otherAssignmentId,
    sessionId: w.otherSessionId,
    groupId: otherGroup.id,
    student: droppedId,
    mate: otherMate,
    adminId: w.ids.otherAdmin,
    token: "mwdroppedtoken",
  });
  droppedQuizId = kit.dropped.quizId;
  alumnusSubmission = newPublicId();
  await db.submission.create({
    data: {
      publicId: alumnusSubmission,
      assignmentId: w.otherAssignmentId,
      studentUserId: w.ids.alumnus,
      text: "alumnus work",
      status: "REVIEWED",
      submittedAt: new Date(),
    },
  });
  activeAssignmentSubmission = newPublicId();
  await db.submission.create({
    data: {
      publicId: activeAssignmentSubmission,
      assignmentId: w.otherAssignmentId,
      studentUserId: activeId,
      text: "active work",
      status: "DRAFT",
    },
  });

  const ended = await call("post", `/seasons/${seasonId}/end`, w.tokens.admin, {
    notPassed: [],
    reviewed: await reviewedOf(seasonId),
  });
  expect(ended.status).toBe(200);

  for (const role of ["super", "admin", "leaderA", "mentor", "studentA", "studentB", "alumnus"] as const) {
    t[role] = await tokenFor(w.ids[role]);
  }
  t.dropped = await tokenFor(droppedId);
  t.active = await tokenFor(activeId);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

/** One student write: expected status and error code, and why the lock (not something else) refuses it. */
type Row = [name: string, method: Method, path: string, body: object | undefined, status: number, code: string];

function studentWrites(k: Kit): Row[] {
  return [
    ["start submission", "put", `/submissions/by-assignment/${k.assignmentId}`, {}, 403, "forbidden"],
    ["save submission", "patch", `/submissions/${k.draft}`, { text: "edited after end" }, 403, "forbidden"],
    ["start attempt", "put", `/quizzes/${k.quizId}/attempt`, undefined, 403, "forbidden"],
    ["submit attempt", "post", `/quizzes/${k.quizId}/attempt/submit`, {}, 403, "forbidden"],
    ["forum response", "put", `/assignments/${k.forumId}/forum/response`, { text: "late post" }, 403, "forbidden"],
    [
      "forum comment",
      "post",
      `/assignments/${k.forumId}/forum/posts/${k.matePost}/comments`,
      { body: "late comment" },
      403,
      "forbidden",
    ],
    ["delete own comment", "delete", `/forum/comments/${k.ownCommentId}`, undefined, 403, "forbidden"],
    [
      "video answer",
      "post",
      `/sessions/${k.sessionId}/video-quiz/answers`,
      { questionId: k.questionId, selectedIndex: 0 },
      403,
      "forbidden",
    ],
    ["check in", "post", `/sessions/check-in`, { token: k.token }, 403, "not_enrolled"],
  ];
}

async function expectRefused(who: "studentA" | "dropped", k: Kit) {
  const bad: string[] = [];
  for (const [name, m, p, b, status, code] of studentWrites(k)) {
    const res = await call(m, p, t[who], b);
    if (res.status !== status || res.body?.error?.code !== code) {
      bad.push(`${name}: ${m.toUpperCase()} ${p} -> ${res.status} ${res.body?.error?.code}`);
    }
  }
  expect(bad).toEqual([]);
  const sid = who === "studentA" ? w.ids.studentA : droppedUserId;
  expect((await db.submission.findUniqueOrThrow({ where: { publicId: k.draft } })).text).toBe("my draft");
  expect(await db.forumComment.count({ where: { submission: { assignmentId: k.forumId }, authorUserId: sid } })).toBe(
    1,
  ); // the seeded one only
  expect(await db.forumComment.findUnique({ where: { id: k.ownCommentId } })).not.toBeNull();
  expect(
    await db.quizAttempt.count({ where: { quizId: k.quizId, studentUserId: sid, status: { not: "IN_PROGRESS" } } }),
  ).toBe(0);
  expect(
    await db.attendance.count({ where: { sessionId: k.sessionId, studentUserId: sid, checkedInAt: { not: null } } }),
  ).toBe(0);
  expect(await db.sessionVideoQuestionResponse.count({ where: { questionId: k.questionId } })).toBe(0);
  expect(await db.submission.count({ where: { assignmentId: k.forumId, studentUserId: sid } })).toBe(1);
}

describe("a former student can read their work but not change it", () => {
  it("refuses all nine writes, each for the lock", () => expectRefused("studentA", kit.former));

  it("opens their own assignment, submission and quiz read-only", async () => {
    const a = await call("get", `/assignments/${w.assignmentId}`, t.studentA);
    expect(a.status).toBe(200);
    expect(a.body.data.readOnly).toBe(true);
    expect(a.body.data.mySubmission.publicId).toBe(kit.former.draft);
    const s = await call("get", `/submissions/${kit.former.draft}`, t.studentA);
    expect(s.status).toBe(200);
    const q = await call("get", `/quizzes/${kit.former.quizId}`, t.studentA);
    expect(q.status).toBe(200);
    expect(q.body.data.readOnly).toBe(true);
    for (const body of [a.body, s.body, q.body]) {
      expect(JSON.stringify(body)).not.toContain("Staff-only pastoral note");
    }
  });

  it("keeps another student's submission private", async () => {
    expect((await call("get", `/submissions/${reviewedPublicId}`, t.studentA)).status).toBe(403);
  });
});

describe("an alumnus", () => {
  it("opens past work, their submission and the quiz, read-only", async () => {
    const a = await call("get", `/assignments/${w.otherAssignmentId}`, t.alumnus);
    expect(a.status).toBe(200);
    expect(a.body.data.readOnly).toBe(true);
    const s = await call("get", `/submissions/${alumnusSubmission}`, t.alumnus);
    expect(s.status).toBe(200);
    expect(JSON.stringify(s.body)).not.toContain("Staff-only pastoral note");
    const q = await call("get", `/quizzes/${droppedQuizId}`, t.alumnus);
    expect(q.status).toBe(200);
    expect(q.body.data.readOnly).toBe(true);
  });
});

describe("a dropped student, mid-season", () => {
  it("reads their own work and the quiz, read-only", async () => {
    const a = await call("get", `/assignments/${w.otherAssignmentId}`, t.dropped);
    expect(a.status).toBe(200);
    expect(a.body.data.readOnly).toBe(true);
    expect((await call("get", `/submissions/${kit.dropped.draft}`, t.dropped)).status).toBe(200);
    const q = await call("get", `/quizzes/${droppedQuizId}`, t.dropped);
    expect(q.status).toBe(200);
    expect(q.body.data.readOnly).toBe(true);
  });

  it("refuses all nine writes, each for the lock", () => expectRefused("dropped", kit.dropped));
});

describe("a student with an active place", () => {
  it("is not read-only on the assignment or the quiz", async () => {
    const a = await call("get", `/assignments/${w.otherAssignmentId}`, t.active);
    expect(a.status).toBe(200);
    expect(a.body.data.readOnly).toBe(false);
    const q = await call("get", `/quizzes/${droppedQuizId}`, t.active);
    expect(q.status).toBe(200);
    expect(q.body.data.readOnly).toBe(false);
    expect((await call("get", `/submissions/${activeAssignmentSubmission}`, t.active)).status).toBe(200);
  });

  it("gets a quiz body it can parse back from the attempt writes (start and submit)", async () => {
    const started = await call("put", `/quizzes/${droppedQuizId}/attempt`, t.active);
    expect(started.status).toBe(200);
    expect(studentQuizDetailSchema.safeParse(JSON.parse(JSON.stringify(started.body.data))).success).toBe(true);
    expect(started.body.data.readOnly).toBe(false);
    const qid = started.body.data.questions[0].id as number;
    const saved = await call("patch", `/quizzes/${droppedQuizId}/attempt`, t.active, {
      answers: [{ questionId: qid, selectedIndex: 0, text: null }],
    });
    expect(saved.status).toBe(200);
    const submitted = await call("post", `/quizzes/${droppedQuizId}/attempt/submit`, t.active, {});
    expect(submitted.status).toBe(200);
    expect(studentQuizDetailSchema.safeParse(JSON.parse(JSON.stringify(submitted.body.data))).success).toBe(true);
  });

  it("can comment on a group-mate's post and delete its own comment", async () => {
    // Post-first: the active student needs their own post; the forum response creates it.
    const posted = await call("put", `/assignments/${kit.dropped.forumId}/forum/response`, t.active, {
      text: "my take",
    });
    expect(posted.status).toBe(200);
    const c = await call(
      "post",
      `/assignments/${kit.dropped.forumId}/forum/posts/${kit.dropped.matePost}/comments`,
      t.active,
      { body: "hi" },
    );
    expect(c.status).toBe(201);
    expect((await call("delete", `/forum/comments/${c.body.data.comment.id}`, t.active)).status).toBe(200);
  });
});
