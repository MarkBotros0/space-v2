// apps/mobile/src/hooks/use-import.ts
import { useMutation, useQuery, type UseMutationResult, type UseQueryResult } from "@tanstack/react-query";
import {
  groupImportPreviewSchema,
  groupImportResultSchema,
  importTemplateSchema,
  studentImportPreviewSchema,
  studentImportResultSchema,
  type GroupImportCommitInput,
  type GroupImportPreview,
  type GroupImportResult,
  type ImportTemplate,
  type StudentImportCommitInput,
  type StudentImportPreview,
  type StudentImportResult,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

/** The column schema, so the paste step can explain itself without guessing. */
export function useImportTemplate(enabled: boolean): UseQueryResult<ImportTemplate> {
  return useQuery({
    queryKey: queryKeys.imports.template(),
    queryFn: async () => {
      const res = await apiClient.get("/api/v1/imports/students/template");
      // Parse, don't cast — a backend drift fails here, at the boundary,
      // rather than downstream in a render.
      return importTemplateSchema.parse(res.data.data);
    },
    enabled,
    staleTime: Infinity, // it is a constant on the server
  });
}

/**
 * A mutation rather than a query, deliberately. React Query refetches a query
 * on mount, on window focus and on reconnect; re-classifying a paste behind
 * the operator's back while they read the preview would be surprising, and
 * caching it would keep a roster's personal data alive after the screen is
 * gone (D-16.18).
 */
export function useStudentImportPreview(): UseMutationResult<
  StudentImportPreview,
  unknown,
  { text: string; delimiter: "auto" | "comma" | "tab" }
> {
  return useMutation({
    mutationFn: async (input) => {
      const res = await apiClient.post("/api/v1/imports/students/preview", input);
      return studentImportPreviewSchema.parse(res.data.data);
    },
  });
}

export function useStudentImportCommit(): UseMutationResult<
  StudentImportResult,
  unknown,
  StudentImportCommitInput
> {
  return useMutation({
    mutationFn: async (input) => {
      const res = await apiClient.post("/api/v1/imports/students/commit", input);
      return studentImportResultSchema.parse(res.data.data);
    },
  });
}

export function useGroupImportPreview(
  seasonId: number | null,
): UseMutationResult<GroupImportPreview, unknown, { text: string; delimiter: "auto" | "comma" | "tab" }> {
  return useMutation({
    mutationFn: async (input) => {
      if (seasonId === null) throw new Error("No season.");
      const res = await apiClient.post(`/api/v1/seasons/${seasonId}/imports/groups/preview`, input);
      return groupImportPreviewSchema.parse(res.data.data);
    },
  });
}

export function useGroupImportCommit(
  seasonId: number | null,
): UseMutationResult<GroupImportResult, unknown, GroupImportCommitInput> {
  return useMutation({
    mutationFn: async (input) => {
      if (seasonId === null) throw new Error("No season.");
      const res = await apiClient.post(`/api/v1/seasons/${seasonId}/imports/groups/commit`, input);
      return groupImportResultSchema.parse(res.data.data);
    },
  });
}
