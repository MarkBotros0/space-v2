import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import {
  deleteJpcEventResponseSchema,
  jpcEventDetailSchema,
  jpcEventListResponseSchema,
  type CreateJpcEventBody,
  type JpcEventDetail,
  type JpcEventListItem,
  type JpcEventListResponse,
  type UpdateJpcEventBody,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

/**
 * No `from`/`to` from the client.
 *
 * The server defaults the window to [now − 30d, now + 365d]. Deriving calendar
 * bounds on the device would put a wall-clock decision on the wrong side of
 * ruling C2, and v1's unbounded read (every event ever created, on every
 * calendar render) is what the window exists to stop.
 */
export function useEvents(): UseQueryResult<JpcEventListItem[]> {
  return useQuery({
    queryKey: queryKeys.events.list(),
    queryFn: async () => {
      const res = await apiClient.get("/api/v1/events");
      return jpcEventListResponseSchema.parse(res.data.data).events;
    },
  });
}

/**
 * The dashboards' "upcoming events" read (spec 19 §7): today onwards in the org
 * zone, capped server-side, with `total` for the SUPER tile. Built here so
 * Plan 16 composes it unchanged; nothing in this plan renders it.
 */
export function useUpcomingEvents(limit: number): UseQueryResult<JpcEventListResponse> {
  return useQuery({
    queryKey: queryKeys.events.upcoming(limit),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/events?upcoming=true&limit=${limit}`);
      return jpcEventListResponseSchema.parse(res.data.data);
    },
  });
}

export function useEventDetail(id: number | null): UseQueryResult<JpcEventDetail> {
  return useQuery({
    queryKey: queryKeys.events.detail(id ?? -1),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/events/${id}`);
      return jpcEventDetailSchema.parse(res.data.data);
    },
    enabled: id !== null,
  });
}

/**
 * Every write invalidates the whole events subtree, which is what the calendar
 * reads too. v1 revalidates five hardcoded paths and misses /alumni/calendar
 * and all six dashboards (spec 15 R38) — a prefix invalidation cannot have that
 * class of omission.
 */
function useInvalidateEvents() {
  const queryClient = useQueryClient();
  return (): void => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.events.all });
  };
}

export function useCreateEvent() {
  const invalidate = useInvalidateEvents();
  return useMutation({
    mutationFn: async (body: CreateJpcEventBody) => {
      const res = await apiClient.post("/api/v1/events", body);
      return jpcEventDetailSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}

export function useUpdateEvent(id: number) {
  const invalidate = useInvalidateEvents();
  return useMutation({
    mutationFn: async (body: UpdateJpcEventBody) => {
      const res = await apiClient.patch(`/api/v1/events/${id}`, body);
      return jpcEventDetailSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}

export function useDeleteEvent() {
  const invalidate = useInvalidateEvents();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiClient.delete(`/api/v1/events/${id}`);
      return deleteJpcEventResponseSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}
