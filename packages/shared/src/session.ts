import type { AttendanceStatus } from "./enums";

// Wire shapes — see the note in season.ts on why timestamps are strings.

export interface SessionListItem {
  id: number;
  title: string;
  startsAt: string;
  durationMinutes: number;
  location: string | null;
  recurrenceGroupId: string | null;
  attendanceMarked: boolean;
  seasonId: number;
  seasonCode: string;
  seasonTitle: string;
  /**
   * Null for students. Possession of this value authorises a check-in, so the
   * API withholds it from the role that could abuse it.
   */
  checkInToken: string | null;
  checkInOpenAt: string | null;
  checkInClosedAt: string | null;
}

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
