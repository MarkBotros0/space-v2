import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  checkInOpenResponseSchema,
  checkInResponseSchema,
  checkInStateSchema,
  type CheckInResponse,
  type CheckInStateResponse,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { DASHBOARD_META } from "../lib/dashboard-invalidation";
import { queryKeys } from "../lib/query-keys";

/**
 * How often an open screen re-reads a session's check-in state. v1's leader
 * page refreshed every 10s while check-in was open
 * (check-in-attendance-list.tsx:58); the student's card uses the same value.
 */
export const LIVE_ROSTER_REFRESH_MS = 10_000;

/** Admin-only check-in state (D-16.9) — the console's token source after a restart. */
export function useCheckInState(id: number, enabled: boolean): UseQueryResult<CheckInStateResponse> {
  return useQuery({
    queryKey: queryKeys.sessions.checkIn(id),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/sessions/${id}/check-in`);
      return checkInStateSchema.parse(res.data.data);
    },
    enabled,
  });
}

/** Same `{ checkInToken }` payload check-in-open returns, so the same schema parses it. */
export function useRegenerateCheckIn(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.post(`/api/v1/sessions/${id}/check-in-regenerate`);
      return checkInOpenResponseSchema.parse(res.data.data);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all }),
  });
}

/**
 * POST /sessions/check-in with a token from the scanner, the code field or a
 * deep link. Parsed (X10). On success every session view (myAttendance,
 * the leader's live roster) and the student's own attendance/budget refetch.
 */
export function useCheckIn(): UseMutationResult<CheckInResponse, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    // Never paused for the network: offline it fails now, into the refusal copy,
    // instead of hanging and then sending the check-in on reconnect, when the
    // student may have left the room.
    networkMode: "always",
    // Spec 19 D24: this write moves a number on some role's Home.
    meta: DASHBOARD_META,
    mutationFn: async (token: string) => {
      const res = await apiClient.post("/api/v1/sessions/check-in", { token });
      return checkInResponseSchema.parse(res.data.data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.me.all });
    },
  });
}
