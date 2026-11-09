// ---------------------------------------------------------------------------
// Header vocabulary — pure data, shared so the mobile screen can render
// "columns we recognise" without a round trip (spec §8).
// ---------------------------------------------------------------------------

/**
 * `student` is v2's addition (spec D14): every season export's first column is
 * headed "Student", and v1's importer rejected the file this system had just
 * produced.
 */
export const IMPORT_NAME_HEADERS = ["name", "student"] as const;
export const IMPORT_EMAIL_HEADERS = ["email", "e-mail"] as const;
export const IMPORT_GROUP_HEADERS = ["group"] as const;

// `year`, `spiritualBackground` and `gifts` were dropped from the product
// (owner 2026-11-06): a sheet still carrying those headers lists them as
// unrecognised columns instead of importing them.
export const IMPORT_PROFILE_FIELDS = [
  "phone",
  "university",
  "faculty",
  "universityGraduationYear",
  "dateOfBirth",
  "notes",
] as const;
export type ImportProfileFieldKey = (typeof IMPORT_PROFILE_FIELDS)[number];

/** v1's table (`jpc-space/src/lib/student-import.ts:24-42`), less the dropped columns, plus faculty and graduation year. */
export const IMPORT_PROFILE_ALIASES: Readonly<Record<string, ImportProfileFieldKey>> = {
  phone: "phone",
  mobile: "phone",
  "mobile no": "phone",
  "mobile no.": "phone",
  "mobile number": "phone",
  "phone number": "phone",
  university: "university",
  college: "university",
  faculty: "faculty",
  "graduation year": "universityGraduationYear",
  "university graduation year": "universityGraduationYear",
  "grad year": "universityGraduationYear",
  "date of birth": "dateOfBirth",
  dob: "dateOfBirth",
  birthdate: "dateOfBirth",
  "birth date": "dateOfBirth",
  notes: "notes",
};

/** Display labels (`student-import.ts:44-52`), used by `detectedColumns`. */
export const IMPORT_FIELD_LABELS: Readonly<Record<ImportProfileFieldKey, string>> = {
  phone: "Mobile No",
  university: "University",
  faculty: "Faculty",
  universityGraduationYear: "Graduation year",
  dateOfBirth: "Date of birth",
  notes: "Notes",
};
