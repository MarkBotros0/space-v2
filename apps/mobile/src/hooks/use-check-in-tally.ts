import { attendanceTally } from "../lib/check-in-result";
import { useSessionStore } from "../store/session";
import { useMyAttendance } from "./use-self-service";

/** "3 of 4 sessions" for the success moment; null without a season or any marked session. */
export function useCheckInTally(): { attended: number; total: number } | null {
  const seasonId = useSessionStore((s) => s.scopes?.activeSeasonId ?? null);
  const { data } = useMyAttendance(seasonId);
  return data ? attendanceTally(data.sessions) : null;
}
