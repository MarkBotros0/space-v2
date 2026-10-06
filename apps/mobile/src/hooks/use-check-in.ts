import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { checkInOpenResponseSchema, checkInStateSchema, type CheckInStateResponse } from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

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
