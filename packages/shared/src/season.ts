import { z } from "zod";

import { seasonStatusSchema } from "./enums";

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
