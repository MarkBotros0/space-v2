import { Router } from "express";
import multer from "multer";

import { db } from "../db/client";
import { apiOk, apiError } from "../lib/api-response";
import { ForbiddenError } from "../lib/auth/errors";
import { config } from "../lib/config";
import { parseId } from "../lib/parse-id";
import { canViewSubmission } from "../lib/permissions";
import { newPublicId } from "../lib/public-id";
import { buildStorageKey, getStorage } from "../lib/storage";
import { requireAuth, requireUser } from "../middleware/require-auth";
import { updateSubmissionRequestSchema } from "../../../../packages/shared/src/index";

export const submissionsRouter = Router();

submissionsRouter.use(requireAuth);

async function loadSubmissionForApi(publicId: string) {
  return db.submission.findUnique({
    where: { publicId },
    select: {
      id: true,
      publicId: true,
      status: true,
      text: true,
      feedback: true,
      submittedAt: true,
      reviewedAt: true,
      assignmentId: true,
      studentUserId: true,
      assignment: {
        select: {
          title: true,
          dueAt: true,
          description: true,
          seasonId: true,
          season: { select: { code: true } },
        },
      },
      studentUser: { select: { name: true, email: true } },
      files: {
        select: { id: true, originalName: true, storagePath: true, mimeType: true, sizeBytes: true },
        orderBy: { uploadedAt: "asc" },
      },
    },
  });
}

submissionsRouter.get("/:publicId", async (req, res) => {
  const user = requireUser(req);
  // publicId is an opaque 10-character string, not an integer — no parseId here.
  const { publicId } = req.params;

  const sub = await loadSubmissionForApi(publicId ?? "");
  if (!sub) return apiError(res, "not_found", "Submission not found.", 404);

  if (!(await canViewSubmission(user, sub.id))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  return apiOk(res, {
    id: sub.id,
    publicId: sub.publicId,
    status: sub.status,
    text: sub.text,
    feedback: sub.feedback,
    submittedAt: sub.submittedAt,
    reviewedAt: sub.reviewedAt,
    assignmentId: sub.assignmentId,
    assignmentTitle: sub.assignment.title,
    assignmentDueAt: sub.assignment.dueAt,
    assignmentDescription: sub.assignment.description,
    seasonCode: sub.assignment.season.code,
    studentUserId: sub.studentUserId,
    studentName: sub.studentUser.name,
    studentEmail: sub.studentUser.email,
    files: sub.files,
  });
});

submissionsRouter.patch("/:publicId", async (req, res) => {
  const user = requireUser(req);
  const { publicId } = req.params;

  const sub = await db.submission.findUnique({
    where: { publicId: publicId ?? "" },
    select: { id: true, studentUserId: true, assignment: { select: { dueAt: true } } },
  });
  if (!sub) return apiError(res, "not_found", "Submission not found.", 404);
  // Only the author may edit. Season admins and leaders can read a submission
  // (canViewSubmission) but must never rewrite a student's words.
  if (sub.studentUserId !== user.userId) throw new ForbiddenError();

  const parsed = updateSubmissionRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid submission body.", 400);

  if (parsed.data.submit) {
    const now = new Date();
    await db.submission.update({
      where: { id: sub.id },
      data: { text: parsed.data.text, status: "SUBMITTED", submittedAt: now },
    });
  } else {
    await db.submission.update({
      where: { id: sub.id },
      data: { text: parsed.data.text, status: "DRAFT" },
    });
  }

  return apiOk(res, { saved: true, submitted: Boolean(parsed.data.submit) });
});

// memoryStorage: the per-assignment size and MIME rules live in the database,
// so the file has to be in hand before they can be applied. limits.fileSize is
// the process-level backstop that keeps one request from exhausting memory
// before that check can run.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
});

const MIME_CATEGORY_MAP: Record<string, RegExp> = {
  image: /^image\//,
  pdf: /^application\/pdf$/,
  doc: /^(application\/msword|application\/vnd\.openxmlformats-officedocument\..*|application\/vnd\.oasis\.opendocument\..*)$/,
  audio: /^audio\//,
  video: /^video\//,
  text: /^text\//,
};

function mimeAllowed(mime: string, categories: string[]): boolean {
  // An assignment with no declared categories accepts anything.
  if (categories.length === 0) return true;
  return categories.some((c) => MIME_CATEGORY_MAP[c]?.test(mime) ?? false);
}

submissionsRouter.post("/:publicId/files", upload.single("file"), async (req, res) => {
  const user = requireUser(req);
  // Adding upload.single() as a second handler changes which IRouterMatcher
  // overload TS picks, widening req.params to the default ParamsDictionary
  // (string | string[]) instead of the route-literal-derived { publicId:
  // string }. Narrow it the same way the fileId query param is narrowed below.
  const publicId = typeof req.params.publicId === "string" ? req.params.publicId : undefined;

  const sub = await db.submission.findUnique({
    where: { publicId: publicId ?? "" },
    select: {
      id: true,
      studentUserId: true,
      assignment: { select: { maxFileSizeMb: true, allowedMimeCategories: true } },
    },
  });
  if (!sub) return apiError(res, "not_found", "Submission not found.", 404);
  if (sub.studentUserId !== user.userId) throw new ForbiddenError();

  const file = req.file;
  if (!file) return apiError(res, "bad_request", "No file provided.", 400);

  const maxMb = sub.assignment.maxFileSizeMb;
  if (maxMb && file.size > maxMb * 1024 * 1024) {
    return apiError(res, "file_too_large", `File exceeds ${maxMb} MB.`, 400);
  }
  if (!mimeAllowed(file.mimetype, sub.assignment.allowedMimeCategories)) {
    return apiError(res, "mime_not_allowed", `File type ${file.mimetype} not allowed.`, 400);
  }

  const key = buildStorageKey({
    bucket: "submissions",
    publicId: newPublicId(),
    originalName: file.originalname,
  });
  const put = await getStorage().put(key, file.buffer, { mime: file.mimetype });

  const created = await db.submissionFile.create({
    data: {
      submissionId: sub.id,
      originalName: file.originalname,
      storagePath: put.path,
      mimeType: file.mimetype || "application/octet-stream",
      sizeBytes: file.size,
    },
    select: { id: true, originalName: true, mimeType: true, sizeBytes: true },
  });

  return apiOk(res, { file: created }, 201);
});

submissionsRouter.delete("/:publicId/files", async (req, res) => {
  const user = requireUser(req);
  const { publicId } = req.params;

  const fileId = parseId(typeof req.query.fileId === "string" ? req.query.fileId : undefined);
  if (fileId === null) return apiError(res, "bad_request", "Invalid fileId.", 400);

  const file = await db.submissionFile.findUnique({
    where: { id: fileId },
    select: { storagePath: true, submission: { select: { publicId: true, studentUserId: true } } },
  });
  // The publicId in the path must match the file's own submission, or a
  // fileId alone would let a caller probe files across submissions.
  if (!file || file.submission.publicId !== publicId) {
    return apiError(res, "not_found", "File not found.", 404);
  }
  if (file.submission.studentUserId !== user.userId) throw new ForbiddenError();

  // Storage first, then the row. A failed unlink must not leave a database row
  // pointing at a file the user believes is gone, so the delete is swallowed —
  // an orphaned blob is recoverable, an orphaned row is not.
  await getStorage()
    .delete(file.storagePath)
    .catch(() => undefined);
  await db.submissionFile.delete({ where: { id: fileId } });

  return apiOk(res, { deleted: true });
});
