// packages/shared/src/__tests__/import-schemas.test.ts
import {
  IMPORT_MAX_PASTE_CHARS,
  IMPORT_MAX_ROWS,
  IMPORT_PROFILE_ALIASES,
  IMPORT_NAME_HEADERS,
  importCellValuesSchema,
  importCommitOutcomeSchema,
  importRowStatusSchema,
  pastedSheetInputSchema,
  studentImportCommitInputSchema,
  studentImportPreviewSchema,
  studentImportResultSchema,
  studentImportRowSchema,
} from "../index";

describe("studentImportRowSchema", () => {
  const valid = { name: "Test Student", email: "space-v2-test-x@jpc.test" };

  it("has no password, passwordHash, role or seasonId field at all", () => {
    // D-16.8/Plan 9: an import issues no credentials and cannot choose a
    // role. Structural, not a default — the schema must not know the words.
    for (const key of ["password", "passwordHash", "role", "seasonId", "graduationYear"]) {
      expect(key in studentImportRowSchema.shape).toBe(false);
    }
  });

  it("bounds name 2-120 and requires a valid email", () => {
    expect(studentImportRowSchema.safeParse({ ...valid, name: "x".repeat(121) }).success).toBe(false);
    expect(studentImportRowSchema.safeParse({ ...valid, name: "x".repeat(120) }).success).toBe(true);
    expect(studentImportRowSchema.safeParse({ ...valid, name: "x" }).success).toBe(false);
    expect(studentImportRowSchema.safeParse({ ...valid, email: "not-an-email" }).success).toBe(false);
  });

  it("uses v1's import bounds, not the student create schema's (R41)", () => {
    // jpc-space/src/lib/student-import.ts:71-87
    const bounds: [string, number][] = [
      ["phone", 50],
      ["university", 200],
      ["year", 50],
      ["spiritualBackground", 2000],
      ["gifts", 2000],
      ["notes", 2000],
    ];
    for (const [field, max] of bounds) {
      expect(studentImportRowSchema.safeParse({ ...valid, [field]: "x".repeat(max) }).success).toBe(true);
      expect(studentImportRowSchema.safeParse({ ...valid, [field]: "x".repeat(max + 1) }).success).toBe(false);
    }
    expect(studentImportRowSchema.safeParse({ ...valid, dateOfBirth: "2003-01-02T00:00:00.000Z" }).success).toBe(true);
    expect(studentImportRowSchema.safeParse({ ...valid, dateOfBirth: "x".repeat(41) }).success).toBe(false);
  });

  it("coerces an empty optional cell to null, never \"\"", () => {
    expect(studentImportRowSchema.parse({ ...valid, phone: "" }).phone).toBeNull();
  });
});

describe("v1 parity shapes", () => {
  it("has v1's 5 MB paste ceiling (R3)", () => {
    expect(IMPORT_MAX_PASTE_CHARS).toBe(5 * 1024 * 1024);
  });

  it("has exactly v1's four row statuses (R22)", () => {
    expect(importRowStatusSchema.options).toEqual(["new", "exists", "duplicate", "invalid"]);
  });

  it("has no unrecognisedColumns on the preview (R18)", () => {
    expect("unrecognisedColumns" in studentImportPreviewSchema.shape).toBe(false);
  });

  it("has created / skipped / failed outcomes and tallies (R42, R54)", () => {
    expect(importCommitOutcomeSchema.options).toEqual(["created", "skipped", "failed"]);
    expect(Object.keys(studentImportResultSchema.shape).sort()).toEqual(["created", "failed", "rows", "skipped"]);
  });
});

describe("importCellValuesSchema", () => {
  it("carries the nine flat cells the preview echoes back for resubmission", () => {
    const parsed = importCellValuesSchema.parse({
      name: "A Student", email: "a@jpc.test", university: null, year: null,
      phone: null, dateOfBirth: null, spiritualBackground: null, gifts: null, notes: null,
    });
    expect(parsed.name).toBe("A Student");
    // v1's nested `profile` object does not port (D-16.10).
    expect("profile" in parsed).toBe(false);
  });
});

describe("studentImportCommitInputSchema", () => {
  const rows = [{ rowNumber: 2, values: { name: "A", email: "a@jpc.test", university: null, year: null, phone: null, dateOfBirth: null, spiritualBackground: null, gifts: null, notes: null } }];

  it("has no onExisting — an existing user is always skipped (R44)", () => {
    const parsed = studentImportCommitInputSchema.parse({ mode: "season", seasonId: 1, onExisting: "enroll", rows });
    expect("onExisting" in parsed).toBe(false);
  });

  it("caps the graduation year against THIS YEAR, evaluated per parse (spec R38)", () => {
    // v1 captured CURRENT_YEAR at module load in both the server action
    // (student-import-actions.ts:49) and the client (:54), so a long-lived
    // process caps the year at whenever it booted.
    const thisYear = new Date().getUTCFullYear();
    const ok = studentImportCommitInputSchema.safeParse({ mode: "alumni", graduationYear: thisYear, rows });
    const future = studentImportCommitInputSchema.safeParse({ mode: "alumni", graduationYear: thisYear + 1, rows });
    expect(ok.success).toBe(true);
    expect(future.success).toBe(false);
  });

  it("caps the batch at IMPORT_MAX_ROWS", () => {
    const many = Array.from({ length: IMPORT_MAX_ROWS + 1 }, (_, i) => ({ ...rows[0], rowNumber: i + 2 }));
    expect(
      studentImportCommitInputSchema.safeParse({ mode: "season", seasonId: 1, rows: many }).success,
    ).toBe(false);
  });

  it("never accepts a client-computed status — the server re-derives it (D-16.4)", () => {
    const parsed = studentImportCommitInputSchema.parse({
      mode: "season", seasonId: 1,
      rows: [{ ...rows[0], status: "new" }],
    });
    expect("status" in (parsed.rows[0] ?? {})).toBe(false);
  });
});

describe("pastedSheetInputSchema", () => {
  it("defaults the delimiter to auto and refuses an empty paste", () => {
    expect(pastedSheetInputSchema.parse({ text: "name\temail\nA\ta@jpc.test" }).delimiter).toBe("auto");
    expect(pastedSheetInputSchema.safeParse({ text: "" }).success).toBe(false);
  });
});

describe("the header vocabulary", () => {
  it("accepts \"student\" as a name header so a season export round-trips (spec D14)", () => {
    // Every export sheet's first column is headed "Student"
    // (jpc-space/src/lib/season-export.ts:106,130,158); v1 rejected such a
    // file outright with the "needs a header row" message.
    expect(IMPORT_NAME_HEADERS).toContain("student");
    expect(IMPORT_NAME_HEADERS).toContain("name");
  });

  it("keeps v1's profile aliases", () => {
    expect(IMPORT_PROFILE_ALIASES["mobile no."]).toBe("phone");
    expect(IMPORT_PROFILE_ALIASES["spiritual gifts"]).toBe("gifts");
    expect(IMPORT_PROFILE_ALIASES.college).toBe("university");
    expect(IMPORT_PROFILE_ALIASES.dob).toBe("dateOfBirth");
  });
});
