import { z } from "zod";

import { jpcVisibilitySchema } from "./enums";
// Plan 5 created `org-time.ts` (shared wall-clock schemas, ruling C2/X13).
// Consumed here, never redefined — a second `isoDaySchema` in `event.ts` would
// collide on `export *` in `index.ts`.
import { isoDaySchema, wallTimeSchema } from "./org-time";

// Wire shapes — see the note in season.ts on why timestamps are strings.

const jpcEventListItemSchema = z.object({
  id: z.number(),
  title: z.string(),
  /** The stored instant — for ordering only. Never formatted on the device. */
  date: z.string(),
  endDate: z.string().nullable(),
  /** The org-calendar day `date` falls on, computed server-side (ruling X13). */
  dayKey: isoDaySchema,
  endDayKey: isoDaySchema.nullable(),
  /**
   * `(endDayKey ?? dayKey)` is before today on the organisation clock, computed
   * server-side (day granularity; the complement of `upcoming`). The device
   * never compares dates (D23/R75).
   */
  isPast: z.boolean(),
  /** Org wall-clock start, `HH:mm`; null exactly when `allDay`. */
  time: wallTimeSchema.nullable(),
  /**
   * Derived once, server-side, against the organisation timezone (ruling C2,
   * spec 15 §10 item 6). v1 re-ran `getHours() !== 0 || getMinutes() !== 0` in
   * three separate files, each in the *viewer's* zone, against an instant the
   * *server* had composed — so an event authored as all-day stopped reading as
   * all-day for anyone in a different zone.
   */
  allDay: z.boolean(),
  url: z.string().nullable(),
  visibility: jpcVisibilitySchema,
  seasonId: z.number().nullable(),
  /**
   * Present so a SEASON chip can be badged with its season (spec 15 item 12) —
   * v1 styled SEASON identically to ALL, so nothing on the calendar
   * distinguished an organisation-wide event from a season-scoped one (R68).
   */
  seasonCode: z.string().nullable(),
});
export type JpcEventListItem = z.infer<typeof jpcEventListItemSchema>;

/**
 * v1 has no event detail page anywhere (R70), so `description` and the season
 * were write-only data for every non-SUPER user. There is no `imageUrl`:
 * uploads are off and v1's photo path is ungated (spec 15 D7 in this plan).
 * There is no `createdById` either — written by v1, read by nothing, and no
 * reason to ship a user id to every student.
 */
export const jpcEventDetailSchema = jpcEventListItemSchema.extend({
  description: z.string().nullable(),
  seasonTitle: z.string().nullable(),
  /** Whether this caller may edit or delete. Drives the UI, never the gate. */
  canManage: z.boolean(),
});
export type JpcEventDetail = z.infer<typeof jpcEventDetailSchema>;

/**
 * Org wall-clock fields, not an instant (D-15.6, ruling X13). The server
 * composes the instant in `config.orgTimezone`; `time: null` means all-day and
 * is stored as org midnight — there is no `allDay` column.
 */
const eventFields = z.object({
  title: z.string().trim().min(1).max(200),
  day: isoDaySchema,
  time: wallTimeSchema.nullable(),
  endDay: isoDaySchema.nullable(),
  description: z.string().max(2000).nullable(),
  url: z.string().url().nullable(),
  visibility: jpcVisibilitySchema,
  seasonId: z.number().int().positive().nullable(),
});

/** Create: the optional fields default to null. */
const eventWriteBase = eventFields.extend({
  time: eventFields.shape.time.default(null),
  endDay: eventFields.shape.endDay.default(null),
  description: eventFields.shape.description.default(null),
  url: eventFields.shape.url.default(null),
  seasonId: eventFields.shape.seasonId.default(null),
});

/**
 * Exported so the PATCH handler re-runs the same two rules against the merged
 * row. ISO days compare correctly as strings.
 */
function refineEvent(
  v: { day: string; endDay: string | null; visibility: string; seasonId: number | null },
  ctx: z.RefinementCtx,
): void {
  if (v.endDay !== null && v.endDay < v.day) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endDay"],
      message: "End must be on or after the start.",
    });
  }
  if (v.visibility === "SEASON" && v.seasonId == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["seasonId"],
      message: "Choose a season for a season-only event.",
    });
  }
}

export const createJpcEventRequestSchema = eventWriteBase.superRefine(refineEvent);
export type CreateJpcEventBody = z.output<typeof createJpcEventRequestSchema>;

/**
 * A partial, unlike v1 — whose update reused the create schema, so an edit had
 * to resend every field. Both refinements re-apply against the *merged* row in
 * the route (`mergedEventSchema` below), not against the patch, because
 * `{ visibility: "SEASON" }` alone cannot know whether the stored row already
 * has a season. Built from the fields *without* their create defaults: zod 4
 * applies a `.default()` even inside `.partial()`, so a PATCH of `{ title }`
 * would otherwise reset time, description, url and season to null. An omitted
 * field must parse to absent and keep the stored value.
 */
export const updateJpcEventRequestSchema = eventFields.partial();
export type UpdateJpcEventBody = z.output<typeof updateJpcEventRequestSchema>;

/** The PATCH handler parses `{ ...storedAsWallClock, ...patch }` with this. */
export const mergedEventSchema = eventWriteBase.superRefine(refineEvent);

/** Default page size for `GET /events?paged=true`. */
export const EVENT_PAGE_SIZE = 25;

/**
 * The paged list's cursor: `<date epoch ms>_<id>` of the last row served.
 * Events are ordered by date, not id, so an id alone cannot say where the next
 * page starts — and a keyset carrying the date stays valid when the row it
 * names is deleted between pages (an id-only Prisma cursor would come back
 * empty). Opaque to the client: it only ever echoes `nextCursor` back.
 */
export const eventCursorSchema = z.string().regex(/^\d{1,15}_\d{1,10}$/, "Invalid cursor.");

/**
 * The window bounds stored instants and carries no day semantics, so instants
 * are right here. Omitted, that side of the window is open: with neither, every
 * visible event (v1 parity, audit R57 REVERT of D-15.5).
 */
export const eventListQuerySchema = z
  .object({
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    /**
     * Spec 19 §7 (dashboards): the lower bound becomes the start of *today in
     * the org zone* on `(endDate ?? date)` — v1's card filter, moved server-side
     * and out of the host's zone (spec 19 R8, ruling C2/X13). Not combinable
     * with `from`, which would make the bound ambiguous.
     */
    upcoming: z
      .enum(["true", "false"])
      .optional()
      .transform((v) => v === "true"),
    /** Cap on `events` (spec 19 §7: 1–20). `total` is counted before it. */
    limit: z.coerce.number().int().min(1).max(20).optional(),
    /**
     * Owner decision (2026-11): `paged=true` switches to cursor paging, newest
     * first — the SUPER events list. Opt-in, because the calendars need every
     * event in date order and read the unpaged form. Combines with
     * `from`/`to`/`upcoming`; not with `limit`, which is the unpaged cap.
     */
    paged: z
      .enum(["true", "false"])
      .optional()
      .transform((v) => v === "true"),
    /** Page size when paged (default {@link EVENT_PAGE_SIZE}). */
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    /** The previous page's `nextCursor`, echoed back verbatim. */
    cursor: eventCursorSchema.optional(),
  })
  .refine((q) => !(q.upcoming && q.from !== undefined), {
    message: "Use either upcoming or from, not both.",
    path: ["from"],
  })
  .refine((q) => q.paged || (q.cursor === undefined && q.pageSize === undefined), {
    message: "cursor and pageSize need paged=true.",
    path: ["paged"],
  })
  .refine((q) => !(q.paged && q.limit !== undefined), {
    message: "Use pageSize, not limit, with paged=true.",
    path: ["limit"],
  });

/**
 * `GET /events`. `total` is the number of visible events in the window
 * *before* `limit` — the SUPER dashboard tile reads it from the same response
 * the card renders, so the tile and the card cannot disagree (spec 19 D19/R15).
 */
export const jpcEventListResponseSchema = z.object({
  events: z.array(jpcEventListItemSchema),
  total: z.number().int().min(0),
});
export type JpcEventListResponse = z.infer<typeof jpcEventListResponseSchema>;

/**
 * `GET /events?paged=true`: newest first. `total` counts every visible event
 * in the window (not just this page); `nextCursor` is null on the last page.
 */
export const jpcEventPageResponseSchema = jpcEventListResponseSchema.extend({
  nextCursor: eventCursorSchema.nullable(),
});
export type JpcEventPageResponse = z.infer<typeof jpcEventPageResponseSchema>;

export const deleteJpcEventResponseSchema = z.object({ deleted: z.literal(true) });
