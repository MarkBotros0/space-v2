import { rm } from "node:fs/promises";
import { resolve } from "node:path";

import request from "supertest";

import { createApp } from "../../app";
import { config } from "../../lib/config";
import { db } from "../../db/client";
import { newPublicId } from "../../lib/public-id";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

// Brief specifies 30000, but the shared Neon staging Postgres autosuspends —
// measured ~18s for the first query after idle. 60000 gives headroom for a
// cold start without masking a genuine hang.
jest.setTimeout(60000);

const app = createApp();

let publicId: string;
let otherPublicId: string;
let ownerToken: string;
let peerToken: string;

beforeAll(async () => {
  await cleanupTestData();

  const season = await createTestSeason();
  const owner = await createTestUser("owner", "STUDENT");
  const peer = await createTestUser("peer", "STUDENT");

  await db.seasonEnrollment.createMany({
    data: [
      { seasonId: season.id, studentUserId: owner.id, status: "ACTIVE" },
      { seasonId: season.id, studentUserId: peer.id, status: "ACTIVE" },
    ],
  });

  const assignment = await db.assignment.create({
    data: {
      seasonId: season.id,
      title: "Upload one file",
      isAllGroups: true,
      maxFileSizeMb: 1,
      allowedMimeCategories: ["text", "image"],
    },
    select: { id: true },
  });

  // See Ruling F2 — production's generator, not a hand-rolled short id.
  publicId = newPublicId();
  await db.submission.create({
    data: { assignmentId: assignment.id, studentUserId: owner.id, publicId, status: "DRAFT" },
  });

  // A second submission on a different assignment (the same owner, since
  // @@unique([assignmentId, studentUserId]) forbids two on the same
  // assignment). Exists only so the fileId<->publicId cross-submission guard
  // has a real "different submission" to point at, without depending on any
  // row outside this fixture's own season.
  const otherAssignment = await db.assignment.create({
    data: {
      seasonId: season.id,
      title: "Upload another file",
      isAllGroups: true,
      maxFileSizeMb: 1,
      allowedMimeCategories: ["text", "image"],
    },
    select: { id: true },
  });
  otherPublicId = newPublicId();
  await db.submission.create({
    data: {
      assignmentId: otherAssignment.id,
      studentUserId: owner.id,
      publicId: otherPublicId,
      status: "DRAFT",
    },
  });

  ownerToken = await login(app, owner.email);
  peerToken = await login(app, peer.email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
  // Remove whatever the local driver actually wrote during this run.
  await rm(resolve(config.localUploadsDir, "submissions"), { recursive: true, force: true });
});

describe("POST /api/v1/submissions/:publicId/files", () => {
  it("stores an allowed file and returns 201 with the row", async () => {
    const res = await request(app)
      .post(`/api/v1/submissions/${publicId}/files`)
      .set("authorization", `Bearer ${ownerToken}`)
      .attach("file", Buffer.from("hello world"), {
        filename: "notes.txt",
        contentType: "text/plain",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.file).toEqual({
      id: expect.any(Number),
      originalName: "notes.txt",
      mimeType: "text/plain",
      sizeBytes: 11,
    });

    const stored = await db.submissionFile.findFirst({
      where: { submission: { publicId } },
      select: { storagePath: true },
    });
    expect(stored?.storagePath).toMatch(/^submissions\/\d{4}\/\d{2}\/.+-notes\.txt$/);
  });

  it("rejects a MIME type the assignment does not allow", async () => {
    const res = await request(app)
      .post(`/api/v1/submissions/${publicId}/files`)
      .set("authorization", `Bearer ${ownerToken}`)
      .attach("file", Buffer.from("%PDF-1.4"), {
        filename: "paper.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("mime_not_allowed");
  });

  it("rejects a file over the assignment's size limit", async () => {
    // maxFileSizeMb is 1; send 2 MB. Under MAX_UPLOAD_BYTES, so this exercises
    // the per-assignment check rather than multer's backstop.
    const res = await request(app)
      .post(`/api/v1/submissions/${publicId}/files`)
      .set("authorization", `Bearer ${ownerToken}`)
      .attach("file", Buffer.alloc(2 * 1024 * 1024, 0x61), {
        filename: "big.txt",
        contentType: "text/plain",
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("file_too_large");
  });

  it("returns 400 when no file part is present", async () => {
    const res = await request(app)
      .post(`/api/v1/submissions/${publicId}/files`)
      .set("authorization", `Bearer ${ownerToken}`)
      .field("notafile", "x");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
  });

  it("refuses a student who does not own the submission", async () => {
    const res = await request(app)
      .post(`/api/v1/submissions/${publicId}/files`)
      .set("authorization", `Bearer ${peerToken}`)
      .attach("file", Buffer.from("x"), { filename: "a.txt", contentType: "text/plain" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
  });

  it("returns 404 for an unknown submission", async () => {
    const res = await request(app)
      .post("/api/v1/submissions/doesnotexi/files")
      .set("authorization", `Bearer ${ownerToken}`)
      .attach("file", Buffer.from("x"), { filename: "a.txt", contentType: "text/plain" });

    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/v1/submissions/:publicId/files", () => {
  it("deletes the owner's file", async () => {
    const file = await db.submissionFile.findFirstOrThrow({
      where: { submission: { publicId } },
      select: { id: true },
    });

    const res = await request(app)
      .delete(`/api/v1/submissions/${publicId}/files?fileId=${file.id}`)
      .set("authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ deleted: true });
    expect(await db.submissionFile.count({ where: { id: file.id } })).toBe(0);
  });

  it("returns 400 for a missing or non-numeric fileId", async () => {
    const res = await request(app)
      .delete(`/api/v1/submissions/${publicId}/files`)
      .set("authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
  });

  it("returns 404 for a fileId that does not exist", async () => {
    const res = await request(app)
      .delete(`/api/v1/submissions/${publicId}/files?fileId=2147483000`)
      .set("authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(404);
  });

  it("refuses a non-owner deleting the owner's file", async () => {
    const upload = await request(app)
      .post(`/api/v1/submissions/${publicId}/files`)
      .set("authorization", `Bearer ${ownerToken}`)
      .attach("file", Buffer.from("peer test"), {
        filename: "peer.txt",
        contentType: "text/plain",
      });
    const fileId = upload.body.data.file.id;

    const res = await request(app)
      .delete(`/api/v1/submissions/${publicId}/files?fileId=${fileId}`)
      .set("authorization", `Bearer ${peerToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
    // The row must survive a refused delete.
    expect(await db.submissionFile.count({ where: { id: fileId } })).toBe(1);
  });

  it("refuses a fileId that belongs to a different submission", async () => {
    // A bare fileId must not let a caller reach across submissions — the
    // handler ties the file to the :publicId in the path. otherPublicId is a
    // second submission owned by the same user, created in beforeAll.
    const upload = await request(app)
      .post(`/api/v1/submissions/${publicId}/files`)
      .set("authorization", `Bearer ${ownerToken}`)
      .attach("file", Buffer.from("cross test"), {
        filename: "cross.txt",
        contentType: "text/plain",
      });
    const fileId = upload.body.data.file.id;

    const res = await request(app)
      .delete(`/api/v1/submissions/${otherPublicId}/files?fileId=${fileId}`)
      .set("authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });
});
