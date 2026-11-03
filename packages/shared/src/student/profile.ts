import { z } from "zod";

import { isoDaySchema } from "../org-time";
import { emptyToNull } from "./empty-to-null";

// ---------------------------------------------------------------------------
// Date-only values (Plan 10 Decision 8). A date of birth is a calendar day,
// not an instant: it has no wall clock for the org timezone to apply to, and
// the device timezone must never decide it either (ruling X13).
// ---------------------------------------------------------------------------

/**
 * True for a real calendar day written as YYYY-MM-DD ("2003-02-29" is not).
 * Delegates to Plan 5's isoDaySchema (packages/shared/src/org-time.ts) — one
 * definition of "a day on the wire", not a second regex.
 */
export function isDateOnly(value: string): boolean {
  return isoDaySchema.safeParse(value).success;
}

/** The instant v2 stores for a calendar day: that day's UTC midnight. */
export function isoFromDateOnly(day: string): string {
  return `${day}T00:00:00.000Z`;
}

/**
 * The calendar day a stored date-of-birth instant names, read without any
 * timezone: shift +12h and take the UTC day. A local midnight from any zone
 * in UTC−11…UTC+12 lands inside its own day — so v1's rows (its web date
 * picker stored browser-local midnight, e.g. Cairo's `…T22:00Z` on the
 * previous UTC day) and v2's UTC-midnight rows both read back correctly.
 */
export function dateOnlyFromIso(iso: string | null): string | null {
  if (iso == null) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return new Date(ms + 12 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// The student's own profile — Plan 11 (GET/PATCH /api/v1/me/profile)
// ---------------------------------------------------------------------------

/**
 * The StudentProfile columns a student edits about themselves — and nothing
 * else (Plan 11 Decision 1). `User.name` is Plan 9's PATCH /me; `User.email`
 * is staff-only (spec 18 D8); `notes` and `activeSeasonId` never (R23).
 * routes/students.ts's SELF_EDITABLE is narrowed to this same set.
 */
export const OWN_PROFILE_FIELDS = [
  "university",
  "year",
  "phone",
  "dateOfBirth",
  "spiritualBackground",
  "gifts",
] as const;
export type OwnProfileField = (typeof OWN_PROFILE_FIELDS)[number];

/**
 * PATCH semantics: absent = untouched, "" or null = cleared (R26). `.strict()`
 * makes name/email/notes/activeSeasonId a parse failure (spec 06 §8: "a type
 * error rather than a runtime no-op"); the route refuses them by name first.
 * The mobile form validates with THIS schema before sending.
 */
export const updateOwnProfileInputSchema = z
  .object({
    university: emptyToNull(160),
    year: emptyToNull(40),
    phone: emptyToNull(60),
    /** A calendar date, "YYYY-MM-DD" (Plan 11 Decision 11) — Plan 5's isoDaySchema, not a copy. */
    dateOfBirth: z
      .string()
      .nullish()
      .transform((v) => (v === "" ? null : v))
      .pipe(isoDaySchema.nullish()),
    spiritualBackground: emptyToNull(4000),
    gifts: emptyToNull(2000),
  })
  .strict();
export type UpdateOwnProfileInput = z.input<typeof updateOwnProfileInputSchema>;

/**
 * What the student reads back about themselves. `.strict()`: staff-only
 * `notes` arriving here fails the parse (R23) instead of being stripped.
 */
export const myProfileSchema = z
  .object({
    name: z.string(),
    email: z.string(),
    avatarPath: z.string().nullable(),
    /** Non-null = alumnus (read-only profile). */
    graduationYear: z.number().int().nullable(),
    activeSeasonTitle: z.string().nullable(),
    university: z.string().nullable(),
    year: z.string().nullable(),
    phone: z.string().nullable(),
    dateOfBirth: isoDaySchema.nullable(),
    spiritualBackground: z.string().nullable(),
    gifts: z.string().nullable(),
  })
  .strict();
export type MyProfile = z.infer<typeof myProfileSchema>;

export const myProfileResponseSchema = z.object({ profile: myProfileSchema });
