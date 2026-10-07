import { z } from "zod";

import { seasonStatusSchema } from "./enums";
import { isoDaySchema } from "./org-time";

// Response shapes for the mobile client.
//
// Every timestamp is `string`, not `Date`: the backend hands Prisma Date objects
// to res.json(), which serialises them to ISO-8601. These schemas describe
// what arrives over the wire, so only the client should parse with them — the
// backend's own objects hold Dates and would not typecheck against these.

export const seasonListItemSchema = z.object({
  id: z.number(), code: z.string(), title: z.string(), program: z.string(),
  year: z.number(), status: seasonStatusSchema,
  startDate: z.string(), endDate: z.string(),
});
export type SeasonListItem = z.infer<typeof seasonListItemSchema>;

export const seasonDetailGroupSchema = z.object({
  id: z.number(), name: z.string(), studentCount: z.number(),
  leaderNames: z.array(z.string()),
});
export type SeasonDetailGroup = z.infer<typeof seasonDetailGroupSchema>;

export const seasonDetailSchema = seasonListItemSchema.extend({
  description: z.string().nullable(),
  sessionCount: z.number(),
  studentCount: z.number(),
  /** Needed by the SUPER edit form: its PATCH is a full body whose budget fields default (D-16.3). */
  absenceBudgetMinutes: z.number().int(),
  absenceWeightMinutes: z.number().int(),
  /** isAdminOfSeason for the caller (C4) — drives the roster / new-group / new-session actions. */
  canAdminister: z.boolean(),
  groups: z.array(seasonDetailGroupSchema),
});
export type SeasonDetail = z.infer<typeof seasonDetailSchema>;

// ---- Season code: v1's src/lib/slug.ts, ported verbatim (spec 02 R3–R4) ----

export const SEASON_CODE_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export function slugifySeasonCode(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/** v1 validated the *slug*: 2–40 chars (season-actions.ts:23) and the format regex (slug.ts:13). */
export function isValidSeasonCode(code: string): boolean {
  return code.length >= 2 && code.length <= 40 && SEASON_CODE_RE.test(code);
}

const CODE_MESSAGE = "Code must be 2–40 lowercase letters, numbers, and dashes.";
const DATE_ORDER_MESSAGE = "End date must be on or after start date.";

const seasonWriteFields = z.object({
  /** Raw; slugified below. The max is only a payload sanity cap — the real bound applies to the slug. */
  code: z.string().max(200).optional(),
  program: z.string().min(1).max(60),
  year: z.number().int().min(2000).max(2100),
  description: z.string().max(2000).nullish(),
  startDate: z.string().datetime({ offset: true }),
  endDate: z.string().datetime({ offset: true }),
  status: seasonStatusSchema,
  // v1's create built its data object without these two, silently discarding
  // whatever the form sent while update honoured them (spec 02 D1). Defaults
  // here mean create and update share one schema and neither can drop them.
  absenceBudgetMinutes: z.number().int().min(1).default(180),
  absenceWeightMinutes: z.number().int().min(1).default(90),
});

/**
 * SUPER create and full update. v1 order: slugify `code || "<program> <year>"`
 * first, then validate the slug (season-actions.ts:65, :115).
 */
export const seasonWriteRequestSchema = seasonWriteFields
  .transform((v) => ({ ...v, code: slugifySeasonCode(v.code || `${v.program} ${v.year}`) }))
  .superRefine((v, ctx) => {
    if (!isValidSeasonCode(v.code)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["code"], message: CODE_MESSAGE });
    }
    if (new Date(v.endDate).getTime() < new Date(v.startDate).getTime()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endDate"], message: DATE_ORDER_MESSAGE });
    }
  });
export type SeasonWriteBody = z.output<typeof seasonWriteRequestSchema>;

/** Spec 02 D3: the only fields a season ADMIN may change. Everything else is SUPER's. */
export const SEASON_ADMIN_EDITABLE_FIELDS = [
  "description",
  "absenceBudgetMinutes",
  "absenceWeightMinutes",
] as const;

export const seasonAdminPatchSchema = z
  .object({
    description: z.string().max(2000).nullable(),
    absenceBudgetMinutes: z.number().int().min(1),
    absenceWeightMinutes: z.number().int().min(1),
  })
  .partial()
  .strict();
export type SeasonAdminPatchBody = z.output<typeof seasonAdminPatchSchema>;

/**
 * Duplicate. `code` stays raw here: its default is "<source.program> <year>"
 * (v1 season-actions.ts:256), which only the route knows, so the route
 * slugifies and validates it with the two helpers above.
 */
export const duplicateSeasonRequestSchema = z
  .object({
    year: z.number().int().min(2000).max(2100),
    code: z.string().max(200).optional(),
    startDate: z.string().datetime({ offset: true }),
    endDate: z.string().datetime({ offset: true }),
  })
  .refine((v) => new Date(v.endDate).getTime() >= new Date(v.startDate).getTime(), {
    path: ["endDate"], message: DATE_ORDER_MESSAGE,
  });
export type DuplicateSeasonBody = z.output<typeof duplicateSeasonRequestSchema>;

/** POST /seasons, POST /seasons/:id/duplicate and PATCH /seasons/:id all answer this. */
export const seasonRefResponseSchema = z.object({ id: z.number(), code: z.string() });
export type SeasonRefResponse = z.infer<typeof seasonRefResponseSchema>;

export const seasonDeletedResponseSchema = z.object({ deleted: z.literal(true) });

// ---------------------------------------------------------------------------
// Student self-service — Plan 11
// ---------------------------------------------------------------------------

export const seasonHistoryCurriculumItemSchema = z.object({
  sessionId: z.number(),
  title: z.string(),
  startsAt: z.string(),
  dayKey: isoDaySchema,
});

/**
 * One past enrollment (spec 02 R33–R41). `.strict()` on purpose: R34 is a
 * privacy rule — history carries attendance % and curriculum ONLY. A
 * submissions/feedback/notes field arriving here fails the parse instead of
 * being silently stripped.
 */
export const seasonHistoryRowSchema = z
  .object({
    seasonId: z.number(),
    title: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    groupName: z.string().nullable(),
    attendancePct: z.number().int().min(0).max(100),
    curriculum: z.array(seasonHistoryCurriculumItemSchema),
  })
  .strict();
export type SeasonHistoryRow = z.infer<typeof seasonHistoryRowSchema>;

export const seasonHistoryResponseSchema = z.object({ seasons: z.array(seasonHistoryRowSchema) });

/** v1 showed leaders' emails to their students (spec 05 R89). */
export const mySeasonLeaderSchema = z.object({ id: z.number(), name: z.string(), email: z.string() });

/** Peers: name only — never an email (R89). Strict so an address cannot slip in. */
export const mySeasonMemberSchema = z
  .object({ id: z.number(), name: z.string(), isYou: z.boolean() })
  .strict();

export const mySeasonGroupSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  leaders: z.array(mySeasonLeaderSchema),
  members: z.array(mySeasonMemberSchema),
});

export const mySeasonUpcomingSessionSchema = z.object({
  id: z.number(),
  title: z.string(),
  startsAt: z.string(),
  dayKey: isoDaySchema,
  location: z.string().nullable(),
});

/**
 * `GET /api/v1/me/season` — the student's current season page (v1
 * app/student/season/page.tsx), every figure server-derived (C4).
 */
export const mySeasonSchema = z.object({
  id: z.number(),
  code: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  status: seasonStatusSchema,
  startDate: z.string(),
  endDate: z.string(),
  /** R29: session-based, not calendar-based — completed = startsAt <= now. */
  progress: z.object({
    completedSessions: z.number().int().min(0),
    totalSessions: z.number().int().min(0),
    pct: z.number().int().min(0).max(100),
  }),
  /** From SeasonEnrollment.groupId for THIS season (C9), not GroupStudent. */
  group: mySeasonGroupSchema.nullable(),
  /** R30: the next three sessions, `startsAt >= now`, ascending. */
  upcoming: z.array(mySeasonUpcomingSessionSchema).max(3),
});
export type MySeason = z.infer<typeof mySeasonSchema>;

export const mySeasonResponseSchema = z.object({ season: mySeasonSchema.nullable() });
