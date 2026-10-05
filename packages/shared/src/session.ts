import { z } from "zod";

import { attendanceStatusSchema, type AttendanceStatus } from "./enums";

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

export const attendanceRosterRowSchema = z.object({
  studentUserId: z.number(),
  name: z.string().nullable(),
  email: z.string(),
  groupName: z.string().nullable(),
  status: attendanceStatusSchema.nullable(),
  notes: z.string().nullable(),
  lateMinutes: z.number().nullable(),
});
export type AttendanceRosterRow = z.infer<typeof attendanceRosterRowSchema>;

export const checkInRequestSchema = z.object({ token: z.string().min(1) });
export type CheckInRequest = z.infer<typeof checkInRequestSchema>;

export const recurrenceScopeSchema = z.enum(["one", "future", "all"]);
export type RecurrenceScope = z.infer<typeof recurrenceScopeSchema>;

/** v1's server schema, verbatim bounds: title 2–120, duration 15–600 min. */
const sessionWriteBase = z.object({
  title: z.string().min(2).max(120),
  startsAt: z.string().datetime({ offset: true }),
  durationMinutes: z.number().int().min(15).max(600),
  location: z.string().max(200).nullish(),
  youtubeUrl: z.string().url().nullish(),
  description: z.string().max(2000).nullish(),
});

export const createSessionRequestSchema = sessionWriteBase.extend({
  seasonId: z.number().int().positive(),
  /** Weekly siblings sharing one recurrenceGroupId. v1 clamped to 26 silently; refusing is honest. */
  repeatWeeks: z.number().int().min(1).max(26).default(1),
});
export type CreateSessionBody = z.output<typeof createSessionRequestSchema>;

export const updateSessionRequestSchema = sessionWriteBase.extend({
  scope: recurrenceScopeSchema,
});
export type UpdateSessionBody = z.output<typeof updateSessionRequestSchema>;

export const deleteSessionRequestSchema = z.object({
  scope: recurrenceScopeSchema.default("one"),
  /**
   * Attendance and video progress are student history; destroying them
   * silently is v1's unreachable delete, not a behaviour anyone chose (ruling
   * C12). Deleting a session that has either requires this acknowledgement.
   */
  force: z.boolean().default(false),
});
export type DeleteSessionBody = z.output<typeof deleteSessionRequestSchema>;
