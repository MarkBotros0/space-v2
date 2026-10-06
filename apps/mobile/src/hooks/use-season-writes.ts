import { useMutation, useQueryClient } from "@tanstack/react-query";
import { seasonDeletedResponseSchema, seasonRefResponseSchema } from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

export interface CreateSeasonInput {
  code: string;
  program: string;
  year: number;
  startDate: string;
  endDate: string;
  /** The write schema requires it; a new season always starts as a draft. */
  status: "DRAFT";
}

export interface DuplicateSeasonInput {
  year: number;
  startDate: string;
  endDate: string;
  code?: string;
}

/** ADMIN's allowlist on PATCH /seasons/:id (Plan 3, spec 02 D3) — nothing else is sent. */
export interface UpdateSeasonInput {
  description?: string | null;
  absenceBudgetMinutes?: number;
  absenceWeightMinutes?: number;
}

function useInvalidateSeasons() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: queryKeys.seasons.all });
}

export function useCreateSeason() {
  const invalidate = useInvalidateSeasons();
  return useMutation({
    mutationFn: async (body: CreateSeasonInput) => {
      const res = await apiClient.post("/api/v1/seasons", body);
      return seasonRefResponseSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}

export function useDuplicateSeason(sourceId: number) {
  const invalidate = useInvalidateSeasons();
  return useMutation({
    mutationFn: async (body: DuplicateSeasonInput) => {
      const res = await apiClient.post(`/api/v1/seasons/${sourceId}/duplicate`, body);
      return seasonRefResponseSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}

export function useUpdateSeason(id: number) {
  const invalidate = useInvalidateSeasons();
  return useMutation({
    mutationFn: async (body: UpdateSeasonInput) => {
      const res = await apiClient.patch(`/api/v1/seasons/${id}`, body);
      return seasonRefResponseSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}

export function useDeleteSeason() {
  const invalidate = useInvalidateSeasons();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiClient.delete(`/api/v1/seasons/${id}`);
      return seasonDeletedResponseSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}
