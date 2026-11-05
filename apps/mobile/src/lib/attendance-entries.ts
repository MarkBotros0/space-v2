import type { AttendanceEntry, AttendanceRosterRow, AttendanceStatus } from "@space/shared";

export type AttendanceMarks = Record<number, AttendanceStatus>;
export type LateMinutesText = Record<number, string>;

/** v1's parse of the minutes field: blank, non-numeric or negative → null; else floored. */
function parseLateMinutes(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

/**
 * The save payload. Only rows the caller touched (present in `marks`) are
 * sent, in roster order. Each carries the row's stored `notes`, because the
 * server writes `notes ?? null` and this screen has no notes editor —
 * omitting it would erase a note written by check-in or an override.
 * `lateMinutes` goes only with LATE (the server nulls it otherwise); an
 * untouched minutes field falls back to the stored value.
 *
 * A row also counts as touched when its minutes were edited and its
 * effective status (the re-tap, else the stored one) is LATE. Otherwise
 * correcting the minutes on an already-LATE row was never sent: the screen
 * said "Mark at least one student", or the edit was silently dropped. v1's
 * form sent every marked row, so it never lost one.
 */
export function buildAttendanceEntries(
  roster: AttendanceRosterRow[],
  marks: AttendanceMarks,
  lateText: LateMinutesText,
): AttendanceEntry[] {
  const entries: AttendanceEntry[] = [];
  for (const row of roster) {
    const effective = marks[row.studentUserId] ?? row.status;
    const lateEdited = lateText[row.studentUserId] !== undefined && effective === "LATE";
    const status = marks[row.studentUserId] ?? (lateEdited ? "LATE" : undefined);
    if (status === undefined) continue;
    const entry: AttendanceEntry = { studentUserId: row.studentUserId, status, notes: row.notes };
    if (status === "LATE") {
      const raw = lateText[row.studentUserId] ?? (row.lateMinutes !== null ? String(row.lateMinutes) : "");
      entry.lateMinutes = parseLateMinutes(raw);
    }
    entries.push(entry);
  }
  return entries;
}
