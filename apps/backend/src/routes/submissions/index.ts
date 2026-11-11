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
import { handInSubmission, reviewSubmission } from "./writes";

/**
 * Essays, addressed by the essay work's publicId: the reviewer queue (one item
 * per student per essay), one essay's detail, the hand-in of a returned essay,
 * the review verdict, and attached files. A draft is saved under the
 * assignment (PUT /assignments/:id/parts/:partId/essay). This file is the
 * route table, in registration order; handlers live beside it.
 */
export const submissionsRouter = Router();

submissionsRouter.use(requireAuth);

submissionsRouter.get("/", listSubmissionQueue);
submissionsRouter.get("/:publicId", getSubmission);
submissionsRouter.post("/:publicId/hand-in", handInSubmission);
submissionsRouter.post("/:publicId/review", reviewSubmission);

// requireUploadsEnabled MUST stay in front of upload.single("file"): multer
// buffers the whole body (up to MAX_UPLOAD_BYTES) before the handler runs, so
// a guard behind it would pay that memory cost for a request it always refuses.
submissionsRouter.post("/:publicId/files", requireUploadsEnabled, upload.single("file"), uploadSubmissionFile);
submissionsRouter.delete("/:publicId/files", deleteSubmissionFile);
submissionsRouter.get("/:publicId/files/:fileId", downloadSubmissionFile);
