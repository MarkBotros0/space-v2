import { z } from "zod";

import { isoDaySchema } from "./org-time";

// ---------------------------------------------------------------------------
// Account-level contact fields (owner 2026-11-06). Phone, date of birth and
// address live on User for every role, not on StudentProfile. PATCH /me and
// the student's PATCH /me/profile share these, so the two writers of one
// column cannot disagree about what it accepts.
//
// PATCH semantics everywhere: absent = untouched, "" or null = cleared.
// ---------------------------------------------------------------------------

const PHONE_MAX = 60;
const ADDRESS_MAX = 300;

/** Trimmed free text; "" (after trimming) and null clear it. */
const trimmedToNull = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `At most ${max} characters.`)
    .transform((v): string | null => (v === "" ? null : v))
    .nullish();

// ---------------------------------------------------------------------------
// Phone (owner, 2026-11-07): an Egyptian mobile, 11 digits starting with 01.
// Spaces, dashes, dots and brackets are dropped; +20 / 0020 become the leading
// 0, and a 10-digit number starting with 1 gets its 0 back (a spreadsheet
// drops it on import). Stored in that one canonical form, "01XXXXXXXXX".
// ---------------------------------------------------------------------------

const PHONE_PATTERN = /^01\d{9}$/;
export const PHONE_MESSAGE = "Enter an 11-digit mobile number starting with 01.";

/** The canonical form of what was typed: digits only, with the local 0. Unchanged when it can't be one. */
export function normalisePhone(raw: string): string {
  let v = raw.trim().replace(/[\s\-.()]/g, "");
  if (v.startsWith("+20")) v = `0${v.slice(3)}`;
  else if (v.startsWith("0020")) v = `0${v.slice(4)}`;
  if (/^1\d{9}$/.test(v)) v = `0${v}`;
  return v;
}

/** A phone field: "" (after trimming) and null clear it; anything else must be a mobile. */
export const phoneFieldSchema = z
  .string()
  .max(PHONE_MAX, `At most ${PHONE_MAX} characters.`)
  .transform(normalisePhone)
  .refine((v) => v === "" || PHONE_PATTERN.test(v), PHONE_MESSAGE)
  .transform((v): string | null => (v === "" ? null : v))
  .nullish();
export const addressFieldSchema = trimmedToNull(ADDRESS_MAX);

/** A calendar day, "YYYY-MM-DD" (Plan 11 Decision 11); "" or null clears it. */
export const dateOfBirthFieldSchema = z
  .string()
  .nullish()
  .transform((v) => (v === "" ? null : v))
  .pipe(isoDaySchema.nullish());

// ---------------------------------------------------------------------------
// University graduation year (StudentProfile.universityGraduationYear). It may
// lie in the future. Not User.graduationYear, which marks a JPCS alumnus and
// gates roles.
// ---------------------------------------------------------------------------

const UNIVERSITY_GRADUATION_YEAR_MIN = 1950;
const UNIVERSITY_GRADUATION_YEAR_MAX = 2100;

const yearMessage = `Use a year between ${UNIVERSITY_GRADUATION_YEAR_MIN} and ${UNIVERSITY_GRADUATION_YEAR_MAX}.`;

export const universityGraduationYearFieldSchema = z
  .number({ message: yearMessage })
  .int(yearMessage)
  .min(UNIVERSITY_GRADUATION_YEAR_MIN, yearMessage)
  .max(UNIVERSITY_GRADUATION_YEAR_MAX, yearMessage)
  .nullish();

/**
 * A form's typed text → the wire value: "" → null, digits → a number, and
 * anything else passes through unchanged so the schema refuses it.
 */
export function yearFromText(text: string): number | null | string {
  const t = text.trim();
  if (t === "") return null;
  return /^\d+$/.test(t) ? Number(t) : t;
}
