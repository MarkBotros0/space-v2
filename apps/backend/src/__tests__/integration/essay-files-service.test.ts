import { db } from "../../db/client";
import { ApiError } from "../../lib/api-error";
import { attachEssayFile, removeEssayFile } from "../../lib/assignments/essay-files";
import { FileNotFoundError, getStorage } from "../../lib/storage";
import { createAssignmentWithParts, seedTextWork } from "./assignment-reads-setup";
import { cleanupTestData, createTestSeason, createTestUser } from "./fixtures";

// The file writes under the essay's locks: the route's checks ran on a row
// read before the blob was stored, so the service checks again under the lock
// and never leaves a row on a handed-in essay or a blob behind a refusal.
jest.setTimeout(60000);

let seasonId: number;
let studentUserId: number;
const stored: string[] = [];

beforeAll(async () => {
  await cleanupTestData();
  seasonId = (await createTestSeason()).id;
  studentUserId = (await createTestUser("files-owner", "STUDENT")).id;
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
  for (const path of stored) await getStorage().delete(path);
});

const file = () => ({ buffer: Buffer.from("hello"), originalName: "a.txt", mimeType: "text/plain", size: 5 });

/** A one-essay assignment taking 1 MB text files, and the student's work on it. */
async function essayWithFiles(title: string, status: "DRAFT" | "SUBMITTED" = "DRAFT") {
  const a = await createAssignmentWithParts({ seasonId, title }, [{ kind: "ESSAY" }]);
  const partId = a.partIds[0]!;
  await db.assignmentPart.update({
    where: { id: partId },
    data: { maxFileSizeMb: 1, allowedMimeCategories: ["text"] },
  });
  const work = await seedTextWork(a.id, partId, studentUserId, status);
  return { assignmentId: a.id, partId, work };
}

/** Runs `write` with storage watched; returns the refusal and the blobs it stored. */
async function refusal(write: () => Promise<unknown>) {
  const put = jest.spyOn(getStorage(), "put");
  try {
    const error = await write().then(
      () => null,
      (e: unknown) => e,
    );
    const paths = await Promise.all(put.mock.results.map((r) => r.value as Promise<{ path: string }>));
    return { error, paths: paths.map((p) => p.path) };
  } finally {
    put.mockRestore();
  }
}

async function blobGone(path: string): Promise<boolean> {
  return getStorage()
    .get(path)
    .then(
      (s) => {
        s.destroy();
        return false;
      },
      (e: unknown) => e instanceof FileNotFoundError,
    );
}

describe("attachEssayFile", () => {
  it("attaches a file to a draft essay", async () => {
    const { work } = await essayWithFiles("Attach ok");
    const row = await attachEssayFile(work.publicId, studentUserId, file());
    const saved = await db.submissionFile.findUniqueOrThrow({ where: { id: row.id } });
    stored.push(saved.storagePath);
    expect(saved.partWorkId).toBe(work.id);
  });

  it("refuses an upload the essay was handed in under, and drops the stored blob", async () => {
    const { work } = await essayWithFiles("Handed in meanwhile", "SUBMITTED");
    const { error, paths } = await refusal(() => attachEssayFile(work.publicId, studentUserId, file()));
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("submission_locked");
    expect((error as ApiError).status).toBe(409);
    expect(await db.submissionFile.count({ where: { partWorkId: work.id } })).toBe(0);
    expect(paths).toHaveLength(1);
    expect(await blobGone(paths[0]!)).toBe(true);
  });

  it("refuses an upload to a part removed meanwhile with 404, not a 500, and drops the blob", async () => {
    const { partId, work } = await essayWithFiles("Removed meanwhile");
    await db.assignmentPart.delete({ where: { id: partId } });
    const { error, paths } = await refusal(() => attachEssayFile(work.publicId, studentUserId, file()));
    expect((error as ApiError).status).toBe(404);
    expect(await Promise.all(paths.map(blobGone))).toEqual(paths.map(() => true));
  });

  it("refuses once the essay no longer takes files", async () => {
    const { partId, work } = await essayWithFiles("Files switched off");
    await db.assignmentPart.update({ where: { id: partId }, data: { maxFileSizeMb: null } });
    const { error, paths } = await refusal(() => attachEssayFile(work.publicId, studentUserId, file()));
    expect((error as ApiError).message).toBe("This essay doesn't take files.");
    expect(await Promise.all(paths.map(blobGone))).toEqual(paths.map(() => true));
  });
});

describe("removeEssayFile", () => {
  it("removes the row and then the blob", async () => {
    const { work } = await essayWithFiles("Remove ok");
    const row = await attachEssayFile(work.publicId, studentUserId, file());
    const { storagePath } = await db.submissionFile.findUniqueOrThrow({ where: { id: row.id } });
    await removeEssayFile(work.publicId, studentUserId, row.id);
    expect(await db.submissionFile.count({ where: { id: row.id } })).toBe(0);
    expect(await blobGone(storagePath)).toBe(true);
  });

  it("refuses once the essay is handed in, and keeps the row and the blob", async () => {
    const { work } = await essayWithFiles("Remove locked");
    const row = await attachEssayFile(work.publicId, studentUserId, file());
    const { storagePath } = await db.submissionFile.findUniqueOrThrow({ where: { id: row.id } });
    stored.push(storagePath);
    await db.assignmentPartWork.update({ where: { id: work.id }, data: { status: "SUBMITTED" } });
    const error = await removeEssayFile(work.publicId, studentUserId, row.id).catch((e: unknown) => e);
    expect((error as ApiError).code).toBe("submission_locked");
    expect(await db.submissionFile.count({ where: { id: row.id } })).toBe(1);
    expect(await blobGone(storagePath)).toBe(false);
  });
});
