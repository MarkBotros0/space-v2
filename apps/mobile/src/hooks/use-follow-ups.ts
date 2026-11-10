import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  followUpListSchema,
  followUpSchema,
  mentorSummarySchema,
  type CreateFollowUpBody,
  type FollowUp,
  type MentorSummary,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";
import { apiGet, apiSend } from "../lib/api-request";

/** The mentor's own follow-ups (owner, 2026-11-07). MENTOR only. */
export function useFollowUps(enabled: boolean): UseQueryResult<FollowUp[]> {
  return useQuery({
    queryKey: queryKeys.followUps.mine(),
    queryFn: async () => {
      const res = await apiClient.get("/api/v1/follow-ups");
      return followUpListSchema.parse(res.data.data).followUps;
    },
    enabled,
  });
}

/** The four numbers on the mentor's Home. */
export function useMentorSummary(enabled: boolean): UseQueryResult<MentorSummary> {
  return useQuery({
    queryKey: queryKeys.followUps.summary(),
    queryFn: () => apiGet("/api/v1/me/mentor-summary", mentorSummarySchema),
    enabled,
  });
}

export function useCreateFollowUp(): UseMutationResult<
  FollowUp,
  Error,
  { studentId: number; body: CreateFollowUpBody }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ studentId, body }) =>
      apiSend("post", `/api/v1/students/${studentId}/follow-ups`, body, followUpSchema),
    // Settled: a 409 (already following up) means the cached list is stale too.
    onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.followUps.all }),
  });
}

export function useMarkFollowUpDone(): UseMutationResult<FollowUp, Error, { id: number }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }) => apiSend("post", `/api/v1/follow-ups/${id}/done`, undefined, followUpSchema),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.followUps.all }),
  });
}

/** Open follow-ups past their due date. */
export function isDue(f: FollowUp, now: Date = new Date()): boolean {
  return f.doneAt === null && new Date(f.dueAt).getTime() <= now.getTime();
}
