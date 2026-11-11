import { db } from "../../db/client";
import { ApiError } from "../api-error";
import { liveAssignment } from "../db/live";
import { EDITABLE_STATUSES } from "../permissions/submission";
import { newPublicId } from "../public-id";
import { buildStorageKey, getStorage } from "../storage";
import { lockEssayWork } from "./essay";

/*
 * Files on a student's essay. The routes check who may write and refuse what
 * they can before a byte is stored; these writes check again under the
 * essay's locks (`lockEssayWork`: assignment, Submission, work), because the
 * blob's round trip sits between the route's read and the row: the essay may
 * have been handed in, its part removed or its file limit dropped meanwhile.
 */

const MIME_CATEGORY_MAP: Record<string, RegExp> = {
  image: /^image\//,
  pdf: /^application\/pdf$/,
  doc: /^(application\/msword|application\/vnd\.openxmlformats-officedocument\..*|application\/vnd\.oasis\.opendocument\..*)$/,
  audio: /^audio\//,
  video: /^video\//,
  text: /^text\//,
};

function mimeAllowed(mime: string, categories: string[]): boolean {
  // An essay with no declared categories accepts anything.
  if (categories.length === 0) return true;
  return categories.some((c) => MIME_CATEGORY_MAP[c]?.test(mime) ?? false);
}

/** Why this essay can't take this file, or null. An essay with no size limit takes no files. */
export function essayFileRefusal(
  part: { maxFileSizeMb: number | null; allowedMimeCategories: string[] },
  file: { size: number; mimeType: string },
): ApiError | null {
  const maxMb = part.maxFileSizeMb;
  if (maxMb === null) return new ApiError("bad_request", "This essay doesn't take files.", 400);
  if (file.size > maxMb * 1024 * 1024) return new ApiError("file_too_large", `File exceeds ${maxMb} MB.`, 400);
  if (!mimeAllowed(file.mimeType, part.allowedMimeCategories)) {
    return new ApiError("mime_not_allowed", `File type ${file.mimeType} not allowed.`, 400);
  }
  return null;
}

const lockedMessage = "This essay has been handed in and can no longer be changed.";

/** Drops a stored blob; a failure leaves an orphaned blob, which is recoverable. */
async function dropBlob(path: string): Promise<void> {
  await getStorage()
    .delete(path)
    .catch((): void => undefined);
}

/** Drops blobs whose rows are gone (a removed part's files), best-effort, after the commit. */
export async function dropBlobs(paths: string[]): Promise<void> {
  for (const path of paths) await dropBlob(path);
}

/**
 * Stores the file, then records it on the student's essay under the locks,
 * re-checking that the part is a live essay's, the essay is still editable
 * (DRAFT or RETURNED) and the file within its limits. A refusal drops the
 * stored blob and throws the refusal (404, 409 `submission_locked`, 400).
 */
export async function attachEssayFile(
  publicId: string,
  studentUserId: number,
  file: { buffer: Buffer; originalName: string; mimeType: string; size: number },
): Promise<{ id: number; originalName: string; mimeType: string; sizeBytes: number }> {
  const key = buildStorageKey({ bucket: "submissions", publicId: newPublicId(), originalName: file.originalName });
  const put = await getStorage().put(key, file.buffer, { mime: file.mimeType });
  try {
    return await db.$transaction(async (tx) => {
      await lockEssayWork(tx, publicId);
      const work = await tx.assignmentPartWork.findFirst({
        where: { publicId, studentUserId, part: { kind: "ESSAY", assignment: liveAssignment } },
        select: { id: true, status: true, part: { select: { maxFileSizeMb: true, allowedMimeCategories: true } } },
      });
      if (!work) throw new ApiError("not_found", "Submission not found.", 404);
      if (!EDITABLE_STATUSES.includes(work.status)) throw new ApiError("submission_locked", lockedMessage, 409);
      const refusal = essayFileRefusal(work.part, file);
      if (refusal !== null) throw refusal;
      return tx.submissionFile.create({
        data: {
          partWorkId: work.id,
          originalName: file.originalName,
          storagePath: put.path,
          mimeType: file.mimeType || "application/octet-stream",
          sizeBytes: file.size,
        },
        select: { id: true, originalName: true, mimeType: true, sizeBytes: true },
      });
    });
  } catch (err) {
    await dropBlob(put.path);
    throw err;
  }
}

/**
 * Removes one file from the student's editable essay under the locks, then
 * drops its blob once the row is gone (best-effort: an orphaned blob is
 * recoverable, a row pointing at nothing is not).
 */
export async function removeEssayFile(publicId: string, studentUserId: number, fileId: number): Promise<void> {
  const storagePath = await db.$transaction(async (tx) => {
    await lockEssayWork(tx, publicId);
    const file = await tx.submissionFile.findFirst({
      where: {
        id: fileId,
        partWork: { publicId, studentUserId, part: { kind: "ESSAY", assignment: liveAssignment } },
      },
      select: { storagePath: true, partWork: { select: { status: true } } },
    });
    if (!file) throw new ApiError("not_found", "File not found.", 404);
    if (!EDITABLE_STATUSES.includes(file.partWork.status)) {
      throw new ApiError("submission_locked", lockedMessage, 409);
    }
    await tx.submissionFile.delete({ where: { id: fileId } });
    return file.storagePath;
  });
  await dropBlob(storagePath);
}
