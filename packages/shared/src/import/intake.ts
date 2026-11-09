import { z } from "zod";

import { IMPORT_MAX_PASTE_CHARS } from "./limits";

// ---------------------------------------------------------------------------
// Intake + template
// ---------------------------------------------------------------------------

/**
 * The one intake shape (D-16.2). Spreadsheet apps put TAB-separated text on
 * the clipboard and a CSV export is comma-separated, so both must work;
 * `delimiter` exists so a comma-containing name in a TSV can never be
 * misread by a sniffer that guessed wrong.
 */
export const pastedSheetInputSchema = z.object({
  text: z.string().min(1).max(IMPORT_MAX_PASTE_CHARS),
  delimiter: z.enum(["comma", "tab", "auto"]).default("auto"),
});

const importColumnSpecSchema = z.object({
  label: z.string(),
  acceptedHeaders: z.array(z.string()),
  required: z.boolean(),
  maxLength: z.number().nullable(),
  target: z.string(),
  note: z.string().nullable(),
});

export const importTemplateSchema = z.object({
  columns: z.array(importColumnSpecSchema),
  /** A ready-made tab-separated header line the operator can copy. */
  headerRow: z.string(),
  maxRows: z.number(),
  maxPasteChars: z.number(),
  /**
   * D-16.3. `fileUpload` is a hard `false` today; the screen renders the
   * reason rather than omitting a picker and letting the operator conclude
   * the feature was forgotten. It flips when .xlsx intake lands with the CMS.
   */
  capabilities: z.object({
    pasteText: z.boolean(),
    fileUpload: z.boolean(),
  }),
});
export type ImportTemplate = z.infer<typeof importTemplateSchema>;
