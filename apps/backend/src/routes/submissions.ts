import { Router, type RequestHandler } from "express";
import multer from "multer";

import { db } from "../db/client";
import type { Prisma } from "../generated/prisma/client";
import { apiOk, apiError } from "../lib/api-response";
import { ForbiddenError } from "../lib/auth/errors";
import { config } from "../lib/config";
import { createNotificationsBulk } from "../lib/notifications";
import { parseId } from "../lib/parse-id";
import { canAccessSeason, canReviewSubmission, canViewSubmission } from "../lib/permissions";
import { newPublicId } from "../lib/public-id";
import { isLate, studentCanSeeAssignment } from "../lib/queries/assignments";
import { isMentor, isSuper } from "../lib/rbac";
import { FileNotFoundError, buildStorageKey, getStorage } from "../lib/storage";
import { requireAuth, requireUser } from "../middleware/require-auth";
import {
  reviewSubmissionRequestSchema,
  submissionQueueQuerySchema,
  updateSubmissionRequestSchema,
} from "../../../../packages/shared/src/index";

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
      // storagePath is deliberately absent. v1's client needed it to build a
      // URL into /api/uploads/[...path] — the endpoint that served any stored
      // file to any logged-in user. v2 addresses a file by id scoped to its
      // submission, so the path is not just unnecessary on the wire, it is the
      // one field that made the old hole exploitable by anyone who saw a
      // response.
      files: {
        select: {
          id: true,
          originalName: true,
          mimeType: true,
          sizeBytes: true,
        },
        orderBy: { uploadedAt: "asc" },
      },
    },
  });
}

/**
 * A reviewer's queue.
 *
 * v1's returned every submission the reader could reach, in every season, in
 * one unpaginated response. Scoped and paged here — on a phone the old shape is
 * both a privacy problem and a payload problem.
 *
 * A LEADER's scope cannot be written as a single Prisma filter: the constraint
 * is "the student's enrolment *in this assignment's season* names a group I
 * lead", which relates two branches of the query to each other. So the pairs
 * are resolved first and expanded into an OR. That is bounded by the leader's
 * own roster, not by the season.
 */
submissionsRouter.get("/", async (req, res) => {
  const user = requireUser(req);

  if (user.role === "STUDENT") {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const parsed = submissionQueueQuerySchema.safeParse(req.query);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid query.", 400);
  const { pendingOnly, seasonId, cursor, limit } = parsed.data;

  let scope: Prisma.SubmissionWhereInput | null = null;
  if (isSuper(user) || isMentor(user)) {
    scope = {};
  } else if (user.role === "ADMIN") {
    scope = { assignment: { seasonId: { in: user.seasonAdminIds } } };
  } else if (user.role === "LEADER") {
    const groups = await db.group.findMany({
      where: { id: { in: user.groupLeaderIds } },
      select: { id: true, seasonId: true },
    });
    const enrollments = await db.seasonEnrollment.findMany({
      where: { groupId: { in: groups.map((g) => g.id) } },
      select: { studentUserId: true, seasonId: true },
    });
    scope =
      enrollments.length === 0
        ? null
        : {
            OR: enrollments.map((e) => ({
              studentUserId: e.studentUserId,
              assignment: { seasonId: e.seasonId },
            })),
          };
  }
  if (scope === null) return apiOk(res, { items: [], nextCursor: null });

  // AND rather than spreading, so the scope's own `assignment` constraint (the
  // ADMIN case) cannot be silently overwritten by the filters below it. A
  // scope clause that disappears here is a data leak, not a lost filter.
  const where: Prisma.SubmissionWhereInput = {
    AND: [
      scope,
      { assignment: { deletedAt: null } },
      ...(pendingOnly ? [{ status: "SUBMITTED" as const }] : []),
      ...(seasonId ? [{ assignment: { seasonId } }] : []),
    ],
  };

  // One extra row tells us whether another page exists without a second count
  // query. Ordered by id so the cursor is stable even when two submissions
  // share a submittedAt.
  const rows = await db.submission.findMany({
    where,
    orderBy: { id: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { publicId: cursor }, skip: 1 } : {}),
    select: {
      publicId: true,
      status: true,
      submittedAt: true,
      studentUserId: true,
      assignmentId: true,
      assignment: {
        select: { title: true, dueAt: true, seasonId: true, season: { select: { code: true } } },
      },
      studentUser: { select: { name: true } },
    },
  });

  const page = rows.slice(0, limit);

  // Group membership is per season, so it is resolved per (student, season)
  // pair rather than from GroupStudent — ruling C9.
  const enrollments = await db.seasonEnrollment.findMany({
    where: {
      OR: page.map((r) => ({
        studentUserId: r.studentUserId,
        seasonId: r.assignment.seasonId,
      })),
    },
    select: {
      studentUserId: true,
      seasonId: true,
      groupId: true,
      group: { select: { name: true } },
    },
  });
  const groupBy = new Map(
    enrollments.map((e) => [`${e.studentUserId}:${e.seasonId}`, e] as const),
  );

  return apiOk(res, {
    items: page.map((r) => {
      const enrollment = groupBy.get(`${r.studentUserId}:${r.assignment.seasonId}`);
      return {
        publicId: r.publicId,
        status: r.status,
        submittedAt: r.submittedAt,
        isLate: isLate(r.submittedAt, r.assignment.dueAt),
        assignmentId: r.assignmentId,
        assignmentTitle: r.assignment.title,
        assignmentDueAt: r.assignment.dueAt,
        seasonCode: r.assignment.season.code,
        studentUserId: r.studentUserId,
        studentName: r.studentUser.name,
        groupId: enrollment?.groupId ?? null,
        groupName: enrollment?.group?.name ?? null,
      };
    }),
    nextCursor: rows.length > limit ? (page[page.length - 1]?.publicId ?? null) : null,
  });
});

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
    isLate: isLate(sub.submittedAt, sub.assignment.dueAt),
    assignmentId: sub.assignmentId,
    assignmentTitle: sub.assignment.title,
    assignmentDueAt: sub.assignment.dueAt,
    assignmentDescription: sub.assignment.description,
    seasonCode: sub.assignment.season.code,
    studentUserId: sub.studentUserId,
    studentName: sub.studentUser.name,
    studentEmail: sub.studentUser.email,
    files: sub.files,
    // Told to the client rather than left for it to discover by receiving a
    // 503: an assignment declaring maxFileSizeMb is telling the student a file
    // is expected, so the screen needs to explain why it cannot offer one.
    canUploadFiles: config.enableUploads,
    canReview: await canReviewSubmission(user, sub.id),
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
    // Save the text; do NOT touch the status.
    //
    // v1 set status: "DRAFT" unconditionally here, so autosaving after a review
    // demoted a REVIEWED submission back to DRAFT — it vanished from the
    // reviewer's queue while `feedback` and `reviewedAt` survived, leaving the
    // student reading a verdict on text they had since replaced. A save is not
    // a state transition. Getting back to editable is what
    // POST /:publicId/review with returnForRevision is for.
    await db.submission.update({
      where: { id: sub.id },
      data: { text: parsed.data.text },
    });
  }

  return apiOk(res, { saved: true, submitted: Boolean(parsed.data.submit) });
});

/**
 * Create-or-fetch this caller's submission for an assignment.
 *
 * v1 created the row as a side effect of *rendering* the assignment page
 * (`student/assignments/[id]/page.tsx:40`). Ruling C6 forbids that, and React
 * Query would make it far worse than it was in v1: it refetches on mount, on
 * window focus and on reconnect, so a read-time write becomes a write every
 * time the app is tabbed back to.
 *
 * A real upsert on the natural unique key, not v1's read-then-create-then-catch
 * — that pattern leaned entirely on the unique constraint to paper over its own
 * race, and there is no reason to reproduce it when the constraint can do the
 * work directly. PUT because it is idempotent: calling it twice yields the same
 * row, which is what makes it safe on a screen that mounts repeatedly.
 */
submissionsRouter.put("/by-assignment/:assignmentId", async (req, res) => {
  const user = requireUser(req);
  const assignmentId = parseId(req.params.assignmentId);
  if (assignmentId === null) return apiError(res, "bad_request", "Invalid assignment id.", 400);

  // Only a student has a submission of their own; staff have nothing to create.
  if (user.role !== "STUDENT") {
    return apiError(res, "forbidden", "Only a student can start a submission.", 403);
  }

  const assignment = await db.assignment.findFirst({
    where: { id: assignmentId, deletedAt: null },
    select: {
      seasonId: true,
      isAllGroups: true,
      targets: { select: { groupId: true } },
    },
  });
  if (!assignment) return apiError(res, "not_found", "Assignment not found.", 404);

  if (!(await canAccessSeason(user, assignment.seasonId))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }
  // The same targeting rule the assignment reads use, from the same helper —
  // a student must not be able to start a submission on work never set them.
  const targeted = await studentCanSeeAssignment(
    user.userId,
    assignment.seasonId,
    assignment.isAllGroups,
    assignment.targets.map((t) => t.groupId),
  );
  if (!targeted) return apiError(res, "forbidden", "You don't have access to this.", 403);

  const submission = await db.submission.upsert({
    where: { assignmentId_studentUserId: { assignmentId, studentUserId: user.userId } },
    // Empty update: the point is to return the existing row untouched. Writing
    // anything here — even a status — would let a remount overwrite work.
    update: {},
    create: { assignmentId, studentUserId: user.userId, publicId: newPublicId(), status: "DRAFT" },
    select: { publicId: true, status: true },
  });

  return apiOk(res, { publicId: submission.publicId, status: submission.status });
});

/**
 * Record a verdict.
 *
 * v1's reviewSubmissionAction has no ported counterpart, so Phase 2's whole
 * leader surface has been unbuildable. Gated on canReviewSubmission, which is
 * strictly narrower than the read gate rather than derived from it.
 */
submissionsRouter.post("/:publicId/review", async (req, res) => {
  const user = requireUser(req);
  const { publicId } = req.params;

  const sub = await db.submission.findUnique({
    where: { publicId: publicId ?? "" },
    select: { id: true, status: true, studentUserId: true, assignment: { select: { title: true } } },
  });
  if (!sub) return apiError(res, "not_found", "Submission not found.", 404);

  if (!(await canReviewSubmission(user, sub.id))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const parsed = reviewSubmissionRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid review body.", 400);

  // Reviewing something the student never submitted is legal in v1 and stays
  // legal — a reviewer may return an untouched draft for revision — but a
  // DRAFT that has never been submitted cannot be marked REVIEWED, because
  // there is nothing to have reviewed.
  if (sub.status === "DRAFT" && !parsed.data.returnForRevision) {
    return apiError(res, "not_submitted", "That submission has not been submitted yet.", 409);
  }

  const now = new Date();
  await db.submission.update({
    where: { id: sub.id },
    data: {
      feedback: parsed.data.feedback,
      status: parsed.data.returnForRevision ? "RETURNED" : "REVIEWED",
      reviewedAt: now,
    },
  });

  // Best-effort: the student is told, but a mail or notification failure must
  // not report the review itself as failed. Ruling from the notifications
  // spec's D6 — v1 lets a transport error roll back a business write.
  try {
    await createNotificationsBulk([sub.studentUserId], {
      type: "SUBMISSION_REVIEWED",
      title: parsed.data.returnForRevision
        ? `${sub.assignment.title} was returned for revision`
        : `${sub.assignment.title} was reviewed`,
      link: `/student/assignments`,
    });
  } catch {
    // Swallowed deliberately; see above.
  }

  return apiOk(res, { reviewed: true, returnedForRevision: Boolean(parsed.data.returnForRevision) });
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

/**
 * Refuse uploads before multer reads the body.
 *
 * Placement is the whole point. multer buffers the entire file into memory so
 * the per-assignment `maxFileSizeMb` check has something to measure, which
 * means a guard sitting *after* it would still pay the full
 * `MAX_UPLOAD_BYTES` memory cost for a request it was always going to refuse.
 * In front, this answers without reading a byte.
 *
 * 503 rather than 403 or 404: the endpoint exists and the caller is entitled
 * to it — the capability is switched off. A client can reasonably surface
 * "file uploads aren't available yet" and retry later.
 */
const requireUploadsEnabled: RequestHandler = (_req, res, next) => {
  if (!config.enableUploads) {
    apiError(res, "uploads_disabled", "File uploads are temporarily unavailable.", 503);
    return;
  }
  next();
};

submissionsRouter.post(
  "/:publicId/files",
  requireUploadsEnabled,
  upload.single("file"),
  async (req, res) => {
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

    // busboy (under multer) decodes multipart filenames as latin1, so a UTF-8
    // name like "تقرير.txt" arrives mojibake'd and would be stored that way.
    // v1 read the body with the web formData() API, which decodes UTF-8
    // correctly — recovering the raw bytes and re-decoding restores parity.
    // Pure-ASCII names round-trip unchanged.
    const originalName = Buffer.from(file.originalname, "latin1").toString("utf8");

    const key = buildStorageKey({
      bucket: "submissions",
      publicId: newPublicId(),
      originalName,
    });
    const put = await getStorage().put(key, file.buffer, { mime: file.mimetype });

    const created = await db.submissionFile.create({
      data: {
        submissionId: sub.id,
        originalName,
        storagePath: put.path,
        mimeType: file.mimetype || "application/octet-stream",
        sizeBytes: file.size,
      },
      select: { id: true, originalName: true, mimeType: true, sizeBytes: true },
    });

    return apiOk(res, { file: created }, 201);
  },
);

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
    .catch((): void => undefined);
  await db.submissionFile.delete({ where: { id: fileId } });

  return apiOk(res, { deleted: true });
});

/**
 * RFC 6266 Content-Disposition with an RFC 5987 extended parameter.
 *
 * Original filenames are user-supplied and may contain non-ASCII characters,
 * quotes, or backslashes — any of which would break out of the quoted-string
 * and let a caller inject header parameters. The ASCII fallback is sanitised
 * for old clients; `filename*` carries the real name for everyone else.
 */
function contentDisposition(filename: string): string {
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/**
 * Download one submission file.
 *
 * Deliberately NOT a port of v1's GET /api/uploads/[...path], which takes an
 * arbitrary caller-supplied storage path and gates it on nothing but "is
 * logged in" — so any authenticated user who guesses a path can read any
 * student's private submission. That route lives outside /api/v1, so no mobile
 * client contract depends on its behaviour and the exact-parity rule that
 * governs the rest of this port does not apply here.
 */
submissionsRouter.get("/:publicId/files/:fileId", async (req, res) => {
  const user = requireUser(req);
  const { publicId } = req.params;

  const fileId = parseId(req.params.fileId);
  if (fileId === null) return apiError(res, "bad_request", "Invalid fileId.", 400);

  const file = await db.submissionFile.findUnique({
    where: { id: fileId },
    select: {
      storagePath: true,
      originalName: true,
      mimeType: true,
      sizeBytes: true,
      submission: { select: { id: true, publicId: true } },
    },
  });
  // Same cross-check as DELETE: a bare fileId must never reach a file that
  // belongs to a different submission.
  if (!file || file.submission.publicId !== publicId) {
    return apiError(res, "not_found", "File not found.", 404);
  }

  // Reading a file is the same right as reading its submission, so this uses
  // canViewSubmission rather than the author-only check the write paths use:
  // a season admin or the student's group leader must be able to open
  // submitted work, while a peer student must not.
  if (!(await canViewSubmission(user, file.submission.id))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  let stream;
  try {
    stream = await getStorage().get(file.storagePath);
  } catch (err) {
    // A row pointing at a blob that is gone is a 404, not a 500.
    if (err instanceof FileNotFoundError) {
      return apiError(res, "not_found", "File not found.", 404);
    }
    throw err;
  }

  res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
  res.setHeader("Content-Length", String(file.sizeBytes));
  res.setHeader("Content-Disposition", contentDisposition(file.originalName));
  res.setHeader("Cache-Control", "private, max-age=3600");

  // Headers go out only after get() resolved, so a missing blob still produces
  // a clean envelope. Once piping starts the response is committed: a late
  // stream error can only be answered by destroying the socket, never by
  // writing JSON into a half-sent body.
  stream.on("error", () => res.destroy());
  return stream.pipe(res);
});
