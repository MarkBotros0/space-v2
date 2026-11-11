import { sendDueAssignmentReminders } from "../assignments/reminder";
import { sendDueFollowUpReminders } from "../follow-ups";
import { registerHandler, type ScheduledHandler } from "./registry";

/** The built-in due work, registered when `lib/scheduler` loads. */
const BUILT_IN: ScheduledHandler[] = [
  { name: "follow-ups", run: sendDueFollowUpReminders },
  { name: "assignment-reminders", run: sendDueAssignmentReminders },
];

for (const h of BUILT_IN) registerHandler(h);
