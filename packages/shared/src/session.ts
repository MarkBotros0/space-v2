import { z } from "zod";

import type { AttendanceStatus } from "./enums";

// Wire shapes — see the note in season.ts on why timestamps are strings.

export const sessionListItemSchema = z.object({
  id: z.number(),
  title: z.string(),
  startsAt: z.string(),
  durationMinutes: z.number(),
  location: z.string().nullable(),
  recurrenceGroupId: z.string().nullable(),
  attendanceMarked: z.boolean(),
  seasonId: z.number(),
  seasonCode: z.string(),
  seasonTitle: z.string(),
  /**
   * Null for students. Possession of this value authorises a check-in, so the
   * API withholds it from the role that could abuse it.
   */
  checkInToken: z.string().nullable(),
  checkInOpenAt: z.string().nullable(),
  checkInClosedAt: z.string().nullable(),
});
export type SessionListItem = z.infer<typeof sessionListItemSchema>;

export interface MyAttendance {
  status: AttendanceStatus;
  notes: string | null;
  lateMinutes: number | null;
  checkedInAt: string | null;
}

export interface SessionDetail {
  id: number;
  title: string;
  description: string | null;
  startsAt: string;
  durationMinutes: number;
  location: string | null;
  youtubeUrl: string | null;
  recurrenceGroupId: string | null;
  seasonId: number;
  seasonCode: string;
  seasonTitle: string;
  checkInOpen: boolean;
  /** Present only for students; null for everyone else. */
  myAttendance: MyAttendance | null;
  canMarkAttendance: boolean;
}

export interface AttendanceRosterRow {
  studentUserId: number;
  name: string | null;
  email: string;
  groupName: string | null;
  status: AttendanceStatus | null;
  notes: string | null;
  lateMinutes: number | null;
}

export const checkInRequestSchema = z.object({ token: z.string().min(1) });
export type CheckInRequest = z.infer<typeof checkInRequestSchema>;
