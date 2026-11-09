import {
  createStudentRequestSchema,
  dateOnlyFromIso,
  isDateOnly,
  isoFromDateOnly,
  updateStudentRequestSchema,
  yearFromText,
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
  faculty: string;
  /** The university graduation year as typed, or "". */
  universityGraduationYear: string;
  phone: string;
  /** YYYY-MM-DD or "" (Plan 10 Decision 8). */
  dateOfBirth: string;
  notes: string;
  /** Create: the season to enroll in. Unused on edit. */
  seasonId: number | null;
}

export type StudentFormErrors = Partial<Record<keyof StudentFormValues, string>>;

const FORM_KEYS: readonly (keyof StudentFormValues)[] = [
  "name",
  "email",
  "university",
  "faculty",
  "universityGraduationYear",
  "phone",
  "dateOfBirth",
  "notes",
  "seasonId",
];

function isFormKey(key: unknown): key is keyof StudentFormValues {
  return typeof key === "string" && (FORM_KEYS as readonly string[]).includes(key);
}

export function emptyStudentForm(): StudentFormValues {
  return {
    name: "",
    email: "",
    university: "",
    faculty: "",
    universityGraduationYear: "",
    phone: "",
    dateOfBirth: "",
    notes: "",
    seasonId: null,
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
    faculty: p.faculty ?? "",
    universityGraduationYear: p.universityGraduationYear === null ? "" : String(p.universityGraduationYear),
    phone: "phone" in p ? (p.phone ?? "") : "",
    dateOfBirth: "dateOfBirth" in p ? (dateOnlyFromIso(p.dateOfBirth) ?? "") : "",
    notes: "notes" in p ? (p.notes ?? "") : "",
    seasonId: null,
  };
}

const blankToNull = (s: string): string | null => (s.trim() === "" ? null : s.trim());

/** Typed text → the year the API takes. Only called on a form that passed validation. */
const gradYear = (s: string): number | null => {
  const y = yearFromText(s);
  return typeof y === "number" ? y : null;
};

/** The profile fields as the API takes them: "" → null (Plan 7's R26), birthday → UTC midnight. */
function profileFields(v: StudentFormValues) {
  const dob = v.dateOfBirth.trim();
  return {
    university: blankToNull(v.university),
    faculty: blankToNull(v.faculty),
    universityGraduationYear: gradYear(v.universityGraduationYear),
    phone: blankToNull(v.phone),
    dateOfBirth: dob === "" ? null : isoFromDateOnly(dob),
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
  const gradYearIssue = updateStudentRequestSchema.shape.universityGraduationYear.safeParse(
    yearFromText(v.universityGraduationYear),
  );
  if (!gradYearIssue.success) {
    errors.universityGraduationYear = gradYearIssue.error.issues[0]?.message ?? "Use a whole year.";
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
 * PATCH /students/:id. Never carries a season: the current season is derived
 * from enrolments, and the server refuses an `activeSeasonId` key.
 */
export function toUpdateStudentBody(v: StudentFormValues): UpdateStudentBody {
  return {
    name: v.name.trim(),
    email: v.email.trim(),
    ...profileFields(v),
  };
}
