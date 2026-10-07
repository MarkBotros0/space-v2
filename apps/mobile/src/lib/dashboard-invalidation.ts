/**
 * Tag for every mutation that moves a number on some role's Home (spec 19 §7
 * "Invalidation", D24): attendance marking and check-in, submission submit and
 * review, quiz grading and attempts, assignment writes, enrolment changes,
 * session writes, group assignment. `createQueryClient`'s MutationCache
 * invalidates `queryKeys.dashboard.all` after any successful mutation carrying
 * it — one handler, so a hook cannot invalidate the wrong key.
 *
 * Usage, inside a hook: `useMutation({ mutationFn, meta: DASHBOARD_META, ... })`.
 */
export const DASHBOARD_META = { invalidatesDashboard: true } as const;
