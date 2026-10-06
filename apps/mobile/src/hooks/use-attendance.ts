import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { z } from "zod";
import {
  attendanceRosterRowSchema,
  saveAttendanceResponseSchema,
  type AttendanceEntry,
  type AttendanceRosterRow,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
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
