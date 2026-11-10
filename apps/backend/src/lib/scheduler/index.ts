import { MS_PER_MINUTE } from "../org-time";
import { reportError } from "../sentry";
import { claimLease, releaseLease } from "./lease";
import { clearHandlersForTests, getHandlers, registerHandler, type ScheduledHandler } from "./registry";
import "./handlers"; // registers the built-in handlers

export { clearHandlersForTests, registerHandler, type ScheduledHandler };

const LEASE_NAME = "main";
const LEASE_HOLD_MS = 5 * MS_PER_MINUTE;

/** Runs every handler in registration order; a failure is reported and never stops the rest. */
export async function runDueWork(now: Date = new Date()): Promise<Record<string, number | "failed">> {
  const results: Record<string, number | "failed"> = {};
  for (const h of getHandlers()) {
    try {
      results[h.name] = await h.run(now);
    } catch (err) {
      reportError(err, { scheduler: h.name });
      results[h.name] = "failed";
    }
  }
  return results;
}

/** Runs the sweep if this instance wins the lease; "busy" when another holds it. */
export async function maybeRunScheduler(now: Date = new Date()): Promise<"ran" | "busy"> {
  if (!(await claimLease(LEASE_NAME, now, LEASE_HOLD_MS))) return "busy";
  try {
    await runDueWork(now);
    return "ran";
  } finally {
    await releaseLease(LEASE_NAME, new Date());
  }
}
