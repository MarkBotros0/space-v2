import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, apiError } from "../../lib/api-response";
import { bestEffort } from "../../lib/best-effort";
import { createNotificationsBulk } from "../../lib/notifications";
import { addWeeksInOrgTime, formatInOrgTime, orgDayKey, orgWallTime } from "../../lib/org-time";
import { parseId } from "../../lib/parse-id";
import { newPublicId } from "../../lib/public-id";
import { isAdminOfSeason } from "../../lib/rbac";
import { requireUser } from "../../middleware/require-auth";
import {
  createSessionRequestSchema,
  deleteSessionRequestSchema,
  recurrenceScopeSchema,
  updateSessionRequestSchema,
} from "../../../../../packages/shared/src/index";
import { forbidden } from "../respond";
import { resolveSeriesTargets, sessionStartFrom, type SeriesAnchor } from "./series";

export async function createSession(req: Request, res: Response) {
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
    return forbidden(res);
  }

  // X13 / C2: calendar-week steps in the org zone, so a series keeps its
  // wall-clock time across DST. v1's addDays did the same in the HOST's zone.
  // Spec 03 item 11's season-range check stays un-ported (advisory in v1 too).
  const start = sessionStartFrom(body);
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
}

/**
 * The shared preamble of the three series-scoped routes (edit, delete, preview):
 * a valid id (400), an existing session (404), a season admin (403) — in that
 * order. Returns the series anchor, or null once it has answered the request.
 */
async function loadAnchorForSeasonAdmin(req: Request, res: Response): Promise<SeriesAnchor | null> {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) {
    apiError(res, "bad_request", "Invalid session id.", 400);
    return null;
  }

  const anchor = await db.session.findUnique({
    where: { id },
    select: { id: true, seasonId: true, recurrenceGroupId: true, startsAt: true },
  });
  if (!anchor) {
    apiError(res, "not_found", "Session not found.", 404);
    return null;
  }
  if (!isAdminOfSeason(user, anchor.seasonId)) {
    forbidden(res);
    return null;
  }
  return anchor;
}

export async function updateSession(req: Request, res: Response) {
  const existing = await loadAnchorForSeasonAdmin(req, res);
  if (!existing) return undefined;

  const parsed = updateSessionRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid session body.", 400);
  const body = parsed.data;

  const targets = await resolveSeriesTargets(existing, body.scope);
  const newStart = sessionStartFrom(body);
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
    // Best-effort: the reschedule has committed; a notification failure must
    // not report it as failed (spec D6, R75) — and bestEffort logs (R21).
    await bestEffort("notify:SESSION_RESCHEDULED", () =>
      createNotificationsBulk(
        enrolled.map((e) => e.studentUserId),
        {
          type: "SESSION_RESCHEDULED",
          title: `Session "${body.title}" rescheduled`,
          // Org wall clock (C2), not the host's toLocaleString (v1).
          body: `New time: ${formatInOrgTime(newStart)}`,
          // X1: v1's exact link for this type.
          link: "/student/calendar",
        },
      ),
    );
  }

  return apiOk(res, { updated: targets.length });
}

export async function deleteSession(req: Request, res: Response) {
  const existing = await loadAnchorForSeasonAdmin(req, res);
  if (!existing) return undefined;

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
}

/**
 * What a scoped edit/delete would touch (spec 03 §7, Plan 6 D-16.8). Uses
 * resolveSeriesTargets — the SAME season-fenced selection PATCH and DELETE
 * use — so the preview cannot disagree with the write. A GET: writes nothing (C6).
 */
export async function previewSeries(req: Request, res: Response) {
  const anchor = await loadAnchorForSeasonAdmin(req, res);
  if (!anchor) return undefined;

  const scope = recurrenceScopeSchema.safeParse(req.query.scope);
  if (!scope.success) return apiError(res, "bad_request", "Pass scope=one|future|all.", 400);

  const targetIds = (await resolveSeriesTargets(anchor, scope.data)).map((t) => t.id);
  const inTargets = { sessionId: { in: targetIds } };
  const [rows, attendanceCount, videoProgressCount] = await Promise.all([
    db.session.findMany({
      where: { id: { in: targetIds } },
      orderBy: { startsAt: "asc" },
      select: { id: true, title: true, startsAt: true, _count: { select: { attendance: true } } },
    }),
    db.attendance.count({ where: inTargets }),
    db.sessionVideoProgress.count({ where: inTargets }),
  ]);

  return apiOk(res, {
    scope: scope.data,
    sessions: rows.map((r) => ({
      id: r.id,
      title: r.title,
      startsAt: r.startsAt,
      dayKey: orgDayKey(r.startsAt),
      startTime: orgWallTime(r.startsAt),
      isAnchor: r.id === anchor.id,
      attendanceCount: r._count.attendance,
    })),
    attendanceCount,
    videoProgressCount,
  });
}
