import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { newPublicId } from "../../lib/public-id";
import { getStorage } from "../../lib/storage";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

// Generous for a cold database's first query, without masking a genuine hang.
jest.setTimeout(60000);

const app = createApp();

let publicId: string;
let otherPublicId: string;
let noFilesPublicId: string;
let workId: number;
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

  // Two essays that take files (1 MB, text or image) and one that takes none.
  // The second gives the fileId<->publicId cross-work guard a real "different
  // essay" to point at.
  const essay = (position: number, files: boolean) => ({
    position,
    kind: "ESSAY" as const,
    prompt: `Question ${position + 1}`,
    maxFileSizeMb: files ? 1 : null,
    allowedMimeCategories: files ? ["text", "image"] : [],
  });
  const assignment = await db.assignment.create({
    data: {
      seasonId: season.id,
      title: "Upload one file",
      parts: { create: [essay(0, true), essay(1, true), essay(2, false)] },
    },
    select: { id: true, parts: { orderBy: { position: "asc" }, select: { id: true } } },
  });
  const [first, second, third] = assignment.parts.map((p) => p.id) as [number, number, number];

  // See Ruling F2 — production's generator, not a hand-rolled short id.
  const submission = await db.submission.create({
    data: { assignmentId: assignment.id, studentUserId: owner.id, publicId: newPublicId() },
    select: { id: true },
  });
  const work = (partId: number) =>
    db.assignmentPartWork.create({
      data: { publicId: newPublicId(), partId, submissionId: submission.id, studentUserId: owner.id },
      select: { id: true, publicId: true },
    });
  const w1 = await work(first);
  publicId = w1.publicId;
  workId = w1.id;
  otherPublicId = (await work(second)).publicId;
  noFilesPublicId = (await work(third)).publicId;

  ownerToken = await login(app, owner.email);
  peerToken = await login(app, peer.email);
});

afterAll(async () => {
  // Collect exactly the storage paths this run's uploads wrote, before the
  // rows are cleaned up. Every SubmissionFile row here hangs off the essay
  // works this suite created in beforeAll, so this query cannot see a file any
  // other run or any real user wrote. The storagePath itself also embeds a
  // newPublicId() (see buildStorageKey), so even the filename on disk is
  // unique to this run.
  const files = await db.submissionFile.findMany({
    where: { partWork: { publicId: { in: [publicId, otherPublicId, noFilesPublicId] } } },
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
      where: { partWork: { publicId } },
      select: { storagePath: true, partWorkId: true },
    });
    expect(stored?.storagePath).toMatch(/^submissions\/\d{4}\/\d{2}\/.+-notes\.txt$/);
    // Files attach to the essay, and the essay's detail lists them.
    expect(stored?.partWorkId).toBe(workId);
    const detail = await request(app)
      .get(`/api/v1/submissions/${publicId}`)
      .set("authorization", `Bearer ${ownerToken}`);
    expect(detail.body.data.files).toEqual([res.body.data.file]);
    expect(detail.body.data).toMatchObject({ maxFileSizeMb: 1, allowedMimeCategories: ["text", "image"] });
  });

  it("refuses a file on an essay that takes none", async () => {
    const res = await request(app)
      .post(`/api/v1/submissions/${noFilesPublicId}/files`)
      .set("authorization", `Bearer ${ownerToken}`)
      .attach("file", Buffer.from("hello"), { filename: "a.txt", contentType: "text/plain" });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("This essay doesn't take files.");
    expect(await db.submissionFile.count({ where: { partWork: { publicId: noFilesPublicId } } })).toBe(0);
  });

  it("refuses a file once the essay is handed in", async () => {
    await db.assignmentPartWork.update({ where: { publicId: otherPublicId }, data: { status: "SUBMITTED" } });
    const res = await request(app)
      .post(`/api/v1/submissions/${otherPublicId}/files`)
      .set("authorization", `Bearer ${ownerToken}`)
      .attach("file", Buffer.from("late"), { filename: "late.txt", contentType: "text/plain" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("submission_locked");
    await db.assignmentPartWork.update({ where: { publicId: otherPublicId }, data: { status: "DRAFT" } });
  });

  it("rejects a MIME type the essay does not allow", async () => {
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

  it("rejects a file over the essay's size limit", async () => {
    // maxFileSizeMb is 1; send 2 MB. Under MAX_UPLOAD_BYTES, so this exercises
    // the essay's own check rather than multer's backstop.
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

    // The owner's submission is a DRAFT, which exists only for its author.
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
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
      where: { partWork: { publicId } },
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

    // A file on someone else's DRAFT is as absent as the draft itself.
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
    // The row must survive a refused delete.
    expect(await db.submissionFile.count({ where: { id: fileId } })).toBe(1);
  });

  it("refuses a fileId that belongs to a different submission", async () => {
    // A bare fileId must not let a caller reach across essays — the handler
    // ties the file to the :publicId in the path. otherPublicId is a second
    // essay of the same student, created in beforeAll.
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
  async function uploadOwned(filename: string, contents: string): Promise<{ fileId: number }> {
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

    // A file on someone else's DRAFT is as absent as the draft itself.
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
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
