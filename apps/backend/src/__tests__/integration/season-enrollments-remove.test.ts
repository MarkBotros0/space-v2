// Community model, Build 2, Task 5: taking someone off a draft's roster.
import { randomUUID } from "node:crypto";

import request from "supertest";

import { db } from "../../db/client";
import { login } from "./fixtures";
import {
  add,
  adminTokenOf,
  app,
  as,
  nextN,
  person,
  remove,
  rowOf,
  season,
  seedEnrollmentFixtures,
  stamp,
  teardownEnrollmentFixtures,
  type Status,
} from "./season-enrollments-setup";

jest.setTimeout(180000);

beforeAll(seedEnrollmentFixtures);
afterAll(teardownEnrollmentFixtures);

/** A draft essay on a one-essay assignment: real part work, as the app writes it (never a bare Submission). */
async function seedEssayWork(seasonId: number, studentUserId: number) {
  const assignment = await db.assignment.create({
    data: { seasonId, title: "Essay", parts: { create: [{ position: 0, kind: "ESSAY", prompt: "Why?" }] } },
    select: { id: true, parts: { select: { id: true } } },
  });
  const submission = await db.submission.create({
    data: { publicId: randomUUID(), assignmentId: assignment.id, studentUserId },
  });
  await db.assignmentPartWork.create({
    data: {
      publicId: randomUUID().slice(0, 10),
      partId: assignment.parts[0]!.id,
      submissionId: submission.id,
      studentUserId,
      text: "A start",
    },
  });
}

describe("DELETE /seasons/:id/enrollments/:userId", () => {
  const placed = async (status: Status) => {
    const target = await season(status);
    const student = await person("Placed");
    const group = await db.group.create({ data: { seasonId: target, name: `Group ${nextN()}` } });
    await db.seasonEnrollment.create({ data: { seasonId: target, studentUserId: student.id, groupId: group.id } });
    await db.groupStudent.create({ data: { seasonId: target, groupId: group.id, studentUserId: student.id } });
    return { target, student };
  };

  it("leaves no trace, later or in History, and the person can be added again", async () => {
    const { target, student } = await placed("DRAFT");
    const before = await stamp(student.id);

    const res = await remove(target, student.id);
    expect(res.status).toBe(200);
    expect(await rowOf(target, student.id)).toBeNull();
    expect(await db.groupStudent.count({ where: { seasonId: target, studentUserId: student.id } })).toBe(0);
    expect((await stamp(student.id))?.getTime()).not.toBe(before?.getTime());

    // Review Focus 2: once the season has run, it still isn't in their history.
    await db.season.update({ where: { id: target }, data: { status: "COMPLETED" } });
    const token = await login(app, student.email);
    const history = await request(app).get("/api/v1/me/season-history").set(as(token));
    expect(history.status).toBe(200);
    expect((history.body.data.seasons as { seasonId: number }[]).map((s) => s.seasonId)).not.toContain(target);

    await db.season.update({ where: { id: target }, data: { status: "DRAFT" } });
    expect((await add(target, { userIds: [student.id] })).status).toBe(201);
    expect(await rowOf(target, student.id)).toMatchObject({ status: "ACTIVE", groupId: null });
  });

  it("is for that season's admin or a super", async () => {
    const { target, student } = await placed("DRAFT");
    const strangerToken = await adminTokenOf(await season("DRAFT"));
    expect((await remove(target, student.id, strangerToken)).status).toBe(403);
    expect((await remove(target, student.id, await adminTokenOf(target))).status).toBe(200);
  });

  it("refuses outside a draft, with no row, and on a dropped row", async () => {
    const { target, student } = await placed("ACTIVE");
    const res = await remove(target, student.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("not_draft");
    expect(await rowOf(target, student.id)).not.toBeNull();

    const draft = await season("DRAFT");
    expect((await remove(draft, student.id)).status).toBe(404);
    expect((await remove(2147483000, student.id)).status).toBe(404);

    // Removing a dropped row and adding them again would skip the super-only way back.
    await db.seasonEnrollment.create({ data: { seasonId: draft, studentUserId: student.id, status: "WITHDRAWN" } });
    const dropped = await remove(draft, student.id, await adminTokenOf(draft));
    expect(dropped.status).toBe(409);
    expect(dropped.body.error.code).toBe("not_active");
    expect(await rowOf(draft, student.id)).toMatchObject({ status: "WITHDRAWN" });
  });

  it("refuses has_work for a submission or an attempt", async () => {
    const withSubmission = await placed("DRAFT");
    await seedEssayWork(withSubmission.target, withSubmission.student.id);
    const first = await remove(withSubmission.target, withSubmission.student.id);
    expect(first.status).toBe(409);
    expect(first.body.error.code).toBe("has_work");
    expect(await rowOf(withSubmission.target, withSubmission.student.id)).not.toBeNull();

    const withAttempt = await placed("DRAFT");
    const quiz = await db.quiz.create({ data: { seasonId: withAttempt.target, title: "Quiz" } });
    await db.quizAttempt.create({ data: { quizId: quiz.id, studentUserId: withAttempt.student.id } });
    const second = await remove(withAttempt.target, withAttempt.student.id);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("has_work");
    expect(await db.groupStudent.count({ where: { seasonId: withAttempt.target } })).toBe(1);
  });

  it("refuses has_work for an attendance row, and leaves it and the row alone", async () => {
    const { target, student } = await placed("DRAFT");
    const session = await db.session.create({
      data: { seasonId: target, title: "One", startsAt: new Date(Date.UTC(2099, 0, 2)) },
    });
    await db.attendance.create({ data: { sessionId: session.id, studentUserId: student.id, status: "PRESENT" } });
    const res = await remove(target, student.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("has_work");
    expect(await rowOf(target, student.id)).not.toBeNull();
    expect(await db.attendance.count({ where: { sessionId: session.id } })).toBe(1);
  });

  it("refuses has_work for a paper grade, and leaves it and the row alone", async () => {
    const { target, student } = await placed("DRAFT");
    const quiz = await db.quiz.create({ data: { seasonId: target, title: "Paper" } });
    await db.quizGrade.create({ data: { quizId: quiz.id, studentUserId: student.id, score: 7 } });
    const res = await remove(target, student.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("has_work");
    expect(await rowOf(target, student.id)).not.toBeNull();
    expect(await db.quizGrade.count({ where: { quizId: quiz.id } })).toBe(1);
  });

  it("ignores work in another season", async () => {
    const { target, student } = await placed("DRAFT");
    const elsewhere = await season("COMPLETED");
    await seedEssayWork(elsewhere, student.id);
    const session = await db.session.create({
      data: { seasonId: elsewhere, title: "One", startsAt: new Date(Date.UTC(2099, 0, 2)) },
    });
    await db.attendance.create({ data: { sessionId: session.id, studentUserId: student.id, status: "PRESENT" } });
    const quiz = await db.quiz.create({ data: { seasonId: elsewhere, title: "Paper" } });
    await db.quizGrade.create({ data: { quizId: quiz.id, studentUserId: student.id, score: 7 } });
    expect((await remove(target, student.id)).status).toBe(200);
  });
});
