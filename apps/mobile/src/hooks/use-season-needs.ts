import { unmarkedSessions, type NeedsAction } from "../lib/staff-today";
import { useStaffOrgToday } from "./use-dashboard";
import { useEngagementStudents } from "./use-reports";
import { useLedSeasonSessions } from "./use-sessions";
import { useSubmissionQueue } from "./use-submission-queue";

type CountQuery = { isError: boolean; isPending: boolean; value: number | undefined };

/** null while unknown (loading or failed); the number once answered. */
function count(q: CountQuery): number | null {
  return q.isError || q.isPending || q.value === undefined ? null : q.value;
}

/**
 * One season's work queues, for its page (owner, 2026-11-07: Super reaches
 * these from the season, not Home): submissions waiting for review, finished
 * sessions with no attendance, students at risk. The same queries, keys and
 * season param as the lists the tiles open, and as Admin Home's
 * `useStaffToday`, so nothing is fetched twice. `null` disables every read.
 */
export function useSeasonNeeds(seasonId: number | null): {
  needs: NeedsAction;
  isPending: boolean;
  refetch: () => void;
} {
  const on = seasonId !== null;
  const queue = useSubmissionQueue({ pendingOnly: true, seasonId: seasonId ?? 0 }, on);
  const risk = useEngagementStudents(seasonId, "AT_RISK", on);
  const led = useLedSeasonSessions(on ? [seasonId] : []);
  const { today } = useStaffOrgToday(seasonId);

  // A disabled query reports isPending forever; only an enabled one is loading.
  const queueQ = {
    isError: queue.isError,
    isPending: on && queue.isPending,
    value: queue.data?.pages[0]?.counts?.pending,
  };
  const riskQ = { isError: risk.isError, isPending: on && risk.isPending, value: risk.data?.pages[0]?.total };
  const sessionsQ = {
    isError: led.isError,
    isPending: led.isPending,
    value: unmarkedSessions(led.sessions, new Date(), today).length,
  };

  return {
    needs: {
      pendingReview: count(queueQ),
      unmarkedSessions: count(sessionsQ),
      atRisk: count(riskQ),
      // Invites are the community's, not a season's: no tile.
      pendingInvites: undefined,
    },
    isPending: queueQ.isPending || riskQ.isPending || sessionsQ.isPending,
    refetch: () => {
      if (!on) return;
      void queue.refetch();
      void risk.refetch();
      led.refetch();
    },
  };
}
