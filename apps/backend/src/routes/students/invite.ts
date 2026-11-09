import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiError, forbidden } from "../../lib/api-response";
import { parseId } from "../../lib/parse-id";
import { canEditStudent } from "../../lib/permissions";
import { requireUser } from "../../middleware/require-auth";
import { answerResend } from "../users/invites";

/**
 * POST /students/:id/invite: send a student who hasn't set up their account a
 * fresh invite (owner, 2026-11-07: admins and supers resend the invitation).
 * A Super, or an admin of a season the student is live in (canEditStudent's
 * rule); never the student themselves. The sending, the refusals and the
 * answer are the Super's `POST /users/:id/invite`, shared through answerResend.
 */
export async function resendStudentInvite(req: Request, res: Response) {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid student id.", 400);

  const student = await db.user.findFirst({
    where: { id, role: "STUDENT", deletedAt: null },
    select: { id: true },
  });
  if (!student) return apiError(res, "not_found", "Student not found.", 404);
  if (user.userId === id || !(await canEditStudent(user, id))) return forbidden(res);

  return answerResend(res, id, user.userId);
}
