import { sendDueFollowUpReminders } from "../follow-ups";
import { registerHandler, type ScheduledHandler } from "./registry";

/** The built-in due work, registered when `lib/scheduler` loads. */
const BUILT_IN: ScheduledHandler[] = [{ name: "follow-ups", run: sendDueFollowUpReminders }];

for (const h of BUILT_IN) registerHandler(h);
