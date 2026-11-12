import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";

import { newPublicId } from "../../lib/public-id";
import { cleanupTestData, createTestUser, endBodyOf, tokenFor } from "./fixtures";
import { seedModuleWorld, type ModuleWorld } from "./module-world";
import { createAssignmentWithParts, seedEssays, seedTextWork } from "./assignment-reads-setup";

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
  essayPartId: number;
  draft: string; // the student's own DRAFT essay
  quizId: number;
  forumId: number; // an assignment with one FORUM part
  forumPartId: number;
  matePost: string; // a group-mate's forum post
  ownCommentId: number; // the student's own comment on it
  sessionId: number;
  questionId: number;
  token: string; // check-in token, open
}
const kit = {} as Record<"former" | "dropped", Kit>;
let reviewedPublicId: string;
let alumnusSubmission: string;
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
  await seedEssays([
    { publicId: draft, assignmentId: o.assignmentId, studentUserId: o.student, text: "my draft", status: "DRAFT" },
  ]);
  const essayPart = await db.assignmentPart.findFirstOrThrow({
    where: { assignmentId: o.assignmentId, kind: "ESSAY" },
    select: { id: true },
  });
  const forum = await createAssignmentWithParts({ seasonId: o.seasonId, title: "MW Forum" }, [{ kind: "FORUM" }]);
  const forumPartId = forum.partIds[0]!;
  await db.assignment.update({ where: { id: forum.id }, data: { createdById: o.adminId } });
  await db.assignmentPart.update({ where: { id: forumPartId }, data: { allowComments: true } });
  const matePost = newPublicId();
  const post = (publicId: string, studentUserId: number) =>
    seedTextWork(forum.id, forumPartId, studentUserId, "SUBMITTED", { publicId, text: "<p>post</p>" });
  const mateRow = await post(matePost, o.mate);
  await post(newPublicId(), o.student); // the student has posted too, so post-first is satisfied
  const comment = await db.forumComment.create({
    data: { partWorkId: mateRow.id, authorUserId: o.student, body: "earlier comment" },
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
    essayPartId: essayPart.id,
    draft,
    quizId: quiz.id,
    forumId: forum.id,
    forumPartId,
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

  // The ended season: studentB's essay reviewed so End is not blocked; a group-mate for studentA.
  await db.assignmentPartWork.update({
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
  alumnusSubmission = newPublicId();
  activeAssignmentSubmission = newPublicId();
  await seedEssays([
    {
      publicId: alumnusSubmission,
      assignmentId: w.otherAssignmentId,
      studentUserId: w.ids.alumnus,
      text: "alumnus work",
      status: "REVIEWED",
      submittedAt: new Date(),
    },
    {
      publicId: activeAssignmentSubmission,
      assignmentId: w.otherAssignmentId,
      studentUserId: activeId,
      text: "active work",
      status: "DRAFT",
    },
  ]);

  const ended = await call("post", `/seasons/${seasonId}/end`, w.tokens.admin, await endBodyOf(seasonId, []));
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

const assignmentBody = (title: string) => ({
  title,
  description: null,
  dueDay: null,
  dueTime: null,
  reminder: { enabled: false, days: 2, anchor: "NEXT_SESSION", time: "09:00" },
  parts: [
    { kind: "ESSAY", prompt: "Why?", minWords: null, maxWords: null, maxFileSizeMb: null, allowedMimeCategories: [] },
  ],
});

describe("a finished season is locked to its former staff", () => {
  const writes = (): [Method, string, object?][] => [
    ["patch", `/seasons/${w.seasonId}`, { description: "x" }],
    ["post", `/seasons/${w.seasonId}/groups`, { name: "Late group" }],
    ["post", `/seasons/${w.seasonId}/assignments`, assignmentBody("Late")],
    [
      "put",
      `/seasons/${w.seasonId}/group-assignments`,
      { assignments: [{ studentUserId: w.ids.studentA, groupId: w.groupBId }] },
    ],
    [
      "post",
      `/seasons/${w.seasonId}/imports/groups/commit`,
      { assignments: [{ studentUserId: w.ids.studentA, groupId: w.groupBId }] },
    ],
    ["patch", `/groups/${w.groupAId}`, { name: "Renamed" }],
    [
      "post",
      `/sessions`,
      { seasonId: w.seasonId, title: "Late", startDay: "2099-07-03", startTime: "19:30", durationMinutes: 60 },
    ],
    [
      "post",
      `/sessions/${w.sessionId}/attendance`,
      { entries: [{ studentUserId: w.ids.studentA, status: "PRESENT" }] },
    ],
    ["post", `/sessions/${w.sessionId}/check-in-open`],
    ["patch", `/assignments/${w.assignmentId}`, assignmentBody("Renamed")],
    ["post", `/submissions/${reviewedPublicId}/review`, { action: "reviewed", feedback: "late" }],
    ["post", `/quizzes`, { seasonId: w.seasonId, title: "Late quiz", kind: "PAPER", maxScore: 5 }],
    ["post", `/quizzes/${w.quizId}/grades`, { entries: [{ studentUserId: w.ids.studentA, score: 5 }] }],
    [
      "post",
      `/sessions/${w.sessionId}/video-questions`,
      { atSeconds: 9, prompt: "x", options: ["a", "b"], correctIndex: 0, points: 1 },
    ],
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
    expect(
      (
        await call("patch", `/assignments/${w.assignmentId}`, t.super, {
          ...assignmentBody("Super edit"),
          confirm: true,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call("post", `/sessions/${w.sessionId}/attendance`, t.super, {
          entries: [{ studentUserId: w.ids.studentA, status: "PRESENT" }],
        })
      ).status,
    ).toBe(200);
    expect((await call("get", `/seasons/${w.seasonId}`, t.mentor)).status).toBe(200);
    expect((await call("get", `/groups/${w.groupAId}`, t.mentor)).status).toBe(200);
  });
});
