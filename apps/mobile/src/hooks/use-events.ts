import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  deleteJpcEventResponseSchema,
  jpcEventDetailSchema,
  jpcEventListResponseSchema,
  jpcEventPageResponseSchema,
  type CreateJpcEventBody,
  type JpcEventDetail,
  type JpcEventListItem,
  type JpcEventListResponse,
  type JpcEventPageResponse,
  type UpdateJpcEventBody,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";
import { apiGet, apiSend } from "../lib/api-request";

/**
 * The calendars' read: every visible event, date ascending, unpaged.
 *
 * No `from`/`to` from the client: with neither the server returns every
 * visible event (v1 parity, R57 REVERT), and deriving calendar bounds on the
 * device would put a wall-clock decision on the wrong side of ruling C2. The
 * events list screen pages instead — {@link useEventPages}.
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

async function fetchEventPage(cursor: string | null): Promise<JpcEventPageResponse> {
  const suffix = cursor === null ? "" : `&cursor=${encodeURIComponent(cursor)}`;
  return apiGet(`/api/v1/events?paged=true${suffix}`, jpcEventPageResponseSchema);
}

/**
 * The /events list (owner decision): cursor-paged, newest first, the server's
 * default page of 25. Under `events.all`, so every event write refreshes it.
 */
export function useEventPages(): UseInfiniteQueryResult<InfiniteData<JpcEventPageResponse>> {
  return useInfiniteQuery({
    queryKey: queryKeys.events.paged(),
    queryFn: ({ pageParam }) => fetchEventPage(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
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
    queryFn: () => apiGet(`/api/v1/events?upcoming=true&limit=${limit}`, jpcEventListResponseSchema),
  });
}

export function useEventDetail(id: number | null): UseQueryResult<JpcEventDetail> {
  return useQuery({
    queryKey: queryKeys.events.detail(id ?? -1),
    queryFn: () => apiGet(`/api/v1/events/${id}`, jpcEventDetailSchema),
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
    mutationFn: (body: CreateJpcEventBody) => apiSend("post", "/api/v1/events", body, jpcEventDetailSchema),
    onSuccess: invalidate,
  });
}

export function useUpdateEvent(id: number) {
  const invalidate = useInvalidateEvents();
  return useMutation({
    mutationFn: (body: UpdateJpcEventBody) => apiSend("patch", `/api/v1/events/${id}`, body, jpcEventDetailSchema),
    onSuccess: invalidate,
  });
}

export function useDeleteEvent() {
  const invalidate = useInvalidateEvents();
  return useMutation({
    mutationFn: (id: number) => apiSend("delete", `/api/v1/events/${id}`, undefined, deleteJpcEventResponseSchema),
    onSuccess: invalidate,
  });
}
