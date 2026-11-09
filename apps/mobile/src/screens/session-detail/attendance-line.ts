import type { MyAttendance } from "@space/shared";
import { formatMinutes } from "../../lib/format";

/** The viewer's own attendance, as the session detail shows it. */
export function attendanceLine(a: MyAttendance): string {
  if (a.status === "PRESENT") return "Your attendance: Present";
  if (a.status === "LATE") {
    return a.lateMinutes !== null ? `Your attendance: Late (${formatMinutes(a.lateMinutes)})` : "Your attendance: Late";
  }
  return "Your attendance: Absent";
}
