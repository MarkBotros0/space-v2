import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { z } from "zod";
import { sessionQuizItemSchema, type SessionQuizItem } from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

const quizListSchema = z.array(sessionQuizItemSchema);

export function useSessionQuizzes(id: number, enabled: boolean): UseQueryResult<SessionQuizItem[]> {
  return useQuery({
    queryKey: queryKeys.sessions.quizzes(id),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/sessions/${id}/quizzes`);
      return quizListSchema.parse(res.data.data.quizzes);
    },
    enabled,
  });
}
