import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { newPublicId } from "../../lib/public-id";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

// The brief specifies 30000ms; raised to 60000ms because the shared Neon
// staging Postgres autosuspends when idle — the first query after a period of
// inactivity has been measured at ~18s, well within a 30s hook/test budget on
// its own, but tight once stacked with the rest of beforeAll's work.
jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let assignmentId: number;
let publicId: string;
let studentUserId: number;
let groupAId: number;
let mentorToken: string;
let ownerToken: string;
let peerToken: string;
let leaderToken: string;
let adminToken: string;

beforeAll(async () => {
  await cleanupTestData();

  const season = await createTestSeason();
  seasonId = season.id;

  const owner = await createTestUser("owner", "STUDENT");
  const peer = await createTestUser("peer", "STUDENT");
  const leader = await createTestUser("leader", "LEADER");
  const admin = await createTestUser("admin", "ADMIN");
  studentUserId = owner.id;

  const group = await db.group.create({
    data: {
      seasonId,
      name: "Group A",
      leaders: { create: { userId: leader.id } },
      students: { create: { studentUserId: owner.id } },
    },
    select: { id: true },
  });
  groupAId = group.id;
  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  // groupId on the enrolment as well as the GroupStudent row above. v1's group
  // form writes both, so this is what real data looks like — and since ruling
  // C9 made the per-season enrolment the authority on membership, an enrolment
  // without it describes a student in no group at all.
  await db.seasonEnrollment.createMany({
    data: [
      { seasonId, studentUserId: owner.id, groupId: group.id, status: "ACTIVE" },
      { seasonId, studentUserId: peer.id, status: "ACTIVE" },
    ],
  });

  const assignment = await db.assignment.create({
    data: {
      seasonId,
      title: "Essay",
      description: "Write it",
      isAllGroups: true,
      dueAt: new Date("2099-04-01T00:00:00.000Z"),
    },
    select: { id: true },
  });
  assignmentId = assignment.id;

  // Same generator production uses — publicId is a @unique column, and a
  // hand-rolled short id collides with a previous interrupted run (Ruling F2).
  publicId = newPublicId();
  await db.submission.create({
    data: { assignmentId, studentUserId: owner.id, publicId, status: "DRAFT", text: "first draft" },
  });

  const mentor = await createTestUser("mentor", "MENTOR");

  ownerToken = await login(app, owner.email);
  peerToken = await login(app, peer.email);
  leaderToken = await login(app, leader.email);
  adminToken = await login(app, admin.email);
  mentorToken = await login(app, mentor.email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("GET /api/v1/submissions/:publicId", () => {
  it("returns the flattened detail to its owner", async () => {
    const res = await request(app)
      .get(`/api/v1/submissions/${publicId}`)
      .set("authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      publicId,
      status: "DRAFT",
      text: "first draft",
      assignmentId,
      assignmentTitle: "Essay",
      assignmentDescription: "Write it",
      studentUserId,
      studentName: "Test owner",
      files: [],
    });
    expect(res.body.data.seasonCode).toEqual(expect.any(String));
  });

  it("allows the student's group leader and the season admin", async () => {
    const asLeader = await request(app)
      .get(`/api/v1/submissions/${publicId}`)
      .set("authorization", `Bearer ${leaderToken}`);
    expect(asLeader.status).toBe(200);

    const asAdmin = await request(app)
      .get(`/api/v1/submissions/${publicId}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(asAdmin.status).toBe(200);
  });

  it("refuses a peer student in the same season", async () => {
    const res = await request(app)
      .get(`/api/v1/submissions/${publicId}`)
      .set("authorization", `Bearer ${peerToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
  });

  it("returns 404 for an unknown publicId", async () => {
    const res = await request(app)
      .get("/api/v1/submissions/doesnotexi")
      .set("authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });

  it("requires authentication", async () => {
    const res = await request(app).get(`/api/v1/submissions/${publicId}`);
    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/v1/submissions/:publicId", () => {
  it("saves a draft without stamping submittedAt", async () => {
    const res = await request(app)
      .patch(`/api/v1/submissions/${publicId}`)
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ text: "second draft" });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ saved: true, submitted: false });

    const row = await db.submission.findUnique({
      where: { publicId },
      select: { text: true, status: true, submittedAt: true },
    });
    expect(row).toEqual({ text: "second draft", status: "DRAFT", submittedAt: null });
  });

  it("submits and stamps submittedAt", async () => {
    const res = await request(app)
      .patch(`/api/v1/submissions/${publicId}`)
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ text: "final", submit: true });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ saved: true, submitted: true });

    const row = await db.submission.findUnique({
      where: { publicId },
      select: { text: true, status: true, submittedAt: true },
    });
    expect(row?.status).toBe("SUBMITTED");
    expect(row?.submittedAt).toBeTruthy();
    expect(row?.text).toBe("final");
  });

  it("refuses a non-owner with 403 — including the season admin", async () => {
    // Reading a submission and editing one are different rights: an admin may
    // review but must never rewrite a student's words.
    const res = await request(app)
      .patch(`/api/v1/submissions/${publicId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ text: "tampered" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");

    const row = await db.submission.findUnique({ where: { publicId }, select: { text: true } });
    expect(row?.text).toBe("final");
  });

  it("returns 400 when text is missing", async () => {
    const res = await request(app)
      .patch(`/api/v1/submissions/${publicId}`)
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ submit: true });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
  });

  it("returns 404 for an unknown publicId", async () => {
    const res = await request(app)
      .patch("/api/v1/submissions/doesnotexi")
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ text: "x" });
    expect(res.status).toBe(404);
  });

  it("does not let a draft save demote a reviewed submission", async () => {
    const pid = await seedSubmission("SUBMITTED", "Demotion check");
    await request(app)
      .post(`/api/v1/submissions/${pid}/review`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ feedback: "Reviewed." });

    // v1 set status: "DRAFT" unconditionally on a draft save, so an autosave
    // after review dropped the submission out of the reviewer's queue while the
    // stale feedback stayed on screen for the student.
    await request(app)
      .patch(`/api/v1/submissions/${pid}`)
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ text: "edited after review" });

    const row = await db.submission.findUnique({
      where: { publicId: pid },
      select: { status: true, text: true },
    });
    expect(row).toMatchObject({ status: "REVIEWED", text: "edited after review" });
  });
});

/** A submission of the owner's on a brand-new assignment, in a known state. */
async function seedSubmission(status: "SUBMITTED" | "DRAFT", title: string): Promise<string> {
  const assignment = await db.assignment.create({
    data: { seasonId, title, isAllGroups: true },
    select: { id: true },
  });
  const pid = newPublicId();
  await db.submission.create({
    data: {
      assignmentId: assignment.id,
      studentUserId,
      publicId: pid,
      status,
      text: "work",
      submittedAt: status === "SUBMITTED" ? new Date() : null,
    },
  });
  return pid;
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

describe("POST /api/v1/submissions/:publicId/review", () => {
  it("lets the group's leader record a verdict and notifies the student", async () => {
    const pid = await seedSubmission("SUBMITTED", "Leader reviews");
    const res = await request(app)
      .post(`/api/v1/submissions/${pid}/review`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ feedback: "Good work." });

    expect(res.status).toBe(200);
    const row = await db.submission.findUnique({
      where: { publicId: pid },
      select: { status: true, feedback: true, reviewedAt: true },
    });
    expect(row).toMatchObject({ status: "REVIEWED", feedback: "Good work." });
    expect(row?.reviewedAt).not.toBeNull();

    const notified = await db.notification.count({
      where: { userId: studentUserId, type: "SUBMISSION_REVIEWED" },
    });
    expect(notified).toBeGreaterThan(0);
  });

  it("returns work for revision as RETURNED, not by demoting it to DRAFT", async () => {
    const pid = await seedSubmission("SUBMITTED", "Returned for revision");
    const res = await request(app)
      .post(`/api/v1/submissions/${pid}/review`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ feedback: "Needs another pass.", returnForRevision: true });

    expect(res.status).toBe(200);
    const row = await db.submission.findUnique({
      where: { publicId: pid },
      select: { status: true },
    });
    expect(row?.status).toBe("RETURNED");
  });

  it("refuses the author, a mentor, and an unrelated student", async () => {
    const pid = await seedSubmission("SUBMITTED", "Review refusals");

    for (const token of [ownerToken, mentorToken, peerToken]) {
      const res = await request(app)
        .post(`/api/v1/submissions/${pid}/review`)
        .set("authorization", `Bearer ${token}`)
        .send({ feedback: "no" });
      expect(res.status).toBe(403);
    }

    // A MENTOR reads every submission in the system, so the read gate would
    // have let them through — canReviewSubmission is deliberately narrower
    // rather than derived from canViewSubmission.
    const read = await request(app)
      .get(`/api/v1/submissions/${pid}`)
      .set("authorization", `Bearer ${mentorToken}`);
    expect(read.status).toBe(200);
    expect(read.body.data.canReview).toBe(false);
  });

  it("refuses to mark a never-submitted draft as reviewed", async () => {
    const pid = await seedSubmission("DRAFT", "Never submitted");
    const res = await request(app)
      .post(`/api/v1/submissions/${pid}/review`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ feedback: "?" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("not_submitted");
  });
});

describe("GET /api/v1/submissions", () => {
  it("scopes a leader's queue to their own students", async () => {
    const res = await request(app)
      .get("/api/v1/submissions?pendingOnly=false")
      .set("authorization", `Bearer ${leaderToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeGreaterThan(0);
    // peer is enrolled in the season but in no group this leader leads.
    expect(
      res.body.data.items.every((i: { studentUserId: number }) => i.studentUserId === studentUserId),
    ).toBe(true);
    expect(res.body.data.items[0]).toHaveProperty("groupName", "Group A");
  });

  it("pages rather than returning everything at once", async () => {
    const first = await request(app)
      .get("/api/v1/submissions?pendingOnly=false&limit=1")
      .set("authorization", `Bearer ${adminToken}`);

    expect(first.status).toBe(200);
    expect(first.body.data.items).toHaveLength(1);
    expect(first.body.data.nextCursor).not.toBeNull();

    const second = await request(app)
      .get(`/api/v1/submissions?pendingOnly=false&limit=1&cursor=${first.body.data.nextCursor}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(second.status).toBe(200);
    expect(second.body.data.items[0].publicId).not.toBe(first.body.data.items[0].publicId);
  });

  it("refuses a student outright", async () => {
    const res = await request(app)
      .get("/api/v1/submissions")
      .set("authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(403);
  });
});
