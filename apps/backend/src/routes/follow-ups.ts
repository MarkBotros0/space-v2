import { Router } from "express";

import { db } from "../db/client";
import { apiOk, apiError } from "../lib/api-response";
import { createFollowUp, listFollowUps, toFollowUp } from "../lib/follow-ups";
import { parseId } from "../lib/parse-id";
import { isUniqueViolation as isPrismaUniqueViolation } from "../lib/prisma-errors";
import { requireAuth, requireRole } from "../middleware/require-auth";
import { createFollowUpRequestSchema } from "../../../../packages/shared/src/index";
import { isMentor } from "../lib/rbac";
import { idParam } from "../lib/http/params";
import { notFound } from "../lib/http/not-found";
import { parseOr400 } from "../lib/http/validate";
import { liveUser } from "../lib/db/live";

/**
 * A mentor's follow-ups (owner, 2026-11-07). Two routers on two prefixes,
 * mounted after the domains whose prefixes they share, as the notes routers are:
 * - `/follow-ups`: the mentor's own list and Mark done;
 * - `/students/:id/follow-ups`: flag a student (studentsRouter has no such path).
 * The reminder itself runs on the scheduler (lib/scheduler), not here.
 * MENTOR only, and a mentor touches only their own.
 */
export const followUpsRouter = Router();
export const studentFollowUpsRouter = Router();

followUpsRouter.get("/", requireAuth, async (req, res) => {
  const user = requireRole(req, res, isMentor);
  if (!user) return;
  return apiOk(res, { followUps: await listFollowUps(user.userId) });
});

followUpsRouter.post("/:id/done", requireAuth, async (req, res) => {
  const user = requireRole(req, res, isMentor);
  if (!user) return;
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid follow-up id.", 400);

  const row = await db.mentorFollowUp.findFirst({
    where: { id, mentorUserId: user.userId },
    select: { id: true, doneAt: true },
  });
  if (!row) return notFound(res, "Follow-up");
  // Done twice is still done: answer with the row as it stands.
  const updated = await db.mentorFollowUp.update({
    where: { id },
    data: row.doneAt ? {} : { doneAt: new Date() },
    select: {
      id: true,
      studentUserId: true,
      studentUser: { select: { name: true } },
      reason: true,
      createdAt: true,
      dueAt: true,
      remindedAt: true,
      doneAt: true,
    },
  });
  return apiOk(res, toFollowUp(updated));
});

studentFollowUpsRouter.post("/:id/follow-ups", requireAuth, async (req, res) => {
  const user = requireRole(req, res, isMentor);
  if (!user) return;
  const studentUserId = idParam(res, req.params.id, "student");
  if (studentUserId === null) return;
  const parsed = parseOr400(createFollowUpRequestSchema, req.body ?? {}, res, "Invalid follow-up.");
  if (parsed === null) return;

  const student = await db.user.findFirst({
    where: { id: studentUserId, role: "STUDENT", ...liveUser },
    select: { id: true },
  });
  if (!student) return notFound(res, "Student");

  try {
    return apiOk(res, await createFollowUp(user.userId, studentUserId, parsed.reason), 201);
  } catch (err) {
    // The partial unique index: one open follow-up per mentor and student.
    if (isPrismaUniqueViolation(err)) {
      return apiError(res, "already_following_up", "You're already following up with them.", 409);
    }
    throw err;
  }
});
