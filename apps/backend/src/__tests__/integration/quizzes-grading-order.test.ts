import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { bearer, cleanupTestData, createTestSeason, createTestUser, tokenFor } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("grading list order (owner, 2026-11-13)", () => {
  it("lists students by name, case aside, and pages in that order", async () => {
    const seasonId = (await createTestSeason()).id;
    const superUser = await createTestUser("grading-order-super", "SUPER");
    // Created out of name order, so id order and name order differ.
    const labels = ["charlie", "Alice", "bob", "Dina"];
    const students = [];
    for (const label of labels) students.push(await createTestUser(`order-${label}`, "STUDENT"));
    await db.seasonEnrollment.createMany({
      data: students.map((s) => ({ seasonId, studentUserId: s.id, status: "ACTIVE" as const })),
    });
    const quiz = await db.quiz.create({
      data: { seasonId, title: "Order", kind: "ONLINE", maxScore: 1, publishedAt: new Date() },
      select: { id: true },
    });
    // "bob" has submitted; the rest have not.
    const bob = students[2]!;
    await db.quizAttempt.create({
      data: { quizId: quiz.id, studentUserId: bob.id, attemptNumber: 1, status: "SUBMITTED", shuffleSeed: 1 },
    });

    const token = await tokenFor(superUser.id);
    const page = (cursor?: number) =>
      request(app)
        .get(`/api/v1/quizzes/${quiz.id}/attempts`)
        .query({ limit: 2, ...(cursor ? { cursor } : {}) })
        .set(bearer(token));
    const names = (body: { items: { studentName: string }[]; waiting: { studentName: string }[] }) => [
      ...body.items.map((i) => i.studentName),
      ...body.waiting.map((w) => w.studentName),
    ];

    const first = await page();
    expect(first.status).toBe(200);
    expect(first.body.data.items.map((i: { studentName: string }) => i.studentName)).toEqual(["Test order-bob"]);
    expect(first.body.data.waiting.map((w: { studentName: string }) => w.studentName)).toEqual(["Test order-Alice"]);
    expect(first.body.data.nextCursor).toBe(bob.id);

    const second = await page(first.body.data.nextCursor);
    expect(names(second.body.data)).toEqual(["Test order-charlie", "Test order-Dina"]);
    expect(second.body.data.nextCursor).toBeNull();
  });
});
