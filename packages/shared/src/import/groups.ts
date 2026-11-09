import { z } from "zod";

import { IMPORT_MAX_ROWS } from "./limits";

// ---------------------------------------------------------------------------
// Group importer
// ---------------------------------------------------------------------------

/** v1's five (`jpc-space/src/lib/group-import.ts:6`), unchanged. */
const groupImportRowStatusSchema = z.enum(["assign", "unchanged", "no_student", "no_group", "invalid"]);

const groupImportPreviewRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  /** Read for display only — never written, never validated (spec R56). */
  name: z.string(),
  email: z.string(),
  group: z.string(),
  status: groupImportRowStatusSchema,
  message: z.string().nullable(),
  studentUserId: z.number().nullable(),
  groupId: z.number().nullable(),
});

export const groupImportPreviewSchema = z.object({
  rows: z.array(groupImportPreviewRowSchema),
  delimiter: z.enum(["comma", "tab"]),
  counts: z.object({
    assign: z.number(),
    unchanged: z.number(),
    no_student: z.number(),
    no_group: z.number(),
    invalid: z.number(),
    total: z.number(),
  }),
});
export type GroupImportPreview = z.infer<typeof groupImportPreviewSchema>;

/**
 * `seasonId` is NOT here: it comes from the path (D-16.20). v1 took it as an
 * argument on both the preview and the commit
 * (`group-import-actions.ts:20,59`), so the two calls could target different
 * seasons.
 */
export const groupImportCommitInputSchema = z.object({
  assignments: z
    .array(
      z.object({
        studentUserId: z.number().int().positive(),
        groupId: z.number().int().positive(),
      }),
    )
    .min(1)
    .max(IMPORT_MAX_ROWS),
});

export type GroupImportCommitInput = z.infer<typeof groupImportCommitInputSchema>;

export const groupImportResultSchema = z.object({
  /**
   * The number actually WRITTEN. v1 returns the requested array length
   * (spec R80/D5) while the underlying write silently skips anyone whose
   * eligibility check fails — "Assigned 40 students" could mean 12.
   */
  assigned: z.number(),
  skipped: z.number(),
  /** Who was not applied, so the screen can say which rows to look at. */
  skippedStudentIds: z.array(z.number()),
});
export type GroupImportResult = z.infer<typeof groupImportResultSchema>;
