import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { z } from "zod";
import {
  attendanceRosterRowSchema,
  saveAttendanceResponseSchema,
  type AttendanceEntry,
  type AttendanceRosterRow,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { DASHBOARD_META } from "../lib/dashboard-invalidation";
import { queryKeys } from "../lib/query-keys";

const rosterSchema = z.array(attendanceRosterRowSchema);

export function useAttendanceRoster(
  sessionId: number | null,
): UseQueryResult<AttendanceRosterRow[]> {
  return useQuery({
    queryKey: queryKeys.attendance.roster(sessionId),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/sessions/${sessionId}/attendance`);
      return rosterSchema.parse(res.data.data.roster);
    },
    enabled: sessionId !== null,
  });
}

export function useSaveAttendance(sessionId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    // Spec 19 D24: this write moves a number on some role's Home.
    meta: DASHBOARD_META,
    mutationFn: async (entries: AttendanceEntry[]) => {
      const res = await apiClient.post(`/api/v1/sessions/${sessionId}/attendance`, { entries });
      return saveAttendanceResponseSchema.parse(res.data.data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.attendance.roster(sessionId) });
      // Session lists carry `attendanceMarked`.
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
    },
  });
}

/**
 * The check-in console's single-student override (v1 manualOverrideAction).
 * `consoleOverride` tells the server to skip the low-attendance flag, as v1
 * did (v1 parity 2026-10-09, spec 04 R33); the batch screen above still flags.
 */
export function useOverrideAttendance(sessionId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: DASHBOARD_META,
    mutationFn: async (entry: AttendanceEntry) => {
      const res = await apiClient.post(`/api/v1/sessions/${sessionId}/attendance`, {
        entries: [entry],
        consoleOverride: true,
      });
      return saveAttendanceResponseSchema.parse(res.data.data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.attendance.roster(sessionId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
    },
  });
}
