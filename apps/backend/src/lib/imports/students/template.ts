import {
  IMPORT_EMAIL_HEADERS,
  IMPORT_MAX_PASTE_CHARS,
  IMPORT_MAX_ROWS,
  IMPORT_NAME_HEADERS,
  // NOTE: a VALUE import from @space/shared in a backend file MUST use this
  // relative path. `tsc` emits this file to dist/apps/backend/src/lib/imports/students/
  // without rewriting bare specifiers, and a runtime `require("@space/shared")`
  // then resolves through node_modules back to the TypeScript SOURCE instead
  // of the compiled sibling in dist/packages/shared/src/ — the built server
  // dies with ERR_MODULE_NOT_FOUND. See CLAUDE.md; routes/auth.ts documents
  // the same trap in place. Do not "tidy" it back to the package name.
} from "../../../../../../packages/shared/src/index";
import type { ImportTemplate } from "@space/shared";

/**
 * The column schema as data, so the mobile screen can render "columns we
 * recognise" and a copyable header row natively.
 *
 * Deliberately JSON and not a downloadable .xlsx (spec §7): a file download
 * would need the very upload/CMS machinery this domain is avoiding, and the
 * phone has nowhere useful to put a file anyway.
 */
export function studentImportTemplate(): ImportTemplate {
  const columns: ImportTemplate["columns"] = [
    {
      label: "Name",
      acceptedHeaders: [...IMPORT_NAME_HEADERS],
      required: true,
      maxLength: 120,
      target: "User.name",
      note: null,
    },
    {
      label: "Email",
      acceptedHeaders: [...IMPORT_EMAIL_HEADERS],
      required: true,
      maxLength: null,
      target: "User.email",
      note: "Matching is case-insensitive; someone already in the system is skipped, never duplicated.",
    },
    { label: "Mobile No", acceptedHeaders: ["phone", "mobile", "mobile no", "mobile no.", "mobile number", "phone number"], required: false, maxLength: 60, target: "User.phone", note: null },
    { label: "University", acceptedHeaders: ["university", "college"], required: false, maxLength: 160, target: "StudentProfile.university", note: null },
    { label: "Faculty", acceptedHeaders: ["faculty"], required: false, maxLength: 160, target: "StudentProfile.faculty", note: null },
    { label: "Graduation year", acceptedHeaders: ["graduation year", "university graduation year", "grad year"], required: false, maxLength: null, target: "StudentProfile.universityGraduationYear", note: "The university graduation year, a whole year from 1950 to 2100; it may be in the future." },
    { label: "Date of birth", acceptedHeaders: ["date of birth", "dob", "birthdate", "birth date"], required: false, maxLength: null, target: "User.dateOfBirth", note: "YYYY-MM-DD only. Anything else fails the row rather than being guessed at." },
    { label: "Notes", acceptedHeaders: ["notes"], required: false, maxLength: 4000, target: "StudentProfile.notes", note: "Staff-internal. Never shown to the student." },
  ];

  return {
    columns,
    headerRow: ["name", "email", "Mobile No", "University", "Faculty", "Graduation year", "Date of birth", "Notes"].join("\t"),
    maxRows: IMPORT_MAX_ROWS,
    maxPasteChars: IMPORT_MAX_PASTE_CHARS,
    capabilities: { pasteText: true, fileUpload: false },
  };
}
