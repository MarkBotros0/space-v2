import { Router } from "express";

import { db } from "../db/client";
import { AttendanceStatus } from "../generated/prisma/enums";
import { apiOk, apiError } from "../lib/api-response";
import { flagLowAttendance } from "../lib/attendance-notifications";
import { parseId } from "../lib/parse-id";
import { canAccessSeason, canMarkAttendance } from "../lib/permissions";
import { loadAttendanceRoster } from "../lib/queries/sessions";
import { requireAuth, requireUser } from "../middleware/require-auth";
import { saveAttendanceRequestSchema } from "../../../../packages/shared/src/index";

export const sessionsRouter = Router();

sessionsRouter.use(requireAuth);

sessionsRouter.get("/:id", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid session id.", 400);

  // checkInToken is deliberately absent from this select — see
  // lib/queries/sessions.ts. Detail is readable by every season member, so
  // including it here would hand it to students.
  const session = await db.session.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      startsAt: true,
      durationMinutes: true,
      location: true,
      youtubeUrl: true,
      recurrenceGroupId: true,
      seasonId: true,
      season: { select: { code: true, title: true } },
      checkInOpenAt: true,
      checkInClosedAt: true,
    },
  });
  if (!session) return apiError(res, "not_found", "Session not found.", 404);

  if (!(await canAccessSeason(user, session.seasonId))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const myAttendance =
    user.role === "STUDENT"
      ? await db.attendance.findUnique({
          where: { sessionId_studentUserId: { sessionId: id, studentUserId: user.userId } },
          select: { status: true, notes: true, lateMinutes: true, checkedInAt: true },
        })
      : null;

  return apiOk(res, {
    id: session.id,
    title: session.title,
    description: session.description,
    startsAt: session.startsAt,
    durationMinutes: session.durationMinutes,
    location: session.location,
    youtubeUrl: session.youtubeUrl,
    recurrenceGroupId: session.recurrenceGroupId,
    seasonId: session.seasonId,
    seasonCode: session.season.code,
    seasonTitle: session.season.title,
    checkInOpen: Boolean(session.checkInOpenAt) && !session.checkInClosedAt,
    myAttendance,
    canMarkAttendance: await canMarkAttendance(user, id),
  });
});

sessionsRouter.get("/:id/attendance", async (req, res) => {
  const user = requireUser(req);
  const sessionId = parseId(req.params.id);
  if (sessionId === null) return apiError(res, "bad_request", "Invalid session id.", 400);

  // canMarkAttendance, not canAccessSeason: the roster carries every enrolled
  // student's name and email, so reading it is staff-only.
  if (!(await canMarkAttendance(user, sessionId))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const roster = await loadAttendanceRoster(sessionId);
  if (roster === null) return apiError(res, "not_found", "Session not found.", 404);

  return apiOk(res, { roster });
});

sessionsRouter.post("/:id/attendance", async (req, res) => {
  const user = requireUser(req);
  const sessionId = parseId(req.params.id);
  if (sessionId === null) return apiError(res, "bad_request", "Invalid session id.", 400);

  if (!(await canMarkAttendance(user, sessionId))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const parsed = saveAttendanceRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid attendance entries.", 400);

  // One transaction so a partially-saved roster is impossible: either every
  // student in this batch is marked, or none is.
  await db.$transaction(
    parsed.data.entries.map((e) =>
      db.attendance.upsert({
        where: { sessionId_studentUserId: { sessionId, studentUserId: e.studentUserId } },
        update: {
          status: e.status,
          notes: e.notes ?? null,
          // Lateness is meaningless unless the status is LATE, and leaving a
          // stale value behind would corrupt attendance reporting.
          lateMinutes: e.status === AttendanceStatus.LATE ? (e.lateMinutes ?? null) : null,
          markedById: user.userId,
          markedAt: new Date(),
        },
        create: {
          sessionId,
          studentUserId: e.studentUserId,
          status: e.status,
          notes: e.notes ?? null,
          lateMinutes: e.status === AttendanceStatus.LATE ? (e.lateMinutes ?? null) : null,
          markedById: user.userId,
        },
      }),
    ),
  );

  await flagLowAttendance(sessionId, parsed.data.entries);

  return apiOk(res, { saved: parsed.data.entries.length });
});
