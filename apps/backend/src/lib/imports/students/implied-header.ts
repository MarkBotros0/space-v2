import type { StudentImportPreview } from "@space/shared";

/**
 * A paste of plain "name, email" lines with no header row (owner, 2026-11-07:
 * add students in bulk with only a name and an email). When the first line has
 * exactly two cells and one of them is an email address, the header the
 * importer needs is supplied in front of it, in the same delimiter and order.
 * Anything else, a real header row included, is left exactly as pasted.
 */
export function withImpliedHeader(text: string): { text: string; implied: boolean } {
  const first = text.split(/\r?\n/).find((line) => line.trim() !== "");
  if (first === undefined) return { text, implied: false };
  const delimiter = first.includes("\t") ? "\t" : ",";
  const cells = first.split(delimiter).map((c) => c.trim());
  if (cells.length !== 2) return { text, implied: false };
  const emailAt = cells.findIndex((c) => /^[^\s@]+@[^\s@]+$/.test(c));
  if (emailAt === -1 || cells[1 - emailAt] === "" || cells[1 - emailAt]!.includes("@")) {
    return { text, implied: false };
  }
  const header = emailAt === 1 ? ["name", "email"] : ["email", "name"];
  return { text: `${header.join(delimiter)}\n${text}`, implied: true };
}

/** Row numbers back to the operator's own lines, once the supplied header is taken away. */
export function withoutImpliedHeaderLine(preview: StudentImportPreview): StudentImportPreview {
  return { ...preview, rows: preview.rows.map((r) => ({ ...r, rowNumber: r.rowNumber - 1 })) };
}
