import request from "supertest";

import { assignmentStaffMarkSchema } from "../../../../../packages/shared/src/index";
import { createApp } from "../../app";
import { db } from "../../db/client";
import { createAssignmentWithParts, seedTextWork } from "./assignment-reads-setup";
import { bearer, cleanupTestData, createTestSeason, createTestUser } from "./fixtures";
import {
  deleteMark,
  putMark,
  seedStaffMarkWorld,
  submissionRow,
  type StaffMarkWorld,
} from "./assignment-staff-mark-setup";

jest.setTimeout(60000);

const app = createApp();
let w: StaffMarkWorld;

beforeAll(async () => {
  w = await seedStaffMarkWorld();
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

async function essayAssignment(title: string, seasonId = w.seasonId) {
  return createAssignmentWithParts({ seasonId, title }, [{ kind: "ESSAY" }]);
}

/** A season in this status with one student enrolled as given, and an assignment. */
async function seasonIn(status: "DRAFT" | "COMPLETED", enrolment: "ACTIVE" | "COMPLETED") {
  const seasonId = (await createTestSeason({ status })).id;
  const student = await createTestUser(`mark-${status.toLowerCase()}`, "STUDENT");
  await db.seasonEnrollment.create({ data: { seasonId, studentUserId: student.id, status: enrolment } });
  const a = await essayAssignment(`In a ${status} season`, seasonId);
  return { assignmentId: a.id, studentId: student.id };
}

describe("PUT/DELETE /assignments/:id/submitted-marks/:studentUserId", () => {
  it("only the admin, a super or the student's own leader, on an active season", async () => {
    const a = await essayAssignment("Who marks");

    for (const token of [w.tokens.owner, w.tokens.leaderB, w.tokens.mentor]) {
      expect((await putMark(app, a.id, w.ownerId, token)).status).toBe(403);
      expect((await deleteMark(app, a.id, w.ownerId, token)).status).toBe(403);
    }
    expect(await submissionRow(a.id, w.ownerId)).toBeNull();

    const byLeader = await putMark(app, a.id, w.ownerId, w.tokens.leaderA);
    expect(byLeader.status).toBe(200);
    const body = assignmentStaffMarkSchema.parse(byLeader.body.data);
    expect(body).toMatchObject({ studentUserId: w.ownerId, markedBy: { id: w.leaderAId, name: "Test mark-leader-a" } });
    expect((await deleteMark(app, a.id, w.ownerId, w.tokens.leaderA)).status).toBe(204);

    // A leader undoes an admin's mark.
    const byAdmin = await putMark(app, a.id, w.ownerId, w.tokens.admin);
    expect(byAdmin.status).toBe(200);
    expect(byAdmin.body.data.markedBy).toEqual({ id: w.adminId, name: "Test mark-admin" });
    expect((await deleteMark(app, a.id, w.ownerId, w.tokens.leaderA)).status).toBe(204);
    expect(await submissionRow(a.id, w.ownerId)).toBeNull();

    expect((await putMark(app, a.id, w.peerId, w.tokens.super)).status).toBe(200);
    expect((await putMark(app, a.id, w.peerId, w.tokens.leaderA)).status).toBe(403);

    const finished = await seasonIn("COMPLETED", "COMPLETED");
    const onFinished = await putMark(app, finished.assignmentId, finished.studentId, w.tokens.super);
    expect(onFinished.status).toBe(409);
    expect(onFinished.body.error).toEqual({
      code: "season_finished",
      message: "This season has ended; its work can't change.",
    });
    expect((await deleteMark(app, finished.assignmentId, finished.studentId, w.tokens.super)).status).toBe(409);
    expect(await submissionRow(finished.assignmentId, finished.studentId)).toBeNull();

    const draft = await seasonIn("DRAFT", "ACTIVE");
    const onDraft = await putMark(app, draft.assignmentId, draft.studentId, w.tokens.super);
    expect(onDraft.status).toBe(409);
    expect(onDraft.body.error.code).toBe("season_draft");
    expect(await submissionRow(draft.assignmentId, draft.studentId)).toBeNull();
  });

  it("refuses a student who is not an active participant, and a missing assignment", async () => {
    const a = await essayAssignment("Not theirs");
    const stranger = await createTestUser("mark-stranger", "STUDENT");
    const withdrawn = await createTestUser("mark-withdrawn", "STUDENT");
    await db.seasonEnrollment.create({
      data: { seasonId: w.seasonId, studentUserId: withdrawn.id, status: "WITHDRAWN" },
    });

    for (const id of [stranger.id, withdrawn.id]) {
      const res = await putMark(app, a.id, id, w.tokens.admin);
      expect(res.status).toBe(404);
      expect(res.body.error).toEqual({ code: "not_found", message: "Student not found in this season." });
      expect(await submissionRow(a.id, id)).toBeNull();
    }
    expect((await putMark(app, 999_999_999, w.ownerId, w.tokens.admin)).status).toBe(404);
    await db.assignment.update({ where: { id: a.id }, data: { deletedAt: new Date() } });
    expect((await putMark(app, a.id, w.ownerId, w.tokens.admin)).status).toBe(404);
  });

  it("marking twice keeps the first mark", async () => {
    const a = await essayAssignment("Twice");
    const first = await putMark(app, a.id, w.ownerId, w.tokens.admin);
    expect(first.status).toBe(200);
    const again = await putMark(app, a.id, w.ownerId, w.tokens.super);
    expect(again.status).toBe(200);
    expect(again.body.data).toEqual(first.body.data);
    const row = await submissionRow(a.id, w.ownerId);
    expect(row?.staffMark?.markedById).toBe(w.adminId);
    expect(row?.submittedAt).toBeNull();
  });

  it("undo removes a Submission it created and keeps one with work", async () => {
    const empty = await essayAssignment("Nothing else");
    expect((await putMark(app, empty.id, w.ownerId, w.tokens.admin)).status).toBe(200);
    expect(await submissionRow(empty.id, w.ownerId)).not.toBeNull();
    expect((await deleteMark(app, empty.id, w.ownerId, w.tokens.admin)).status).toBe(204);
    expect(await submissionRow(empty.id, w.ownerId)).toBeNull();
    // Undo with nothing to undo is still 204.
    expect((await deleteMark(app, empty.id, w.ownerId, w.tokens.admin)).status).toBe(204);

    const started = await essayAssignment("Some work");
    await seedTextWork(started.id, started.partIds[0]!, w.ownerId, "DRAFT");
    expect((await putMark(app, started.id, w.ownerId, w.tokens.admin)).status).toBe(200);
    expect((await deleteMark(app, started.id, w.ownerId, w.tokens.admin)).status).toBe(204);
    const kept = await submissionRow(started.id, w.ownerId);
    expect(kept).not.toBeNull();
    expect(kept?.staffMark).toBeNull();
    expect(await db.assignmentPartWork.count({ where: { submissionId: kept!.id } })).toBe(1);
  });

  it("a later app submit stands and the mark is kept", async () => {
    const a = await createAssignmentWithParts({ seasonId: w.seasonId, title: "Then in the app" }, [{ kind: "FORUM" }]);
    expect((await putMark(app, a.id, w.ownerId, w.tokens.leaderA)).status).toBe(200);
    await seedTextWork(a.id, a.partIds[0]!, w.ownerId, "SUBMITTED");

    const submitted = await request(app)
      .post(`/api/v1/assignments/${a.id}/submit`)
      .set(bearer(w.tokens.owner))
      .send({});
    expect(submitted.status).toBe(200);
    const row = await submissionRow(a.id, w.ownerId);
    expect(row?.submittedAt).not.toBeNull();
    expect(row?.staffMark?.markedById).toBe(w.leaderAId);

    // Undo after an app submission only takes the mark away.
    expect((await deleteMark(app, a.id, w.ownerId, w.tokens.admin)).status).toBe(204);
    const after = await submissionRow(a.id, w.ownerId);
    expect(after?.submittedAt).not.toBeNull();
    expect(after?.staffMark).toBeNull();
  });

  it("nothing enters the review queue and nobody is notified", async () => {
    const a = await essayAssignment("Quietly marked");
    const before = new Date();
    const watchers = [w.ownerId, w.peerId, w.adminId, w.leaderAId];
    expect((await putMark(app, a.id, w.ownerId, w.tokens.admin)).status).toBe(200);

    const row = await submissionRow(a.id, w.ownerId);
    expect(await db.assignmentPartWork.count({ where: { submissionId: row!.id } })).toBe(0);
    const queue = await request(app).get("/api/v1/submissions").set(bearer(w.tokens.leaderA));
    expect(queue.status).toBe(200);
    expect((queue.body.data.items as { assignmentId: number }[]).filter((i) => i.assignmentId === a.id)).toEqual([]);
    expect(await db.notification.count({ where: { userId: { in: watchers }, createdAt: { gte: before } } })).toBe(0);

    expect((await deleteMark(app, a.id, w.ownerId, w.tokens.admin)).status).toBe(204);
    expect(await db.notification.count({ where: { userId: { in: watchers }, createdAt: { gte: before } } })).toBe(0);
  });
});
