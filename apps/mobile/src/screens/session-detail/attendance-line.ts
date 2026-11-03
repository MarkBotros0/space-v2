import type { MyAttendance } from "@space/shared";

/** The viewer's own attendance, as the session detail shows it. */
export function attendanceLine(a: MyAttendance): string {
  if (a.status === "PRESENT") return "Your attendance: Present";
  if (a.status === "LATE") {
    return a.lateMinutes !== null
      ? `Your attendance: Late (${a.lateMinutes} min)`
      : "Your attendance: Late";
  }
  return "Your attendance: Absent";
}
