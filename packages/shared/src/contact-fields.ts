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

export const PHONE_MAX = 60;
export const ADDRESS_MAX = 300;

/** Trimmed free text; "" (after trimming) and null clear it. */
const trimmedToNull = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `At most ${max} characters.`)
    .transform((v): string | null => (v === "" ? null : v))
    .nullish();

export const phoneFieldSchema = trimmedToNull(PHONE_MAX);
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

export const UNIVERSITY_GRADUATION_YEAR_MIN = 1950;
export const UNIVERSITY_GRADUATION_YEAR_MAX = 2100;

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
