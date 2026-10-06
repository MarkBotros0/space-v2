import {
  createStudentRequestSchema,
  dateOnlyFromIso,
  isDateOnly,
  isoFromDateOnly,
  updateStudentRequestSchema,
  type CreateStudentBody,
  type StudentDetailInternal,
  type StudentDetailPrivate,
  type StudentDetailPublic,
  type UpdateStudentBody,
} from "@space/shared";

/** What the StudentForm edits — strings as typed, plus the season choice. */
export interface StudentFormValues {
  name: string;
  email: string;
  university: string;
  year: string;
  phone: string;
  /** YYYY-MM-DD or "" (Plan 10 Decision 8). */
  dateOfBirth: string;
  spiritualBackground: string;
  gifts: string;
  notes: string;
  /** Create: the season to enroll in. Edit: the active-season pointer. */
  seasonId: number | null;
}

export type StudentFormErrors = Partial<Record<keyof StudentFormValues, string>>;

const FORM_KEYS: readonly (keyof StudentFormValues)[] = [
  "name", "email", "university", "year", "phone", "dateOfBirth", "spiritualBackground", "gifts", "notes", "seasonId",
];

function isFormKey(key: unknown): key is keyof StudentFormValues {
  return typeof key === "string" && (FORM_KEYS as readonly string[]).includes(key);
}

export function emptyStudentForm(): StudentFormValues {
  return {
    name: "", email: "", university: "", year: "", phone: "", dateOfBirth: "",
    spiritualBackground: "", gifts: "", notes: "", seasonId: null,
  };
}

/** Seeds the edit form. Fields the caller's arm doesn't carry come back blank. */
export function studentFormFromDetail(
  detail: StudentDetailPublic | StudentDetailPrivate | StudentDetailInternal,
): StudentFormValues {
  const p = detail.profile;
  return {
    name: detail.name,
    email: detail.email,
    university: p.university ?? "",
    year: p.year ?? "",
    gifts: p.gifts ?? "",
    phone: "phone" in p ? (p.phone ?? "") : "",
    dateOfBirth: "dateOfBirth" in p ? (dateOnlyFromIso(p.dateOfBirth) ?? "") : "",
    spiritualBackground: "spiritualBackground" in p ? (p.spiritualBackground ?? "") : "",
    notes: "notes" in p ? (p.notes ?? "") : "",
    seasonId: p.activeSeasonId,
  };
}

const blankToNull = (s: string): string | null => (s.trim() === "" ? null : s.trim());

/** The profile fields as the API takes them: "" → null (Plan 7's R26), birthday → UTC midnight. */
function profileFields(v: StudentFormValues) {
  const dob = v.dateOfBirth.trim();
  return {
    university: blankToNull(v.university),
    year: blankToNull(v.year),
    phone: blankToNull(v.phone),
    dateOfBirth: dob === "" ? null : isoFromDateOnly(dob),
    spiritualBackground: blankToNull(v.spiritualBackground),
    gifts: blankToNull(v.gifts),
    notes: blankToNull(v.notes),
  };
}

/**
 * Client-side check against the SAME shared schemas the server runs — no
 * second hand-written copy to drift (v1's R21/R55 defect). Friendly messages
 * for the three fields people get wrong; the length limits come straight
 * from the schema.
 */
export function validateStudentForm(v: StudentFormValues): StudentFormErrors {
  const errors: StudentFormErrors = {};
  const name = v.name.trim();
  if (name.length < 2) errors.name = "At least 2 characters.";
  else if (name.length > 120) errors.name = "At most 120 characters.";
  if (!createStudentRequestSchema.shape.email.safeParse(v.email.trim()).success) {
    errors.email = "Must be a valid email.";
  }
  const dob = v.dateOfBirth.trim();
  if (dob !== "" && !isDateOnly(dob)) {
    errors.dateOfBirth = "Use YYYY-MM-DD.";
    return errors;
  }
  const lengths = updateStudentRequestSchema.safeParse(profileFields(v));
  if (!lengths.success) {
    for (const issue of lengths.error.issues) {
      const key = issue.path[0];
      if (isFormKey(key) && errors[key] === undefined) errors[key] = "Too long.";
    }
  }
  return errors;
}

/** POST /students. No password field exists to send (Plan 7 D7). */
export function toCreateStudentBody(v: StudentFormValues): CreateStudentBody {
  return {
    name: v.name.trim(),
    email: v.email.trim(),
    ...profileFields(v),
    seasonId: v.seasonId,
  };
}

/**
 * PATCH /students/:id. `activeSeasonId` travels only when the caller may move
 * it (SUPER) AND it changed — re-sending a legacy pointer with no ACTIVE
 * enrollment behind it would 409 not_enrolled (Plan 10 Decision 6).
 */
export function toUpdateStudentBody(
  v: StudentFormValues,
  initial: StudentFormValues,
  opts: { includeSeasonPointer: boolean },
): UpdateStudentBody {
  return {
    name: v.name.trim(),
    email: v.email.trim(),
    ...profileFields(v),
    ...(opts.includeSeasonPointer && v.seasonId !== initial.seasonId ? { activeSeasonId: v.seasonId } : {}),
  };
}
