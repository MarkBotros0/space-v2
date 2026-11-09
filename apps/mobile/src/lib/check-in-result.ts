import axios from "axios";
import {
  apiErrorBodySchema,
  checkInErrorCodeSchema,
  type CheckInErrorCode,
  type CheckInResponse,
  type MyAttendanceSession,
} from "@space/shared";

export type CheckInOutcome =
  | { kind: "checked_in"; status: CheckInResponse["status"]; minutesLate: number }
  | { kind: "refused"; code: CheckInErrorCode | "unknown" };

/** The server's refusal code, parsed — never read off the body by cast (X10). */
export function checkInRefusalCode(err: unknown): CheckInErrorCode | "unknown" {
  if (!axios.isAxiosError(err)) return "unknown";
  const body = apiErrorBodySchema.safeParse(err.response?.data);
  if (!body.success) return "unknown";
  const code = checkInErrorCodeSchema.safeParse(body.data.error.code);
  return code.success ? code.data : "unknown";
}

interface CheckInCopy {
  title: string;
  message: string | null;
}

/** v1 app/checkin/[token]/page.tsx's words. "After session start" is now TRUE (C3, spec 04 D15). */
export function checkInCopy(outcome: CheckInOutcome): CheckInCopy {
  if (outcome.kind === "checked_in") {
    if (outcome.status === "PRESENT") return { title: "You're checked in!", message: null };
    const m = outcome.minutesLate;
    return { title: "Checked in — late", message: `${m} minute${m === 1 ? "" : "s"} after session start.` };
  }
  switch (outcome.code) {
    case "already_checked_in":
      return { title: "Already checked in", message: "You already checked in to this session." };
    case "invalid_token":
      return { title: "Can't check in", message: "This check-in code is not valid." };
    case "not_open":
      return { title: "Can't check in", message: "Check-in hasn't been opened yet. Ask your leader to open it." };
    case "closed":
      return { title: "Can't check in", message: "Check-in is now closed." };
    case "not_enrolled":
      return { title: "Can't check in", message: "You are not enrolled in this season." };
    default:
      return { title: "Can't check in", message: "Couldn't check you in. Check your connection and try again." };
  }
}

/**
 * "3 of 4 sessions": marked past sessions only (an unmarked row is "No record",
 * not a miss), LATE counts as attended. Null when nothing is marked yet.
 */
export function attendanceTally(rows: MyAttendanceSession[]): { attended: number; total: number } | null {
  const marked = rows.filter((r) => r.status !== null);
  if (marked.length === 0) return null;
  return { attended: marked.filter((r) => r.status !== "ABSENT").length, total: marked.length };
}
