import type { ReminderAnchor } from "../../generated/prisma/enums";

/** What deciding an assignment's reminder needs: its season, deadline and reminder settings. */
interface ReminderSubject {
  seasonId: number;
  dueAt: Date | null;
  reminderEnabled: boolean;
  reminderDays: number;
  reminderAnchor: ReminderAnchor;
  reminderTime: string;
}

/**
 * When the follow-up reminder goes out: `reminderDays` before the anchor (the
 * season's next session, or the due date) at `reminderTime` on the
 * organisation's clock; null when it is off or has nothing to anchor to.
 * Every assignment write stores the result in `remindAt`.
 *
 * A stub until the reminder task fills it: nothing is scheduled yet.
 */
export async function resolveRemindAt(_assignment: ReminderSubject, _now: Date): Promise<Date | null> {
  return null;
}
