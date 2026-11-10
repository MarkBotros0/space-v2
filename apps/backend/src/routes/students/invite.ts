import type { Request, Response } from "express";

import { db } from "../../db/client";
import { forbidden } from "../../lib/api-response";
import { canEditStudent } from "../../lib/permissions";
import { requireUser } from "../../middleware/require-auth";
import { answerResend } from "../users/invites";
import { idParam } from "../../lib/http/params";
import { notFound } from "../../lib/http/not-found";
import { liveUser } from "../../lib/db/live";

/**
 * POST /students/:id/invite: send a student who hasn't set up their account a
 * fresh invite (owner, 2026-11-07: admins and supers resend the invitation).
 * A Super, or an admin of a season the student is live in (canEditStudent's
 * rule); never the student themselves. The sending, the refusals and the
 * answer are the Super's `POST /users/:id/invite`, shared through answerResend.
 */
export async function resendStudentInvite(req: Request, res: Response) {
  const user = requireUser(req);
  const id = idParam(res, req.params.id, "student");
  if (id === null) return;

  const student = await db.user.findFirst({
    where: { id, role: "STUDENT", ...liveUser },
    select: { id: true },
  });
  if (!student) return notFound(res, "Student");
  if (user.userId === id || !(await canEditStudent(user, id))) return forbidden(res);

  return answerResend(res, id, user.userId);
}
