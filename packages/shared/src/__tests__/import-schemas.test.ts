// packages/shared/src/__tests__/import-schemas.test.ts
import {
  IMPORT_MAX_ROWS,
  IMPORT_PROFILE_ALIASES,
  IMPORT_NAME_HEADERS,
  importCellValuesSchema,
  pastedSheetInputSchema,
  studentImportCommitInputSchema,
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

  it("enforces the SAME maxima at preview time as the student create schema (D-16.9 / spec D12)", () => {
    // v1 checked lengths only on the commit side, so a 300-character name
    // previewed green and came back `failed` after the operator committed.
    expect(studentImportRowSchema.safeParse({ ...valid, name: "x".repeat(300) }).success).toBe(false);
    expect(studentImportRowSchema.safeParse({ ...valid, name: "x" }).success).toBe(false);
    expect(studentImportRowSchema.safeParse({ ...valid, email: "not-an-email" }).success).toBe(false);
  });

  it("coerces an empty optional cell to null, never \"\"", () => {
    expect(studentImportRowSchema.parse({ ...valid, phone: "" }).phone).toBeNull();
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

  it("requires onExisting — no default may be inherited by accident (D-16.7)", () => {
    const missing = studentImportCommitInputSchema.safeParse({ mode: "season", seasonId: 1, rows });
    expect(missing.success).toBe(false);
  });

  it("refuses onExisting=enroll in alumni mode — there is no season to enrol into", () => {
    expect(
      studentImportCommitInputSchema.safeParse({
        mode: "alumni", graduationYear: 2020, onExisting: "enroll", rows,
      }).success,
    ).toBe(false);
  });

  it("caps the graduation year against THIS YEAR, evaluated per parse (spec R38)", () => {
    // v1 captured CURRENT_YEAR at module load in both the server action
    // (student-import-actions.ts:49) and the client (:54), so a long-lived
    // process caps the year at whenever it booted.
    const thisYear = new Date().getUTCFullYear();
    const ok = studentImportCommitInputSchema.safeParse({ mode: "alumni", graduationYear: thisYear, onExisting: "skip", rows });
    const future = studentImportCommitInputSchema.safeParse({ mode: "alumni", graduationYear: thisYear + 1, onExisting: "skip", rows });
    expect(ok.success).toBe(true);
    expect(future.success).toBe(false);
  });

  it("caps the batch at IMPORT_MAX_ROWS", () => {
    const many = Array.from({ length: IMPORT_MAX_ROWS + 1 }, (_, i) => ({ ...rows[0], rowNumber: i + 2 }));
    expect(
      studentImportCommitInputSchema.safeParse({ mode: "season", seasonId: 1, onExisting: "skip", rows: many }).success,
    ).toBe(false);
  });

  it("never accepts a client-computed status — the server re-derives it (D-16.4)", () => {
    const parsed = studentImportCommitInputSchema.parse({
      mode: "season", seasonId: 1, onExisting: "skip",
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
