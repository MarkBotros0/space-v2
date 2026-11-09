// apps/backend/src/lib/exports/audit.ts
import type { ExportKind } from "@space/shared";

interface ExportAuditEntry {
  actorId: number;
  actorRole: string;
  kind: ExportKind;
  seasonIds: number[];
  rowCount: number;
}

/**
 * One line per successful export.
 *
 * NOT a database write. Ruling C6 is that a GET never writes, and an export is
 * a GET; and there is no ExportAudit table. Spec D15: "do not let 'we cannot
 * add a table yet' become 'we shipped bulk personal-data export with no record
 * of it'" — so the record is this log line.
 *
 * The line carries an actor ID and role, a scope and a row count. It carries NO
 * names, NO emails and NO filename: an audit trail that reproduces the payload
 * is a second copy of the payload, sitting in a log aggregator with weaker
 * access control than the database it came from.
 *
 * Emitted after the last byte is written, so a failed or aborted download does
 * not record a successful export.
 */
export function logExport(entry: ExportAuditEntry): void {
  console.info(JSON.stringify({ event: "export.completed", ...entry }));
}
