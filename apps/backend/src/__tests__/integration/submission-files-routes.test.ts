import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { newPublicId } from "../../lib/public-id";
import { getStorage } from "../../lib/storage";
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
  // Collect exactly the storage paths this run's uploads wrote, before the
  // rows are cleaned up. Every SubmissionFile row here hangs off publicId or
  // otherPublicId — the two submissions this suite created in beforeAll — so
  // this query cannot see a file any other run or any real user wrote. The
  // storagePath itself also embeds the submission's newPublicId() (see
  // buildStorageKey), so even the filename on disk is unique to this run.
  const files = await db.submissionFile.findMany({
    where: { submission: { publicId: { in: [publicId, otherPublicId] } } },
    select: { storagePath: true },
  });

  await cleanupTestData();
  await db.$disconnect();

  // Unlink exactly those paths — never a directory, never anything derived
  // from a shared/static name. LocalFsStorage#delete treats an already-gone
  // file as a no-op, so this is safe even if a test above already deleted it.
  const storage = getStorage();
  for (const file of files) {
    await storage.delete(file.storagePath);
  }
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

describe("GET /api/v1/submissions/:publicId/files/:fileId", () => {
  /** Upload a file as the owner and return its id. Each test makes its own so
   *  no test depends on a file a neighbour may have deleted. */
  async function uploadOwned(
    filename: string,
    contents: string,
  ): Promise<{ fileId: number }> {
    const upload = await request(app)
      .post(`/api/v1/submissions/${publicId}/files`)
      .set("authorization", `Bearer ${ownerToken}`)
      .attach("file", Buffer.from(contents), { filename, contentType: "text/plain" });
    expect(upload.status).toBe(201);
    return { fileId: upload.body.data.file.id as number };
  }

  it("streams the file back to its owner with the recorded metadata", async () => {
    const { fileId } = await uploadOwned("download.txt", "downloaded bytes");

    const res = await request(app)
      .get(`/api/v1/submissions/${publicId}/files/${fileId}`)
      .set("authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.text).toBe("downloaded bytes");
    // Content-Type comes from the stored mimeType, never sniffed from the
    // extension.
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.headers["content-length"]).toBe("16");
    // attachment, not inline: uploads are arbitrary user content and may be
    // HTML or SVG, which would be an XSS vector served inline from this origin.
    expect(res.headers["content-disposition"]).toContain("attachment");
    expect(res.headers["content-disposition"]).toContain('filename="download.txt"');
    expect(res.headers["cache-control"]).toBe("private, max-age=3600");
  });

  it("encodes a non-ASCII filename without breaking the header", async () => {
    const { fileId } = await uploadOwned("تقرير final.txt", "arabic name");

    const res = await request(app)
      .get(`/api/v1/submissions/${publicId}/files/${fileId}`)
      .set("authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    const disposition = res.headers["content-disposition"];
    // The ASCII fallback stays quotable, and the real name rides in filename*.
    expect(disposition).toMatch(/filename="[\x20-\x7E]*"/);
    expect(disposition).toContain("filename*=UTF-8''");
    expect(disposition).toContain(encodeURIComponent("تقرير final.txt"));
  });

  it("refuses a peer student in the same season", async () => {
    const { fileId } = await uploadOwned("private.txt", "not for peers");

    const res = await request(app)
      .get(`/api/v1/submissions/${publicId}/files/${fileId}`)
      .set("authorization", `Bearer ${peerToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
  });

  it("refuses a fileId that belongs to a different submission", async () => {
    const { fileId } = await uploadOwned("cross-read.txt", "cross read");

    const res = await request(app)
      .get(`/api/v1/submissions/${otherPublicId}/files/${fileId}`)
      .set("authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });

  it("returns 400 for a non-numeric fileId", async () => {
    const res = await request(app)
      .get(`/api/v1/submissions/${publicId}/files/abc`)
      .set("authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
  });

  it("returns 404 for a fileId that does not exist", async () => {
    const res = await request(app)
      .get(`/api/v1/submissions/${publicId}/files/2147483000`)
      .set("authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });

  it("requires authentication", async () => {
    const { fileId } = await uploadOwned("needs-auth.txt", "needs auth");

    const res = await request(app).get(`/api/v1/submissions/${publicId}/files/${fileId}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
  });

  it("returns 404 when the row survives but the blob is gone", async () => {
    // A dangling SubmissionFile row must 404, not 500 — the storage delete in
    // the DELETE handler is deliberately swallowed, so this state is reachable.
    const { fileId } = await uploadOwned("vanished.txt", "about to vanish");
    const row = await db.submissionFile.findUniqueOrThrow({
      where: { id: fileId },
      select: { storagePath: true },
    });
    await getStorage().delete(row.storagePath);

    const res = await request(app)
      .get(`/api/v1/submissions/${publicId}/files/${fileId}`)
      .set("authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });
});
