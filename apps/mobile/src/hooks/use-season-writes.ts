import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import { seasonDeletedResponseSchema, seasonRefResponseSchema } from "@space/shared";
import type { DuplicateSeasonRequest, SeasonAdminPatch, seasonWriteRequestSchema } from "@space/shared";

import { apiSend } from "../lib/api-request";
import { queryKeys } from "../lib/query-keys";

type DuplicateSeasonInput = DuplicateSeasonRequest;

/** ADMIN's allowlist on PATCH /seasons/:id (Plan 3, spec 02 D3) — nothing else is sent. */
export type UpdateSeasonInput = SeasonAdminPatch;

function useInvalidateSeasons() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: queryKeys.seasons.all });
}

export function useCreateSeason() {
  const invalidate = useInvalidateSeasons();
  return useMutation({
    mutationFn: (body: SeasonIdentityInput) => apiSend("post", "/api/v1/seasons", body, seasonRefResponseSchema),
    onSuccess: invalidate,
  });
}

export function useDuplicateSeason(sourceId: number) {
  const invalidate = useInvalidateSeasons();
  return useMutation({
    mutationFn: (body: DuplicateSeasonInput) =>
      apiSend("post", `/api/v1/seasons/${sourceId}/duplicate`, body, seasonRefResponseSchema),
    onSuccess: invalidate,
  });
}

export function useUpdateSeason(id: number) {
  const invalidate = useInvalidateSeasons();
  return useMutation({
    mutationFn: (body: UpdateSeasonInput) => apiSend("patch", `/api/v1/seasons/${id}`, body, seasonRefResponseSchema),
    onSuccess: invalidate,
  });
}

export function useDeleteSeason() {
  const invalidate = useInvalidateSeasons();
  return useMutation({
    mutationFn: (id: number) => apiSend("delete", `/api/v1/seasons/${id}`, undefined, seasonDeletedResponseSchema),
    onSuccess: invalidate,
  });
}

/** SUPER's full-body PATCH input (Plan 3: whole SeasonWriteRequest, title re-derived). */
export type SeasonIdentityInput = z.input<typeof seasonWriteRequestSchema>;

export function useUpdateSeasonAsSuper(id: number) {
  const invalidate = useInvalidateSeasons();
  return useMutation({
    mutationFn: (body: SeasonIdentityInput) => apiSend("patch", `/api/v1/seasons/${id}`, body, seasonRefResponseSchema),
    onSuccess: invalidate,
  });
}
