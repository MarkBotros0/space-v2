import { useInfiniteQuery } from "@tanstack/react-query";
import { submissionQueueSchema, type SubmissionQueue } from "@space/shared";

import { queryKeys } from "../lib/query-keys";
import { apiGet } from "../lib/api-request";

interface QueueFilters {
  pendingOnly: boolean;
  seasonId?: number;
}

async function fetchQueuePage(filters: QueueFilters, cursor?: string): Promise<SubmissionQueue> {
  const params = new URLSearchParams({
    pendingOnly: String(filters.pendingOnly),
    limit: "25",
  });
  if (filters.seasonId !== undefined) params.set("seasonId", String(filters.seasonId));
  if (cursor !== undefined) params.set("cursor", cursor);
  return apiGet(`/api/v1/submissions?${params.toString()}`, submissionQueueSchema);
}

export function useSubmissionQueue(filters: QueueFilters, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: queryKeys.submissions.queue(filters),
    queryFn: ({ pageParam }) => fetchQueuePage(filters, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
  });
}
