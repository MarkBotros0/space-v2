import type { Response } from "express";

import { apiError } from "../../lib/api-response";

/** 409 for a student write to a submission that is no longer theirs to change. */
export function submissionLocked(res: Response) {
  return apiError(res, "submission_locked", "This submission has been submitted and can no longer be changed.", 409);
}
