import { Router } from "express";

import { requireAuth } from "../../middleware/require-auth";
import { getSubmission } from "./detail";
import {
  deleteSubmissionFile,
  downloadSubmissionFile,
  requireUploadsEnabled,
  upload,
  uploadSubmissionFile,
} from "./files";
import { listSubmissionQueue } from "./queue";
import { reviewSubmission, startSubmission, updateSubmission } from "./writes";

/**
 * Submissions: the reviewer queue, the student's own submission (create-or-
 * fetch, save, submit), the review verdict, and attached files. This file is
 * the route table, in registration order; handlers live beside it.
 */
export const submissionsRouter = Router();

submissionsRouter.use(requireAuth);

submissionsRouter.get("/", listSubmissionQueue);
submissionsRouter.get("/:publicId", getSubmission);
submissionsRouter.patch("/:publicId", updateSubmission);
submissionsRouter.put("/by-assignment/:assignmentId", startSubmission);
submissionsRouter.post("/:publicId/review", reviewSubmission);

// requireUploadsEnabled MUST stay in front of upload.single("file"): multer
// buffers the whole body (up to MAX_UPLOAD_BYTES) before the handler runs, so
// a guard behind it would pay that memory cost for a request it always refuses.
submissionsRouter.post(
  "/:publicId/files",
  requireUploadsEnabled,
  upload.single("file"),
  uploadSubmissionFile,
);
submissionsRouter.delete("/:publicId/files", deleteSubmissionFile);
submissionsRouter.get("/:publicId/files/:fileId", downloadSubmissionFile);
