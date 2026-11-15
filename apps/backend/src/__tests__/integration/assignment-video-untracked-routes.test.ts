import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { studentVideoPartSchema } from "../../../../../packages/shared/src/index";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";
import { createAssignmentWithParts } from "./assignment-reads-setup";
import { body, videoPart } from "./assignment-writes-setup";

// A video part that doesn't track watching (owner, 2026-11-15): opening it counts as done and its
// questions are optional; switching tracking on or off settles the students who had submitted.
jest.setTimeout(60000);

const app = createApp();

let assignmentId: number;
let partId: number;
let studentId: number;
let studentToken: string;
let adminToken: string;

const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const partPath = () => `/api/v1/assignments/${assignmentId}/parts/${partId}`;
const open = () =>
  request(app).put(`${partPath()}/video/progress`).set(auth(studentToken)).send({ intervals: [], position: 0 });
const submit = () => request(app).post(`/api/v1/assignments/${assignmentId}/submit`).set(auth(studentToken)).send({});
const setTracking = (trackWatching: boolean) =>
  request(app)
    .patch(`/api/v1/assignments/${assignmentId}`)
    .set(auth(adminToken))
    .send(
      body({
        title: "Optional viewing",
        parts: [{ id: partId, ...videoPart({ title: "Optional talk", trackWatching }) }],
      }),
    );

beforeAll(async () => {
  await cleanupTestData();
  const seasonId = (await createTestSeason()).id;
  const student = await createTestUser("untracked-student", "STUDENT");
  const admin = await createTestUser("untracked-admin", "ADMIN");
  studentId = student.id;
  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  await db.seasonEnrollment.create({ data: { seasonId, studentUserId: student.id, status: "ACTIVE" } });
  const made = await createAssignmentWithParts({ seasonId, title: "Optional viewing" }, [
    { kind: "VIDEO", title: "Optional talk", durationSeconds: 600, questions: 2 },
  ]);
  assignmentId = made.id;
  partId = made.partIds[0]!;
  await db.assignmentPart.update({ where: { id: partId }, data: { trackWatching: false } });
  studentToken = await login(app, student.email);
  adminToken = await login(app, admin.email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("a video that doesn't track watching", () => {
  it("says so to the student, and counts once opened, with its questions unanswered", async () => {
    const read = await request(app).get(`${partPath()}/video`).set(auth(studentToken));
    expect(read.status).toBe(200);
    expect(studentVideoPartSchema.parse(read.body.data).trackWatching).toBe(false);

    const early = await submit();
    expect(early.status).toBe(409);
    expect(early.body.error.message).toContain("Optional talk (open it)");

    const opened = await open();
    expect(opened.status).toBe(200);
    expect(opened.body.data.completedAt).not.toBeNull();

    const done = await submit();
    expect(done.status).toBe(200);
  });

  it("reopens a submitted student who only opened it when tracking is switched on, and not when it is off", async () => {
    const on = await setTracking(true);
    expect(on.status).toBe(200);
    const reopened = await db.submission.findUniqueOrThrow({
      where: { assignmentId_studentUserId: { assignmentId, studentUserId: studentId } },
      select: { submittedAt: true },
    });
    expect(reopened.submittedAt).toBeNull();

    // Off again: opening is enough once more, so Submit goes through.
    expect((await setTracking(false)).status).toBe(200);
    expect((await submit()).status).toBe(200);
  });
});
