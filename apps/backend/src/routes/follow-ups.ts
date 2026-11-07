import { Router } from "express";

import { db } from "../db/client";
import { apiOk, apiError } from "../lib/api-response";
import { config } from "../lib/config";
import {
  createFollowUp,
  isCronAuthorized,
  listFollowUps,
  sendDueFollowUpReminders,
  toFollowUp,
} from "../lib/follow-ups";
import { parseId } from "../lib/parse-id";
import { isUniqueViolation as isPrismaUniqueViolation } from "../lib/prisma-errors";
import { requireAuth, requireUser } from "../middleware/require-auth";
import { createFollowUpRequestSchema } from "../../../../packages/shared/src/index";
import { forbidden } from "./respond";

/**
 * A mentor's follow-ups (owner, 2026-11-07). Three routers on three prefixes,
 * mounted after the domains whose prefixes they share, as the notes routers are:
 * - `/follow-ups`: the mentor's own list and Mark done;
 * - `/students/:id/follow-ups`: flag a student (studentsRouter has no such path);
 * - `/internal/follow-ups/remind`: Vercel Cron's daily reminder, behind CRON_SECRET.
 * MENTOR only, and a mentor touches only their own.
 */
export const followUpsRouter = Router();
export const studentFollowUpsRouter = Router();
export const internalRouter = Router();

followUpsRouter.get("/", requireAuth, async (req, res) => {
  const user = requireUser(req);
  if (user.role !== "MENTOR") return forbidden(res);
  return apiOk(res, { followUps: await listFollowUps(user.userId) });
});

followUpsRouter.post("/:id/done", requireAuth, async (req, res) => {
  const user = requireUser(req);
  if (user.role !== "MENTOR") return forbidden(res);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid follow-up id.", 400);

  const row = await db.mentorFollowUp.findFirst({
    where: { id, mentorUserId: user.userId },
    select: { id: true, doneAt: true },
  });
  if (!row) return apiError(res, "not_found", "Follow-up not found.", 404);
  // Done twice is still done: answer with the row as it stands.
  const updated = await db.mentorFollowUp.update({
    where: { id },
    data: row.doneAt ? {} : { doneAt: new Date() },
    select: {
      id: true, studentUserId: true, studentUser: { select: { name: true } }, reason: true,
      createdAt: true, dueAt: true, remindedAt: true, doneAt: true,
    },
  });
  return apiOk(res, toFollowUp(updated));
});

studentFollowUpsRouter.post("/:id/follow-ups", requireAuth, async (req, res) => {
  const user = requireUser(req);
  if (user.role !== "MENTOR") return forbidden(res);
  const studentUserId = parseId(req.params.id);
  if (studentUserId === null) return apiError(res, "bad_request", "Invalid student id.", 400);
  const parsed = createFollowUpRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) return apiError(res, "bad_request", "Invalid follow-up.", 400);

  const student = await db.user.findFirst({
    where: { id: studentUserId, role: "STUDENT", deletedAt: null },
    select: { id: true },
  });
  if (!student) return apiError(res, "not_found", "Student not found.", 404);

  try {
    return apiOk(res, await createFollowUp(user.userId, studentUserId, parsed.data.reason), 201);
  } catch (err) {
    // The partial unique index: one open follow-up per mentor and student.
    if (isPrismaUniqueViolation(err)) {
      return apiError(res, "already_following_up", "You're already following up with them.", 409);
    }
    throw err;
  }
});

/** Vercel Cron calls this daily with GET (vercel.json). A 404 while CRON_SECRET is unset. */
internalRouter.get("/follow-ups/remind", async (req, res) => {
  const secret = config.cronSecret;
  if (!secret) return apiError(res, "not_found", "Not found.", 404);
  if (!isCronAuthorized(req.get("authorization"), secret)) {
    return apiError(res, "unauthorized", "Not authorized.", 401);
  }
  return apiOk(res, { sent: await sendDueFollowUpReminders() });
});
