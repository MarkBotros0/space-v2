import { Router } from "express";

import { db } from "../db/client";
import { AttendanceStatus } from "../generated/prisma/enums";
import { apiOk, apiError } from "../lib/api-response";
import { flagLowAttendance } from "../lib/attendance-notifications";
import { isCheckInOpen } from "../lib/check-in";
import { createNotificationsBulk } from "../lib/notifications";
import { addWeeksInOrgTime, formatInOrgTime } from "../lib/org-time";
import { parseId } from "../lib/parse-id";
import { attendanceScopeFor, canAccessSeason, canMarkAttendance } from "../lib/permissions";
import { loadAttendanceRoster } from "../lib/queries/sessions";
import { newPublicId } from "../lib/public-id";
import { isAdminOfSeason } from "../lib/rbac";
import { requireAuth, requireUser } from "../middleware/require-auth";
import {
  checkInRequestSchema,
  createSessionRequestSchema,
  deleteSessionRequestSchema,
  saveAttendanceRequestSchema,
  updateSessionRequestSchema,
} from "../../../../packages/shared/src/index";
import type { RecurrenceScope } from "@space/shared";

export const sessionsRouter = Router();

interface SeriesAnchor {
  id: number;
  seasonId: number;
  recurrenceGroupId: string | null;
  startsAt: Date;
}

/**
 * v1's siblingsInScope (recurrence.ts), with ruling C10 applied: the series
 * is ALWAYS fenced to the anchor's season. v1 matched on recurrenceGroupId
 * alone, and duplication cloned that id verbatim, so a series edit or delete
 * reached into another season — data loss gated only by the anchor's admin
 * check. "future" keeps the anchor and everything at or after it.
 */
async function resolveSeriesTargets(
  anchor: SeriesAnchor,
  scope: RecurrenceScope,
): Promise<{ id: number; startsAt: Date }[]> {
  if (scope === "one" || anchor.recurrenceGroupId === null) {
    return [{ id: anchor.id, startsAt: anchor.startsAt }];
  }
  const series = await db.session.findMany({
    where: { recurrenceGroupId: anchor.recurrenceGroupId, seasonId: anchor.seasonId },
    select: { id: true, startsAt: true },
    orderBy: { startsAt: "asc" },
  });
  return scope === "future"
    ? series.filter((s) => s.startsAt.getTime() >= anchor.startsAt.getTime())
    : series;
}

sessionsRouter.use(requireAuth);

// Registered first: "/check-in" is a single-segment literal and would be
// shadowed by any single-segment parameter route (a future POST "/:id") that
// was registered ahead of it. Keep it at the top.
sessionsRouter.post("/check-in", async (req, res) => {
  const user = requireUser(req);

  const parsed = checkInRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Missing check-in token.", 400);

  const session = await db.session.findUnique({
    where: { checkInToken: parsed.data.token },
    select: { id: true, seasonId: true, checkInOpenAt: true, checkInClosedAt: true },
  });
  if (!session) return apiError(res, "invalid_token", "Check-in token is invalid.", 404);

  const now = new Date();
  // Checked separately from isCheckInOpen so `checkInOpenAt` narrows to non-null
  // for the lateness computation below, and so "never opened" stays
  // distinguishable from "opened and since expired".
  if (!session.checkInOpenAt) return apiError(res, "not_open", "Check-in is not open yet.", 409);
  if (!isCheckInOpen(session, now)) return apiError(res, "closed", "Check-in has closed.", 409);

  const enrollment = await db.seasonEnrollment.findUnique({
    where: { studentUserId_seasonId: { studentUserId: user.userId, seasonId: session.seasonId } },
    select: { status: true },
  });
  if (!enrollment || enrollment.status !== "ACTIVE") {
    return apiError(res, "not_enrolled", "You're not enrolled in this season.", 403);
  }

  const existing = await db.attendance.findUnique({
    where: { sessionId_studentUserId: { sessionId: session.id, studentUserId: user.userId } },
    select: { checkedInAt: true, status: true },
  });
  if (existing?.checkedInAt) {
    return apiError(res, "already_checked_in", "Already checked in.", 409);
  }

  const minutesLate = Math.max(
    0,
    Math.floor((now.getTime() - session.checkInOpenAt.getTime()) / 60_000),
  );
  const status: "PRESENT" | "LATE" = minutesLate > 0 ? "LATE" : "PRESENT";

  await db.attendance.upsert({
    where: { sessionId_studentUserId: { sessionId: session.id, studentUserId: user.userId } },
    create: {
      sessionId: session.id,
      studentUserId: user.userId,
      status,
      checkedInAt: now,
      lateMinutes: status === "LATE" ? minutesLate : null,
      markedById: user.userId,
      markedAt: now,
    },
    update: {
      status,
      checkedInAt: now,
      lateMinutes: status === "LATE" ? minutesLate : null,
    },
  });

  return apiOk(res, { status, minutesLate });
});

sessionsRouter.post("/", async (req, res) => {
  const user = requireUser(req);
  const parsed = createSessionRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid session body.", 400);
  const body = parsed.data;

  const season = await db.season.findFirst({
    where: { id: body.seasonId, deletedAt: null },
    select: { id: true },
  });
  if (!season) return apiError(res, "not_found", "Season not found.", 404);
  if (!isAdminOfSeason(user, body.seasonId)) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  // X13 / C2: calendar-week steps in the org zone, so a series keeps its
  // wall-clock time across DST. v1's addDays did the same in the HOST's zone.
  // Spec 03 item 11's season-range check stays un-ported (advisory in v1 too).
  const start = new Date(body.startsAt);
  const dates = Array.from({ length: body.repeatWeeks }, (_, i) => addWeeksInOrgTime(start, i));
  // v1 used nanoid(8); nanoid is ESM-only here (CLAUDE.md). The column is a
  // free string and nothing compares lengths.
  const recurrenceGroupId = body.repeatWeeks > 1 ? newPublicId() : null;

  const created = await db.$transaction(
    dates.map((startsAt) =>
      db.session.create({
        data: {
          seasonId: body.seasonId,
          title: body.title,
          startsAt,
          durationMinutes: body.durationMinutes,
          location: body.location ?? null,
          youtubeUrl: body.youtubeUrl ?? null,
          description: body.description ?? null,
          recurrenceGroupId,
        },
        select: { id: true },
      }),
    ),
  );

  return apiOk(res, { id: created[0]?.id ?? null, recurrenceGroupId }, 201);
});

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
    checkInOpen: isCheckInOpen(session),
    myAttendance,
    canMarkAttendance: await canMarkAttendance(user, id),
    // Ruling C4: the client renders this and never re-derives it. It is the
    // exact predicate check-in-open/-close enforce below — a leader passes
    // canMarkAttendance (attendanceScopeFor) but not this, which is why the
    // console must not key off canMarkAttendance (spec 04 §9 row 2).
    canManageCheckIn: isAdminOfSeason(user, session.seasonId),
  });
});

sessionsRouter.patch("/:id", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid session id.", 400);

  const existing = await db.session.findUnique({
    where: { id },
    select: { id: true, seasonId: true, recurrenceGroupId: true, startsAt: true },
  });
  if (!existing) return apiError(res, "not_found", "Session not found.", 404);
  if (!isAdminOfSeason(user, existing.seasonId)) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const parsed = updateSessionRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid session body.", 400);
  const body = parsed.data;

  const targets = await resolveSeriesTargets(existing, body.scope);
  const newStart = new Date(body.startsAt);
  const delta = newStart.getTime() - existing.startsAt.getTime();
  const fields = {
    title: body.title,
    durationMinutes: body.durationMinutes,
    location: body.location ?? null,
    youtubeUrl: body.youtubeUrl ?? null,
    description: body.description ?? null,
  };

  await db.$transaction(
    targets.map((t) =>
      db.session.update({
        where: { id: t.id },
        // scope "one": the anchor gets newStart (t.startsAt + delta). Series:
        // every sibling shifts by the same delta (v1's semantics, spec 03
        // item 3's anchoring quirk and all). A fixed delta preserves the
        // siblings' existing org-time spacing.
        data: { ...fields, startsAt: new Date(t.startsAt.getTime() + delta) },
      }),
    ),
  );

  if (delta !== 0) {
    const enrolled = await db.seasonEnrollment.findMany({
      where: { seasonId: existing.seasonId, status: "ACTIVE" },
      select: { studentUserId: true },
    });
    try {
      await createNotificationsBulk(
        enrolled.map((e) => e.studentUserId),
        {
          type: "SESSION_RESCHEDULED",
          title: `Session "${body.title}" rescheduled`,
          // Org wall clock (C2), not the host's toLocaleString (v1).
          body: `New time: ${formatInOrgTime(newStart)}`,
          // X1: v1's exact link for this type.
          link: "/student/calendar",
        },
      );
    } catch {
      // Best-effort: a notification failure must not fail the reschedule.
      // Plan 13 replaces this try/catch with its bestEffort wrapper.
    }
  }

  return apiOk(res, { updated: targets.length });
});

sessionsRouter.delete("/:id", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid session id.", 400);

  const existing = await db.session.findUnique({
    where: { id },
    select: { id: true, seasonId: true, recurrenceGroupId: true, startsAt: true },
  });
  if (!existing) return apiError(res, "not_found", "Session not found.", 404);
  if (!isAdminOfSeason(user, existing.seasonId)) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  // express.json() parses DELETE bodies too; the schema's defaults make an
  // absent body and `{}` the same request.
  const parsed = deleteSessionRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) return apiError(res, "bad_request", "Invalid delete body.", 400);

  const targets = await resolveSeriesTargets(existing, parsed.data.scope);
  const targetIds = targets.map((t) => t.id);
  const inTargets = { sessionId: { in: targetIds } };

  const [attendance, progress] = await Promise.all([
    db.attendance.count({ where: inTargets }),
    db.sessionVideoProgress.count({ where: inTargets }),
  ]);
  if ((attendance > 0 || progress > 0) && !parsed.data.force) {
    return apiError(
      res,
      "has_student_records",
      "Attendance or video progress has been recorded; pass force to delete it too.",
      409,
    );
  }

  // Explicit deletes (the FKs cascade anyway) so the transaction states what
  // it destroys. Video questions cascade; assignments/quizzes keep their rows
  // with sessionId set null.
  const [, , removed] = await db.$transaction([
    db.attendance.deleteMany({ where: inTargets }),
    db.sessionVideoProgress.deleteMany({ where: inTargets }),
    db.session.deleteMany({ where: { id: { in: targetIds } } }),
  ]);
  return apiOk(res, { deleted: removed.count });
});

sessionsRouter.get("/:id/attendance", async (req, res) => {
  const user = requireUser(req);
  const sessionId = parseId(req.params.id);
  if (sessionId === null) return apiError(res, "bad_request", "Invalid session id.", 400);

  // attendanceScopeFor, not canAccessSeason: the roster carries every enrolled
  // student's name and email, so reading it is staff-only — and a leader sees
  // only their own groups, which is what the scope narrows.
  const scope = await attendanceScopeFor(user, sessionId);
  if (scope === null) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const roster = await loadAttendanceRoster(
    sessionId,
    scope.kind === "groups" ? scope.groupIds : undefined,
  );
  if (roster === null) return apiError(res, "not_found", "Session not found.", 404);

  return apiOk(res, { roster });
});

sessionsRouter.post("/:id/attendance", async (req, res) => {
  const user = requireUser(req);
  const sessionId = parseId(req.params.id);
  if (sessionId === null) return apiError(res, "bad_request", "Invalid session id.", 400);

  const scope = await attendanceScopeFor(user, sessionId);
  if (scope === null) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const parsed = saveAttendanceRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid attendance entries.", 400);

  // Narrowing the roster on the read only hides the other students; without
  // this, a leader who knows a studentUserId can still write that student's
  // attendance. Membership resolves through SeasonEnrollment.groupId, not
  // GroupStudent — the latter is unique on studentUserId across all seasons,
  // so it cannot answer a season-scoped question.
  if (scope.kind === "groups") {
    const submittedIds = [...new Set(parsed.data.entries.map((e) => e.studentUserId))];
    const inScope = await db.seasonEnrollment.findMany({
      where: {
        seasonId: scope.seasonId,
        groupId: { in: scope.groupIds },
        studentUserId: { in: submittedIds },
      },
      select: { studentUserId: true },
    });
    if (inScope.length !== submittedIds.length) {
      return apiError(res, "forbidden", "You don't lead all of those students.", 403);
    }
  }

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

sessionsRouter.post("/:id/check-in-open", async (req, res) => {
  const user = requireUser(req);
  const sessionId = parseId(req.params.id);
  if (sessionId === null) return apiError(res, "bad_request", "Invalid session id.", 400);

  const session = await db.session.findUnique({
    where: { id: sessionId },
    select: { seasonId: true, checkInToken: true },
  });
  if (!session) return apiError(res, "not_found", "Session not found.", 404);
  // Season admins only — not group leaders. Opening check-in is what makes
  // self-marking possible for a whole season's roster.
  if (!isAdminOfSeason(user, session.seasonId)) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  // Reuse an existing token so reopening does not invalidate a code already
  // displayed to a room.
  const checkInToken = session.checkInToken ?? newPublicId();
  await db.session.update({
    where: { id: sessionId },
    data: { checkInToken, checkInOpenAt: new Date(), checkInClosedAt: null },
  });

  return apiOk(res, { checkInToken });
});

sessionsRouter.post("/:id/check-in-close", async (req, res) => {
  const user = requireUser(req);
  const sessionId = parseId(req.params.id);
  if (sessionId === null) return apiError(res, "bad_request", "Invalid session id.", 400);

  const session = await db.session.findUnique({
    where: { id: sessionId },
    select: { seasonId: true },
  });
  if (!session) return apiError(res, "not_found", "Session not found.", 404);
  if (!isAdminOfSeason(user, session.seasonId)) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  await db.session.update({
    where: { id: sessionId },
    data: { checkInClosedAt: new Date() },
  });

  return apiOk(res, { closed: true });
});
