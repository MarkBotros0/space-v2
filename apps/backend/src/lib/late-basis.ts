import type { LateBasis } from "../generated/prisma/enums";

interface ExistingAttendance {
  checkedInAt: Date | null;
  lateMinutes: number | null;
}

interface SavedEntry {
  status: "PRESENT" | "ABSENT" | "LATE";
  lateMinutes?: number | null;
}

/**
 * What a leader's attendance save should write to `lateBasis` (Plan 18 M3).
 *
 * `undefined` means "leave the column as it is". No path here writes UNKNOWN —
 * that value belongs to historic rows the migration could not classify, and
 * the soak alarms on a v2 write of it.
 *
 * A scanned row's minutes were computed from the session start. The form
 * round-trips them, so an unchanged number must not flip the row to MANUAL;
 * a different number is the leader's own and does. (The plan said SESSION_START
 * whenever a check-in instant exists; that would label a typed override as a
 * computed value.)
 */
export function lateBasisForSave(
  existing: ExistingAttendance | null,
  entry: SavedEntry,
): LateBasis | undefined {
  if (!existing) return "MANUAL";
  if (!existing.checkedInAt) return "MANUAL";
  if (entry.status === "LATE" && entry.lateMinutes != null && entry.lateMinutes !== existing.lateMinutes) {
    return "MANUAL";
  }
  return undefined;
}
