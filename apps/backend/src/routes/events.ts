import { Router } from "express";

import { db } from "../db/client";
import type { JpcVisibility } from "../generated/prisma/enums";
import { apiError, apiOk } from "../lib/api-response";
import {
  isOrgMidnight,
  orgDayKey,
  orgWallClockToInstant,
  orgWallTime,
} from "../lib/org-time";
import { parseId } from "../lib/parse-id";
import {
  EVENT_PAGE_ORDER,
  encodeEventCursor,
  eventCursorFilter,
  eventVisibilityFilter,
  eventWindowFilter,
} from "../lib/queries/events";
import { isSuper } from "../lib/rbac";
import { requireAuth, requireUser } from "../middleware/require-auth";
import {
  EVENT_PAGE_SIZE,
  createJpcEventRequestSchema,
  eventListQuerySchema,
  mergedEventSchema,
  updateJpcEventRequestSchema,
} from "../../../../packages/shared/src/index";

/**
 * Domain 15. Mounted at /api/v1/events, a prefix this router owns exclusively,
 * so router-wide auth is permitted (ruling X5).
 */
export const eventsRouter = Router();
eventsRouter.use(requireAuth);

const LIST_SELECT = {
  id: true,
  title: true,
  date: true,
  endDate: true,
  url: true,
  visibility: true,
  seasonId: true,
  season: { select: { code: true, title: true } },
} as const;

const DETAIL_SELECT = { ...LIST_SELECT, description: true } as const;

// `imagePath` is deliberately absent from every select in this file. Uploads are
// off (ENABLE_UPLOADS defaults false) and v1 serves event photos through
// /api/uploads/[...path], which gates on nothing but "is logged in" — so any
// authenticated user who guesses a key can fetch a photo attached to an event
// they cannot see (spec 15 R32). The storage key never crosses this wire.

interface ListRow {
  id: number;
  title: string;
  date: Date;
  endDate: Date | null;
  url: string | null;
  visibility: JpcVisibility;
  seasonId: number | null;
  season: { code: string; title: string } | null;
}

function toListItem(row: ListRow) {
  // Every day and time on the wire is computed here, in config.orgTimezone
  // (ruling X13) — the client buckets and labels by these strings and never
  // turns `date` into a day itself.
  const allDay = isOrgMidnight(row.date);
  const dayKey = orgDayKey(row.date);
  const endDayKey = row.endDate ? orgDayKey(row.endDate) : null;
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    endDate: row.endDate,
    dayKey,
    endDayKey,
    // The exact complement of the `upcoming` filter: day granularity, org
    // clock. The device never compares dates (D23/R75). Not a second
    // parameter: this is passed straight to `.map`.
    isPast: (endDayKey ?? dayKey) < orgDayKey(new Date()),
    time: allDay ? null : orgWallTime(row.date),
    allDay,
    url: row.url,
    visibility: row.visibility,
    seasonId: row.seasonId,
    seasonCode: row.season?.code ?? null,
  };
}

function toDetail(row: ListRow & { description: string | null }, canManage: boolean) {
  return {
    ...toListItem(row),
    description: row.description,
    seasonTitle: row.season?.title ?? null,
    canManage,
  };
}

/** A season an event may be attached to: exists and is not soft-deleted. */
async function isLiveSeason(seasonId: number): Promise<boolean> {
  const season = await db.season.findFirst({ where: { id: seasonId, deletedAt: null }, select: { id: true } });
  return season !== null;
}

eventsRouter.get("/", async (req, res) => {
  const user = requireUser(req);
  const parsed = eventListQuerySchema.safeParse(req.query);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid query.", 400);
  const { from: fromRaw, to: toRaw, upcoming, limit, paged, pageSize, cursor } = parsed.data;

  // v1 parity (audit 2026-cutover, v1-parity-classification 15-events R57
  // REVERT): with no from/to, every visible event, ordered by date — v1's
  // listJpcEvents had no window and no limit, and a default -30d..+365d window
  // hid older and far-future events from the SUPER managing them. `from`/`to`
  // remain optional narrowing; `upcoming` is v1's dashboard-card filter
  // ((endDate ?? date) >= start of today, org zone) moved server-side.
  const to = toRaw ? new Date(toRaw) : null;
  const from = upcoming
    ? orgWallClockToInstant(orgDayKey(new Date()), null)
    : fromRaw
      ? new Date(fromRaw)
      : null;

  const where = { AND: [await eventVisibilityFilter(user), eventWindowFilter(from, to)] };

  if (paged) {
    // Owner decision: the SUPER list pages, newest first. Opt-in — the
    // calendars read the unpaged form below and need every event.
    const size = pageSize ?? EVENT_PAGE_SIZE;
    const [pageRows, total] = await Promise.all([
      db.jpcEvent.findMany({
        where: cursor ? { AND: [where, eventCursorFilter(cursor)] } : where,
        orderBy: EVENT_PAGE_ORDER,
        take: size + 1,
        select: LIST_SELECT,
      }),
      // The window's total, not the remainder after the cursor.
      db.jpcEvent.count({ where }),
    ]);
    const page = pageRows.slice(0, size);
    const last = page[page.length - 1];
    const nextCursor = pageRows.length > size && last ? encodeEventCursor(last) : null;
    return apiOk(res, { events: page.map(toListItem), total, nextCursor });
  }

  const [rows, total] = await Promise.all([
    db.jpcEvent.findMany({
      where,
      orderBy: [{ date: "asc" }, { id: "asc" }],
      ...(limit ? { take: limit } : {}),
      select: LIST_SELECT,
    }),
    db.jpcEvent.count({ where }),
  ]);
  return apiOk(res, { events: rows.map(toListItem), total });
});

eventsRouter.get("/:id", async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid event id.", 400);

  const row = await db.jpcEvent.findFirst({
    where: { AND: [{ id }, await eventVisibilityFilter(user)] },
    select: DETAIL_SELECT,
  });
  // 404, not 403: a caller cannot tell an event they may not see from one that
  // does not exist.
  if (!row) return apiError(res, "not_found", "Event not found.", 404);
  return apiOk(res, toDetail(row, isSuper(user)));
});

eventsRouter.post("/", async (req, res) => {
  const user = requireUser(req);
  // Gate before parse. v1 enforces this inside the action rather than by page
  // placement (R3); the envelope replaces its bare thrown Error (R2).
  if (!isSuper(user)) return apiError(res, "forbidden", "Only a super admin can manage events.", 403);

  const parsed = createJpcEventRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid event.", 400);
  const body = parsed.data;

  // v1 force-nulls the season whenever visibility is not SEASON (R13); kept,
  // because a detached seasonId on an ALL event is unreachable data.
  const seasonId = body.visibility === "SEASON" ? body.seasonId : null;
  if (seasonId !== null && !(await isLiveSeason(seasonId))) {
    return apiError(res, "bad_request", "Season not found.", 400);
  }

  const created = await db.jpcEvent.create({
    data: {
      title: body.title,
      description: body.description,
      url: body.url,
      visibility: body.visibility,
      seasonId,
      // The body carries wall-clock fields and no zone; the org zone is the only
      // one that can apply. time === null → org midnight, v1's all-day encoding.
      date: orgWallClockToInstant(body.day, body.time),
      // An end is a day, not an instant: stored at org midnight of that day.
      endDate: body.endDay ? orgWallClockToInstant(body.endDay, null) : null,
      createdById: user.userId,
    },
    select: DETAIL_SELECT,
  });
  return apiOk(res, toDetail(created, true), 201);
});

eventsRouter.patch("/:id", async (req, res) => {
  const user = requireUser(req);
  if (!isSuper(user)) return apiError(res, "forbidden", "Only a super admin can manage events.", 403);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid event id.", 400);

  const row = await db.jpcEvent.findUnique({ where: { id }, select: DETAIL_SELECT });
  if (!row) return apiError(res, "not_found", "Event not found.", 404);

  const parsed = updateJpcEventRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid event.", 400);

  const stored = {
    title: row.title,
    day: orgDayKey(row.date),
    time: isOrgMidnight(row.date) ? null : orgWallTime(row.date),
    endDay: row.endDate ? orgDayKey(row.endDate) : null,
    description: row.description,
    url: row.url,
    visibility: row.visibility,
    seasonId: row.seasonId,
  };
  // Drop undefined keys so an omitted field keeps its stored value.
  const patch = Object.fromEntries(
    Object.entries(parsed.data).filter(([, v]) => v !== undefined),
  );
  const merged = mergedEventSchema.safeParse({ ...stored, ...patch });
  if (!merged.success) return apiError(res, "bad_request", "Invalid event.", 400);
  const m = merged.data;

  const seasonId = m.visibility === "SEASON" ? m.seasonId : null;
  // Only a season being newly attached must be live: an event already on a
  // season that was deleted afterwards stays editable (title, date, ...)
  // without first being moved.
  if (seasonId !== null && seasonId !== row.seasonId && !(await isLiveSeason(seasonId))) {
    return apiError(res, "bad_request", "Season not found.", 400);
  }

  // `createdById` is untouched: it means "who first authored this". JpcEvent
  // has no `updatedById` column, so the last editor is not recorded (spec 15 R34).
  const updated = await db.jpcEvent.update({
    where: { id },
    data: {
      title: m.title,
      description: m.description,
      url: m.url,
      visibility: m.visibility,
      seasonId,
      date: orgWallClockToInstant(m.day, m.time),
      endDate: m.endDay ? orgWallClockToInstant(m.endDay, null) : null,
    },
    select: DETAIL_SELECT,
  });
  return apiOk(res, toDetail(updated, true));
});

eventsRouter.delete("/:id", async (req, res) => {
  const user = requireUser(req);
  if (!isSuper(user)) return apiError(res, "forbidden", "Only a super admin can manage events.", 403);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid event id.", 400);

  // v1 does not read first, so a stale id throws P2025 at the client (R36).
  const row = await db.jpcEvent.findUnique({ where: { id }, select: { id: true } });
  if (!row) return apiError(res, "not_found", "Event not found.", 404);

  // Hard delete: this model has no `deletedAt` and adding one is a migration.
  await db.jpcEvent.delete({ where: { id } });
  return apiOk(res, { deleted: true as const });
});
