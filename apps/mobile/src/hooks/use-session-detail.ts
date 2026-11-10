import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { useState } from "react";
import {
  checkInCloseResponseSchema,
  checkInOpenResponseSchema,
  sessionDetailSchema,
  type SessionDetail,
} from "@space/shared";

import { queryKeys } from "../lib/query-keys";
import { apiGet, apiSend } from "../lib/api-request";

export function useSessionDetail(id: number | null): UseQueryResult<SessionDetail> {
  return useQuery({
    queryKey: queryKeys.sessions.detail(id),
    queryFn: () => apiGet(`/api/v1/sessions/${id}`, sessionDetailSchema),
    enabled: id !== null,
  });
}

/**
 * Returns the token alongside the mutation: the open call's response is the
 * freshest copy. After a restart the console reads the same token from the
 * staff session list instead (see CheckInConsole) — the detail endpoint
 * deliberately never serves it.
 */
export function useOpenCheckIn(id: number) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => apiSend("post", `/api/v1/sessions/${id}/check-in-open`, undefined, checkInOpenResponseSchema),
    onSuccess: (data) => {
      setToken(data.checkInToken);
      // sessions.all covers this detail AND the season list rows, whose
      // checkInOpenAt/checkInToken just changed.
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
    },
  });
  return { ...mutation, token };
}

export function useCloseCheckIn(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiSend("post", `/api/v1/sessions/${id}/check-in-close`, undefined, checkInCloseResponseSchema),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all }),
  });
}
