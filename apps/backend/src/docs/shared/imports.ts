// Imports (Plan 17). Hand-authored like every response in this document.
export const importCellValuesDoc = {
  type: "object",
  description:
    "The raw trimmed cell text of one row. Flat (no nested profile). Resubmitted verbatim on commit.",
  properties: {
    name: { type: "string" },
    email: { type: "string" },
    university: { type: "string", nullable: true },
    year: { type: "string", nullable: true },
    phone: { type: "string", nullable: true },
    dateOfBirth: { type: "string", nullable: true, description: "Raw text as typed; YYYY-MM-DD is the only accepted form." },
    spiritualBackground: { type: "string", nullable: true },
    gifts: { type: "string", nullable: true },
    notes: { type: "string", nullable: true },
  },
} as const;

export const studentImportPreviewDoc = {
  type: "object",
  properties: {
    rows: {
      type: "array",
      items: {
        type: "object",
        properties: {
          rowNumber: { type: "integer", description: "The operator's own line number; the header is line 1. Not contiguous: blank lines keep their number." },
          name: { type: "string" },
          email: { type: "string" },
          status: { type: "string", enum: ["new", "exists", "duplicate", "invalid", "previously_removed"] },
          message: { type: "string", nullable: true },
          values: importCellValuesDoc,
        },
      },
    },
    detectedColumns: { type: "array", items: { type: "string" } },
    unrecognisedColumns: { type: "array", items: { type: "string" }, description: "Header cells that matched no alias, echoed as typed (trimmed)." },
    delimiter: { type: "string", enum: ["comma", "tab"] },
    counts: {
      type: "object",
      properties: {
        new: { type: "integer" },
        exists: { type: "integer" },
        duplicate: { type: "integer" },
        invalid: { type: "integer" },
        previously_removed: { type: "integer" },
        total: { type: "integer" },
      },
    },
  },
} as const;

export const importTemplateDoc = {
  type: "object",
  properties: {
    columns: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          acceptedHeaders: { type: "array", items: { type: "string" } },
          required: { type: "boolean" },
          maxLength: { type: "integer", nullable: true },
          target: { type: "string" },
          note: { type: "string", nullable: true },
        },
      },
    },
    headerRow: { type: "string", description: "A ready-made tab-separated header line." },
    maxRows: { type: "integer" },
    maxPasteChars: { type: "integer" },
    capabilities: {
      type: "object",
      properties: { pasteText: { type: "boolean" }, fileUpload: { type: "boolean", description: "Hard false until file intake lands with the CMS." } },
    },
  },
} as const;

export const pastedSheetBodyDoc = {
  type: "object",
  required: ["text"],
  properties: {
    text: { type: "string", minLength: 1, maxLength: 262144 },
    delimiter: { type: "string", enum: ["comma", "tab", "auto"], default: "auto" },
  },
} as const;

export const studentImportCommitBodyDoc = {
  type: "object",
  required: ["mode", "onExisting", "rows"],
  properties: {
    mode: { type: "string", enum: ["season", "alumni"] },
    seasonId: { type: "integer", description: "Required when mode is `season`." },
    graduationYear: { type: "integer", minimum: 1990, description: "Required when mode is `alumni`; not in the future (evaluated per request)." },
    onExisting: { type: "string", enum: ["skip", "enroll"], description: "Required, no default. `enroll` is valid in season mode only." },
    rows: {
      type: "array",
      minItems: 1,
      maxItems: 2000,
      items: {
        type: "object",
        required: ["rowNumber", "values"],
        properties: { rowNumber: { type: "integer", minimum: 1 }, values: importCellValuesDoc },
      },
    },
  },
} as const;

export const studentImportResultDoc = {
  type: "object",
  properties: {
    created: { type: "integer" },
    skipped: { type: "integer" },
    enrolled: { type: "integer" },
    rows: {
      type: "array",
      items: {
        type: "object",
        properties: {
          rowNumber: { type: "integer" },
          name: { type: "string" },
          email: { type: "string" },
          outcome: { type: "string", enum: ["created", "skipped", "enrolled"] },
          message: { type: "string", nullable: true },
          userId: { type: "integer", nullable: true },
        },
      },
    },
  },
} as const;

export const groupImportPreviewDoc = {
  type: "object",
  properties: {
    rows: {
      type: "array",
      items: {
        type: "object",
        properties: {
          rowNumber: { type: "integer" },
          name: { type: "string", description: "Display only; never written." },
          email: { type: "string" },
          group: { type: "string" },
          status: { type: "string", enum: ["assign", "unchanged", "no_student", "no_group", "invalid"] },
          message: { type: "string", nullable: true },
          studentUserId: { type: "integer", nullable: true },
          groupId: { type: "integer", nullable: true },
        },
      },
    },
    delimiter: { type: "string", enum: ["comma", "tab"] },
    counts: {
      type: "object",
      properties: {
        assign: { type: "integer" },
        unchanged: { type: "integer" },
        no_student: { type: "integer" },
        no_group: { type: "integer" },
        invalid: { type: "integer" },
        total: { type: "integer" },
      },
    },
  },
} as const;

export const groupImportResultDoc = {
  type: "object",
  properties: {
    assigned: { type: "integer", description: "The number actually WRITTEN, not the number requested." },
    skipped: { type: "integer" },
    skippedStudentIds: { type: "array", items: { type: "integer" } },
  },
} as const;
