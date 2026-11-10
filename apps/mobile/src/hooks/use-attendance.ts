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
import { loadedId } from "../lib/loaded-id";
import { apiSend } from "../lib/api-request";

const rosterSchema = z.array(attendanceRosterRowSchema);

export function useAttendanceRoster(sessionId: number | null): UseQueryResult<AttendanceRosterRow[]> {
  return useQuery({
    queryKey: queryKeys.attendance.roster(sessionId),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/sessions/${sessionId}/attendance`);
      return rosterSchema.parse(res.data.data.roster);
    },
    enabled: sessionId !== null,
  });
}

export function useSaveAttendance(sessionId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    // Spec 19 D24: this write moves a number on some role's Home.
    meta: DASHBOARD_META,
    mutationFn: (entries: AttendanceEntry[]) =>
      apiSend("post", `/api/v1/sessions/${loadedId(sessionId)}/attendance`, { entries }, saveAttendanceResponseSchema),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.attendance.roster(sessionId) });
      // Session lists carry `attendanceMarked`.
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
      // A student's detail and attendance tab show these marks, and the
      // engagement score counts them.
      void queryClient.invalidateQueries({ queryKey: queryKeys.students.details() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.engagement.all });
    },
  });
}
