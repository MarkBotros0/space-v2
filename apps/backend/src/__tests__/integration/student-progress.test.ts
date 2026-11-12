import request from "supertest";

import { studentProgressSchema } from "../../../../../packages/shared/src/index";
import { createApp } from "../../app";
import { db } from "../../db/client";
import { bearer, cleanupTestData } from "./fixtures";
import { SECRET_ESSAY, SECRET_PROMPT, seedPassingWorld, type PassingWorld } from "./season-passing-setup";

jest.setTimeout(60000);

const app = createApp();

let w: PassingWorld;
let lowQuiz: number;

beforeAll(async () => {
  await cleanupTestData();
  w = await seedPassingWorld();
  // A second paper quiz the middle student scored lowest on (2 of 10 = 20%, below the paper's 60%).
  lowQuiz = (
    await db.quiz.create({
      data: { seasonId: w.seasonId, title: "Short quiz", kind: "PAPER", maxScore: 10 },
      select: { id: true },
    })
  ).id;
  await db.quizGrade.create({ data: { quizId: lowQuiz, studentUserId: w.users.middle.id, score: 2 } });
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

function progress(studentUserId: number, token: string, query = "") {
  return request(app).get(`/api/v1/students/${studentUserId}/progress${query}`).set(bearer(token));
}

describe("GET /students/:id/progress", () => {
  it("progress lists missing assignments first and the lowest quiz first", async () => {
    const res = await progress(w.users.middle.id, w.tokens.admin);
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(studentProgressSchema.safeParse(data).success).toBe(true);
    expect(data).toMatchObject({
      seasonId: w.seasonId,
      seasonTitle: "Test Season",
      seasonActive: true,
      canMark: true,
      available: { attendance: false, assignments: true, quizzes: true },
      numbers: {
        attendance: { attended: 0, total: 0 },
        assignments: { submitted: 1, total: 2 },
        quizzes: { scored: 0.8, max: 2 }, // 60% and 20%: each quiz weighs the same
      },
    });
    expect(data.assignments).toEqual([
      {
        id: w.assignments.second,
        title: "Second",
        dueAt: "2099-03-01T00:00:00.000Z",
        submitted: null,
        staffMark: null,
      },
      { id: w.assignments.first, title: "First", dueAt: "2099-02-01T00:00:00.000Z", submitted: "app", staffMark: null },
    ]);
    expect(data.quizzes).toEqual([
      { id: lowQuiz, title: "Short quiz", kind: "PAPER", score: 2, maxScore: 10 },
      { id: w.quizzes.paper, title: "Paper", kind: "PAPER", score: 60, maxScore: 100 },
    ]);

    // Staff-only all the same: no essay text and no question reaches it.
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain(SECRET_ESSAY);
    expect(raw).not.toContain(SECRET_PROMPT);
  });

  it("progress names who marked an assignment", async () => {
    const submission = await db.submission.create({
      data: {
        assignmentId: w.assignments.second,
        studentUserId: w.users.middle.id,
        publicId: `space-v2-test-progress-mark-${w.users.middle.id}`,
      },
      select: { id: true },
    });
    const markedAt = new Date("2099-02-15T10:00:00.000Z");
    await db.submissionStaffMark.create({
      data: { submissionId: submission.id, markedById: w.users.admin.id, markedAt },
    });
    try {
      const data = (await progress(w.users.middle.id, w.tokens.leaderB)).body.data;
      expect(data.canMark).toBe(true);
      expect(data.numbers.assignments).toEqual({ submitted: 2, total: 2 });
      const second = data.assignments.find((a: { id: number }) => a.id === w.assignments.second);
      expect(second).toMatchObject({
        submitted: "staff",
        staffMark: { markedAt: markedAt.toISOString(), markedByName: "Test pass-admin" },
      });
    } finally {
      await db.submission.delete({ where: { id: submission.id } });
    }
  });

  it("a student cannot read their own progress (403)", async () => {
    expect((await progress(w.users.middle.id, w.tokens.student)).status).toBe(403);
  });

  it("is scoped as the engagement card is", async () => {
    // A leader of another group never sees the student (canViewStudent), with or without a season.
    expect((await progress(w.users.middle.id, w.tokens.leaderA, `?seasonId=${w.seasonId}`)).status).toBe(403);
    const none = await progress(w.users.middle.id, w.tokens.leaderA);
    expect(none.status).toBe(403);
    // Another season's admin never sees the student at all.
    expect((await progress(w.users.middle.id, w.tokens.otherAdmin)).status).toBe(403);
    // A mentor sees nothing season-shaped (docs/rules/mentor.md), with or without a season.
    expect((await progress(w.users.middle.id, w.tokens.mentor)).status).toBe(403);
    expect((await progress(w.users.middle.id, w.tokens.mentor, `?seasonId=${w.seasonId}`)).status).toBe(403);
  });

  it("a withdrawn enrolment has no season to score, as on the engagement card", async () => {
    for (const query of [`?seasonId=${w.seasonId}`, ""]) {
      const res = await progress(w.users.withdrawn.id, w.tokens.super, query);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("no_season");
    }
  });

  it("a finished season reads, with nothing to mark", async () => {
    await db.season.update({ where: { id: w.seasonId }, data: { status: "COMPLETED" } });
    await db.seasonEnrollment.updateMany({ where: { seasonId: w.seasonId }, data: { status: "COMPLETED" } });
    try {
      const res = await progress(w.users.middle.id, w.tokens.super, `?seasonId=${w.seasonId}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ seasonActive: false, canMark: false });
      // Without ?seasonId only an ACTIVE enrolment is picked.
      const none = await progress(w.users.middle.id, w.tokens.super);
      expect(none.status).toBe(404);
      expect(none.body.error.code).toBe("no_season");
    } finally {
      await db.season.update({ where: { id: w.seasonId }, data: { status: "ACTIVE" } });
      await db.seasonEnrollment.updateMany({
        where: { seasonId: w.seasonId, studentUserId: { not: w.users.withdrawn.id } },
        data: { status: "ACTIVE" },
      });
    }
  });

  it("a deleted student or season is not found", async () => {
    await db.user.update({ where: { id: w.users.short.id }, data: { deletedAt: new Date() } });
    expect((await progress(w.users.short.id, w.tokens.super)).status).toBe(404);
    await db.season.update({ where: { id: w.seasonId }, data: { deletedAt: new Date() } });
    const res = await progress(w.users.middle.id, w.tokens.super, `?seasonId=${w.seasonId}`);
    expect(res.status).toBe(404);
  });
});
