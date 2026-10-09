import { useQuery } from "@tanstack/react-query";
import { submissionQueueSchema, type SubmissionQueue } from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

export interface QueueFilters {
  pendingOnly: boolean;
  seasonId?: number;
}

/** The server's largest page; fewer round trips for the whole list. */
const PAGE_SIZE = 100;

async function fetchQueuePage(filters: QueueFilters, cursor?: string): Promise<SubmissionQueue> {
  const params = new URLSearchParams({
    pendingOnly: String(filters.pendingOnly),
    limit: String(PAGE_SIZE),
  });
  if (filters.seasonId !== undefined) params.set("seasonId", String(filters.seasonId));
  if (cursor !== undefined) params.set("cursor", cursor);
  const res = await apiClient.get(`/api/v1/submissions?${params.toString()}`);
  return submissionQueueSchema.parse(res.data.data);
}

export type FullSubmissionQueue = Omit<SubmissionQueue, "nextCursor">;

/**
 * The reviewer's whole queue in one list.
 *
 * v1 parity 2026-10-09 (08-submissions R52): v1 loads every row at once
 * (`submissions-query.ts:123-147`, `leader/submissions/page.tsx:12`) — no
 * paging UI. The API still pages, so this follows `nextCursor` until it runs
 * out before handing the list to the screen.
 */
export function useSubmissionQueue(filters: QueueFilters, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.submissions.queue(filters),
    queryFn: async (): Promise<FullSubmissionQueue> => {
      let page = await fetchQueuePage(filters);
      const items = [...page.items];
      // Counts ignore paging, so the first page's figures stand for the list.
      const counts = page.counts;
      while (page.nextCursor !== null) {
        page = await fetchQueuePage(filters, page.nextCursor);
        items.push(...page.items);
      }
      return { items, counts };
    },
    enabled,
  });
}
