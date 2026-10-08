import type { AttendanceStatus } from "../../generated/prisma/enums";

/**
 * One attendance cell of the season workbook.
 *
 * After M3 every checked-in LATE row is measured from the session start, so
 * the minutes are one series again and are printed (ruling C3, D-17.10); the
 * column header and Key sheet say what they measure. A LATE row with no
 * minutes keeps the letter.
 */
export function attendanceCellFor(
  status: AttendanceStatus | undefined,
  lateMinutes: number | null,
): string | number {
  if (status === "PRESENT") return "P";
  if (status === "ABSENT") return "A";
  if (status === "LATE") return lateMinutes ?? "L";
  return "";
}
