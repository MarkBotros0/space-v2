import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData } from "./fixtures";
import { seedSubmissionFixtures, seedSubmissionFor } from "./submissions-setup";

// The brief specifies 30000ms; raised to 60000ms because the shared Neon
// staging Postgres autosuspends when idle — the first query after a period of
// inactivity has been measured at ~18s, well within a 30s hook/test budget on
// its own, but tight once stacked with the rest of beforeAll's work.
jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let studentUserId: number;
let groupAId: number;
let ownerToken: string;
let peerToken: string;
let leaderToken: string;

beforeAll(async () => {
  ({ seasonId, studentUserId, groupAId, ownerToken, peerToken, leaderToken } = await seedSubmissionFixtures(app));
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

/** A submission of the owner's on a brand-new assignment, in a known state. */
function seedSubmission(status: "SUBMITTED" | "DRAFT", title: string): Promise<string> {
  return seedSubmissionFor(seasonId, studentUserId, status, title);
}

describe("PUT /api/v1/submissions/by-assignment/:assignmentId", () => {
  let secondAssignmentId: number;

  beforeAll(async () => {
    const a = await db.assignment.create({
      data: { seasonId, title: "Second", isAllGroups: true },
      select: { id: true },
    });
    secondAssignmentId = a.id;
  });

  it("creates the submission on first call and returns the same one after", async () => {
    // v1 created this row while *rendering* the assignment page. Under React
    // Query's refetch-on-focus that becomes a write every time the app is
    // tabbed back to, so it is an explicit idempotent write here (ruling C6).
    const first = await request(app)
      .put(`/api/v1/submissions/by-assignment/${secondAssignmentId}`)
      .set("authorization", `Bearer ${ownerToken}`);
    expect(first.status).toBe(200);
    expect(first.body.data.status).toBe("DRAFT");

    const second = await request(app)
      .put(`/api/v1/submissions/by-assignment/${secondAssignmentId}`)
      .set("authorization", `Bearer ${ownerToken}`);
    expect(second.status).toBe(200);
    expect(second.body.data.publicId).toBe(first.body.data.publicId);

    const count = await db.submission.count({
      where: { assignmentId: secondAssignmentId, studentUserId },
    });
    expect(count).toBe(1);
  });

  it("does not overwrite work already saved", async () => {
    const created = await request(app)
      .put(`/api/v1/submissions/by-assignment/${secondAssignmentId}`)
      .set("authorization", `Bearer ${ownerToken}`);

    await request(app)
      .patch(`/api/v1/submissions/${created.body.data.publicId}`)
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ text: "real work", submit: true });

    await request(app)
      .put(`/api/v1/submissions/by-assignment/${secondAssignmentId}`)
      .set("authorization", `Bearer ${ownerToken}`);

    const row = await db.submission.findUnique({
      where: { assignmentId_studentUserId: { assignmentId: secondAssignmentId, studentUserId } },
      select: { text: true, status: true },
    });
    expect(row).toMatchObject({ text: "real work", status: "SUBMITTED" });
  });

  it("refuses staff, who have no submission of their own", async () => {
    const res = await request(app)
      .put(`/api/v1/submissions/by-assignment/${secondAssignmentId}`)
      .set("authorization", `Bearer ${leaderToken}`);
    expect(res.status).toBe(403);
  });

  it("refuses a student the assignment was never set", async () => {
    const targeted = await db.assignment.create({
      data: {
        seasonId,
        title: "Group A only",
        isAllGroups: false,
        targets: { create: { groupId: groupAId } },
      },
      select: { id: true },
    });

    // peer is enrolled in the season but in no group, so this is not their work.
    const res = await request(app)
      .put(`/api/v1/submissions/by-assignment/${targeted.id}`)
      .set("authorization", `Bearer ${peerToken}`);
    expect(res.status).toBe(403);
  });
});

describe("empty submit (REG-85, v1 rule: blank text and no files)", () => {
  it("rejects a submit with blank text and no files, and leaves the row alone", async () => {
    const pid = await seedSubmission("DRAFT", "Empty submit");
    for (const text of ["", "   \n ", "<p></p>"]) {
      const res = await request(app)
        .patch(`/api/v1/submissions/${pid}`)
        .set("authorization", `Bearer ${ownerToken}`)
        .send({ text, submit: true });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("empty_submission");
    }
    const row = await db.submission.findUnique({
      where: { publicId: pid },
      select: { status: true, submittedAt: true },
    });
    expect(row).toEqual({ status: "DRAFT", submittedAt: null });
  });

  it("still saves an empty DRAFT, and submits blank text when a file is attached", async () => {
    const pid = await seedSubmission("DRAFT", "Empty draft ok");
    const draft = await request(app)
      .patch(`/api/v1/submissions/${pid}`)
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ text: "" });
    expect(draft.status).toBe(200);

    const row = await db.submission.findUnique({ where: { publicId: pid }, select: { id: true } });
    await db.submissionFile.create({
      data: {
        submissionId: row!.id,
        originalName: "a.txt",
        storagePath: "submissions/x/a.txt",
        mimeType: "text/plain",
        sizeBytes: 1,
      },
    });
    const submit = await request(app)
      .patch(`/api/v1/submissions/${pid}`)
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ text: "", submit: true });
    expect(submit.status).toBe(200);
  });
});
