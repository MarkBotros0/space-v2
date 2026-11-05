/** A session's status chip: v1's `sessionBadge` words on the redesign's chip tones. */
import type { SessionListItem } from "@space/shared";

import { dayCue, sessionBadge } from "../../lib/calendar-grid";
import type { ChipSpec } from "../ui/status-chip";

export function sessionChip(
  s: Pick<SessionListItem, "dayKey" | "attendanceMarked">,
  today: string,
  isStaff: boolean,
): ChipSpec | null {
  const badge = sessionBadge(s, today, isStaff);
  if (badge === null) return null;
  if (badge === "Today") return { tone: "info", label: "Today" };
  // The same relative wording as Today's next-session card, counted in org days.
  if (badge === "Upcoming") return { tone: "neutral", label: dayCue(s.dayKey, today) ?? badge };
  return { tone: badge === "Attendance marked" ? "ok" : "warn", label: badge };
}
