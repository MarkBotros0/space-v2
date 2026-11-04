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
let assignmentId: number;
let publicId: string;
let studentUserId: number;
let leaderUserId: number;
let groupAId: number;
let mentorToken: string;
let ownerToken: string;
let peerToken: string;
let leaderToken: string;
let adminToken: string;

beforeAll(async () => {
  ({ seasonId, assignmentId, publicId, studentUserId, leaderUserId, groupAId, mentorToken, ownerToken, peerToken, leaderToken, adminToken } = await seedSubmissionFixtures(app));
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

/** A submission of the owner's on a brand-new assignment, in a known state. */
function seedSubmission(status: "SUBMITTED" | "DRAFT", title: string): Promise<string> {
  return seedSubmissionFor(seasonId, studentUserId, status, title);
}

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
    // stale feedback stayed on screen for the student. A REVIEWED row is no
    // longer the student's to change at all: neither a save nor a re-submit.
    for (const body of [{ text: "edited after review" }, { text: "resubmit", submit: true }]) {
      const res = await request(app)
        .patch(`/api/v1/submissions/${pid}`)
        .set("authorization", `Bearer ${ownerToken}`)
        .send(body);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("submission_locked");
    }

    const row = await db.submission.findUnique({
      where: { publicId: pid },
      select: { status: true, text: true },
    });
    expect(row?.status).toBe("REVIEWED");
    expect(row?.text).not.toBe("edited after review");
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
      select: { status: true, feedback: true, reviewedAt: true, reviewedById: true },
    });
    expect(row).toMatchObject({ status: "REVIEWED", feedback: "Good work." });
    expect(row?.reviewedById).toBe(leaderUserId);
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

  it("never returns a DRAFT to a reviewer, even with pendingOnly=false", async () => {
    const draftPid = await seedSubmission("DRAFT", "Queue draft");
    for (const token of [adminToken, leaderToken]) {
      const res = await request(app)
        .get("/api/v1/submissions?pendingOnly=false&limit=100")
        .set("authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      const items = res.body.data.items as { publicId: string; status: string }[];
      expect(items.some((i) => i.publicId === draftPid)).toBe(false);
      expect(items.every((i) => i.status !== "DRAFT")).toBe(true);
    }
  });

  it("refuses a student outright", async () => {
    const res = await request(app)
      .get("/api/v1/submissions")
      .set("authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(403);
  });
});

describe("submission detail read (REG-90, REG-89)", () => {
  it("returns text and feedback as plain text, never stored markup (ruling C11)", async () => {
    const pid = await seedSubmission("SUBMITTED", "Sanitised read");
    await db.submission.update({
      where: { publicId: pid },
      data: {
        text: '<p>Hello &amp; <b>world</b></p><script>alert(1)</script><p>Line two</p>',
        feedback: "<p>Nice &lt;work&gt;</p>",
      },
    });
    const res = await request(app)
      .get(`/api/v1/submissions/${pid}`)
      .set("authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.text).not.toMatch(/<\/?(p|b|script)/i);
    expect(res.body.data.text).toContain("Hello & world");
    expect(res.body.data.text).toContain("Line two");
    expect(res.body.data.feedback).toBe("Nice <work>");
  });

  it("names the student's group in that assignment's season (C9)", async () => {
    const res = await request(app)
      .get(`/api/v1/submissions/${publicId}`)
      .set("authorization", `Bearer ${leaderToken}`);
    expect(res.body.data).toMatchObject({ groupId: groupAId, groupName: "Group A" });

    const mine = await seedSubmission("SUBMITTED", "Ungrouped peer");
    const peerRow = await db.submission.findUnique({ where: { publicId: mine }, select: { id: true } });
    const peer = await db.user.findFirst({ where: { name: "Test peer" }, select: { id: true } });
    await db.submission.update({ where: { id: peerRow!.id }, data: { studentUserId: peer!.id } });
    const ungrouped = await request(app)
      .get(`/api/v1/submissions/${mine}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(ungrouped.body.data).toMatchObject({ groupId: null, groupName: null });
  });
});
