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

  await db.group.create({
    data: {
      seasonId,
      name: "Group A",
      leaders: { create: { userId: leader.id } },
      students: { create: { studentUserId: owner.id } },
    },
  });
  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  await db.seasonEnrollment.createMany({
    data: [
      { seasonId, studentUserId: owner.id, status: "ACTIVE" },
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

  ownerToken = await login(app, owner.email);
  peerToken = await login(app, peer.email);
  leaderToken = await login(app, leader.email);
  adminToken = await login(app, admin.email);
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
});
