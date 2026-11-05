import type { SessionListItem } from "@space/shared";

import { unmarkedSessions, type NeedsAction } from "../lib/staff-today";
import { useStaffOrgToday } from "./use-dashboard";
import { useCurrentSeasonId, useSeasons } from "./use-seasons";
import { useEngagementStudents } from "./use-reports";
import { useLedSeasonSessions } from "./use-sessions";
import { useSubmissionQueue } from "./use-submission-queue";
import { usePendingInviteCount } from "./use-users";

export interface StaffToday {
  /** ADMIN: [current season]; SUPER: every ACTIVE season. */
  seasonIds: number[];
  /** ADMIN: the current season; SUPER: null. The season param every list Today opens uses. */
  scopeSeasonId: number | null;
  sessions: SessionListItem[];
  /** The org's today from the server; undefined until it answers or if it fails (the device's day then stands in). */
  orgToday: string | undefined;
  needs: NeedsAction;
  isPending: boolean;
  refetch: () => void;
  isRefetching: boolean;
}

type CountQuery = { isError: boolean; isPending: boolean };

/** null while unknown (loading or failed); the number once answered. */
function count(q: CountQuery, value: number | undefined): number | null {
  return q.isError || q.isPending || value === undefined ? null : value;
}

/**
 * Everything the ADMIN / SUPER Today screen needs, from reads that already
 * exist. Counts come from the same queries (same key, same season param) as
 * the lists they open: `pages[0].counts.pending` is the pendingOnly list's
 * own scope (queue-counts.ts counts SUBMITTED over the same `reachable`
 * clause, seasonId included).
 */
export function useStaffToday(role: "ADMIN" | "SUPER"): StaffToday {
  const isSuper = role === "SUPER";
  const current = useCurrentSeasonId();
  const seasons = useSeasons(isSuper);

  const scopeSeasonId = isSuper ? null : current.seasonId;
  const seasonIds = isSuper
    ? (seasons.data ?? []).filter((s) => s.status === "ACTIVE").map((s) => s.id)
    : current.seasonId !== null
      ? [current.seasonId]
      : [];

  const led = useLedSeasonSessions(seasonIds);
  // Never joins isPending / refetch: Today does not wait on it, and a failure changes nothing
  // visible. For ADMIN this is the query AdminToday already reads.
  const { today: orgToday } = useStaffOrgToday(isSuper ? (seasonIds[0] ?? null) : current.seasonId);

  // ADMIN with no season has nothing to count; SUPER's queue has no season.
  const scoped = isSuper || current.seasonId !== null;
  const queue = useSubmissionQueue(
    scopeSeasonId === null ? { pendingOnly: true } : { pendingOnly: true, seasonId: scopeSeasonId },
    scoped,
  );
  const risk = useEngagementStudents(scopeSeasonId, "AT_RISK", scoped);
  const invites = usePendingInviteCount(isSuper);

  // A disabled query reports isPending forever; only an enabled one is loading.
  const queueQ = { isError: queue.isError, isPending: scoped && queue.isPending };
  const riskQ = { isError: risk.isError, isPending: scoped && risk.isPending };

  const seasonsUnknown = isSuper ? seasons.isError || seasons.isPending : current.isError || current.isPending;
  const sessionsUnknown = seasonsUnknown || led.isError || led.isPending;

  const needs: NeedsAction = {
    pendingReview: scoped ? count(queueQ, queue.data?.pages[0]?.counts?.pending) : seasonsUnknown ? null : 0,
    unmarkedSessions: sessionsUnknown ? null : unmarkedSessions(led.sessions, new Date(), orgToday).length,
    atRisk: scoped ? count(riskQ, risk.data?.pages[0]?.total) : seasonsUnknown ? null : 0,
    pendingInvites: isSuper ? count(invites, invites.data) : undefined,
  };

  const isPending =
    (isSuper ? seasons.isPending : current.isPending) ||
    led.isPending ||
    queueQ.isPending ||
    riskQ.isPending ||
    (isSuper && invites.isPending);

  return {
    seasonIds,
    scopeSeasonId,
    sessions: led.sessions,
    orgToday,
    needs,
    isPending,
    isRefetching: led.isRefetching || queue.isRefetching || risk.isRefetching || invites.isRefetching,
    refetch: () => {
      current.refetch();
      if (isSuper) void seasons.refetch();
      led.refetch();
      if (scoped) {
        void queue.refetch();
        void risk.refetch();
      }
      if (isSuper) void invites.refetch();
    },
  };
}
