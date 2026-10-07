/**
 * Run a side effect that must never fail the business write that triggered it
 * (spec D6, and 04's D13 from the latency direction).
 *
 * v1 awaits every notification write with no catch, *after* the assignment /
 * session / submission has already committed, so a createMany failure
 * propagates out and the user is told their action failed when it succeeded
 * (R75). They retry, and on the paths that are not idempotent the retry writes
 * a second row. The mirror-image defect is the email half, which is never
 * awaited and never surfaced, so an outage is completely invisible (R20, R21).
 *
 * Two properties, both load-bearing: it never rejects into its caller, and it
 * always logs.
 */
export async function bestEffort(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error(`[best-effort] ${label} failed:`, err instanceof Error ? err.message : err);
  }
}
