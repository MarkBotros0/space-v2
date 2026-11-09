/**
 * Database-backed authorization gates: each checks a specific row's ownership
 * or scope before a handler proceeds. Pure predicates over a token's claims
 * live in `../rbac`; these build on them. Grouped by domain — import from this
 * index, never from the part files.
 */
export {
  attendanceScopeFor,
  calendarScopeFor,
  canAccessSeason,
  canManageAssignment,
  canManageSessionVideo,
  canMarkAttendance,
  hasActiveEnrollment,
  staffScopeForSeason,
  type AttendanceScope,
  type CalendarScope,
} from "./season";
export { canAccessGroup } from "./group";
export { canGradeQuiz, canManageQuiz } from "./quiz";
export {
  canReviewSubmission,
  canViewSubmission,
  isHiddenDraft,
  submissionQueueScopeFor,
} from "./submission";
export { canEditStudent, canViewStudent, staffRosterWhere, type StaffRoster } from "./student";
export { canEditNote, canViewNote, canWriteNote, noteSeasonWhere, noteVisibilityWhere } from "./note";
export {
  canCommentOnForumSubmission,
  canDeleteForumComment,
  forumAudienceFor,
  type ForumAudience,
} from "./forum";
export { canExportSeasonWorkbook, reportScopeFor, type ReportScope } from "./report";
export {
  announcementFlags,
  canDeleteAnnouncement,
  canEditAnnouncement,
  canPostTo,
  postTargetsFor,
  type AnnouncementFlags,
  type AnnouncementRowForAuth,
  type PostTarget,
  type PostVerdict,
} from "./announcement";
export {
  canManagePoll,
  canSeePollNames,
  canVotePoll,
  isPollClosed,
} from "./announcement-poll";
