import { z } from "zod";

import { attendanceStatusSchema } from "./enums";

export const attendanceEntrySchema = z.object({
  studentUserId: z.number().int(),
  status: attendanceStatusSchema,
  notes: z.string().max(500).optional().nullable(),
  // Upper bound of 600 (ten hours) is v1's — a larger value is a client bug,
  // not a real lateness.
  lateMinutes: z.number().int().min(0).max(600).optional().nullable(),
});
export type AttendanceEntry = z.infer<typeof attendanceEntrySchema>;

export const saveAttendanceRequestSchema = z.object({
  entries: z.array(attendanceEntrySchema),
});
export type SaveAttendanceRequest = z.infer<typeof saveAttendanceRequestSchema>;
