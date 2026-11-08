/** Sessions, attendance and assignments schemas. Assembled into the document by `../openapi.ts`. */
export const sessionsAssignmentsSchemas = {
  SessionListItem: {
    type: "object",
    properties: {
      id: { type: "integer" },
      title: { type: "string" },
      startsAt: { type: "string", format: "date-time" },
      startTime: { type: "string", pattern: "^\\d{2}:\\d{2}$", description: "Org wall-clock start, HH:mm (X13)." },
      dayKey: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Org-timezone calendar day of startsAt (ruling X13). Group by this, not by formatting startsAt on the device." },
      durationMinutes: { type: "integer" },
      location: { type: ["string", "null"] },
      recurrenceGroupId: { type: ["string", "null"] },
      attendanceMarked: { type: "boolean" },
      seasonId: { type: "integer" },
      seasonCode: { type: "string" },
      seasonTitle: { type: "string" },
      checkInToken: {
        type: ["string", "null"],
        description:
          "**Always null for a STUDENT.** Possession of this value authorises a check-in, so it is never read from the database for that role.",
      },
      checkInOpenAt: { type: ["string", "null"], format: "date-time" },
      checkInClosedAt: { type: ["string", "null"], format: "date-time" },
    },
  },
  SessionDetail: {
    type: "object",
    description: "Never includes `checkInToken`, for any role.",
    properties: {
      id: { type: "integer" },
      title: { type: "string" },
      description: { type: ["string", "null"] },
      startsAt: { type: "string", format: "date-time" },
      dayKey: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Org-calendar day of startsAt (X13)." },
      startTime: { type: "string", pattern: "^\\d{2}:\\d{2}$", description: "Org wall-clock start, HH:mm (X13)." },
      durationMinutes: { type: "integer" },
      location: { type: ["string", "null"] },
      youtubeUrl: { type: ["string", "null"] },
      recurrenceGroupId: { type: ["string", "null"] },
      seasonId: { type: "integer" },
      seasonCode: { type: "string" },
      seasonTitle: { type: "string" },
      checkInOpen: {
        type: "boolean",
        description:
          "True only while `POST /sessions/check-in` would actually accept a scan: opened, not explicitly closed, and within three hours of opening; for a STUDENT caller, also no earlier than an hour before the session starts. Both endpoints derive this from the same predicate, so the read cannot advertise a window the write refuses.",
      },
      myAttendance: {
        type: ["object", "null"],
        description: "Populated only for a STUDENT.",
        properties: {
          status: { $ref: "#/components/schemas/AttendanceStatus" },
          notes: { type: ["string", "null"] },
          lateMinutes: { type: ["integer", "null"] },
          checkedInAt: { type: ["string", "null"], format: "date-time" },
        },
      },
      canMarkAttendance: { type: "boolean" },
      canManageCheckIn: { type: "boolean", description: "Season admins only — the gate check-in-open/close enforce. Group leaders have canMarkAttendance but not this." },
    },
  },
  AttendanceRosterRow: {
    type: "object",
    properties: {
      studentUserId: { type: "integer" },
      name: { type: ["string", "null"] },
      email: { type: "string", format: "email" },
      groupName: { type: ["string", "null"] },
      status: {
        oneOf: [{ $ref: "#/components/schemas/AttendanceStatus" }, { type: "null" }],
        description: "Null when attendance has not been marked for this student.",
      },
      notes: { type: ["string", "null"] },
      lateMinutes: { type: ["integer", "null"] },
    },
  },
  AttendanceEntry: {
    type: "object",
    required: ["studentUserId", "status"],
    properties: {
      studentUserId: { type: "integer" },
      status: { $ref: "#/components/schemas/AttendanceStatus" },
      notes: { type: ["string", "null"], maxLength: 500 },
      lateMinutes: {
        type: ["integer", "null"],
        minimum: 0,
        maximum: 600,
        description: "Stored only when `status` is LATE; any other status writes null.",
      },
    },
  },

  StaffAssignmentListItem: {
    type: "object",
    description: "Returned to SUPER, ADMIN, LEADER and MENTOR.",
    properties: {
      id: { type: "integer" },
      title: { type: "string" },
      dueAt: { type: ["string", "null"], format: "date-time" },
      dueOrgDay: {
        type: ["string", "null"],
        format: "date",
        description: "Organisation-calendar day of `dueAt` (ORG_TIMEZONE), derived server-side. Label deadlines with this, never by formatting `dueAt` on the device.",
      },
      isOverdue: {
        type: "boolean",
        description:
          "Derived server-side. Do not recompute from `dueAt` on the client — a device in another timezone would disagree with the badge its leader is looking at.",
      },
      isAllGroups: { type: "boolean" },
      targetGroupIds: {
        type: "array",
        items: { type: "integer" },
        description: "Empty when `isAllGroups`.",
      },
      submissionCount: {
        type: "integer",
        description: "Submissions that are not DRAFT. The one definition of 'submitted'.",
      },
      expectedCount: {
        type: "integer",
        description:
          "ACTIVE season enrolments in the targeted groups (SeasonEnrollment is the authority, ruling C9).",
      },
      seasonCode: { type: "string" },
    },
  },
  StudentAssignmentListItem: {
    type: "object",
    description: "Returned to a STUDENT — their own status per assignment.",
    properties: {
      id: { type: "integer" },
      title: { type: "string" },
      dueAt: { type: ["string", "null"], format: "date-time" },
      dueOrgDay: {
        type: ["string", "null"],
        format: "date",
        description: "Organisation-calendar day of `dueAt` (ORG_TIMEZONE), derived server-side. Label and compare deadlines with this (and the dashboard's `todayOrgDay`), never by formatting `dueAt` on the device.",
      },
      status: {
        oneOf: [
          { $ref: "#/components/schemas/SubmissionStatus" },
          { type: "string", enum: ["PENDING"] },
        ],
      },
      isOverdue: { type: "boolean", description: "Derived server-side." },
      reviewedAt: { type: ["string", "null"], format: "date-time" },
      submittedAt: { type: ["string", "null"], format: "date-time", description: "When they last handed it in; null before they ever have." },
    },
  },
  AssignmentDetail: {
    type: "object",
    properties: {
      id: { type: "integer" },
      seasonId: { type: "integer" },
      seasonCode: { type: "string" },
      seasonTitle: { type: "string" },
      sessionId: { type: ["integer", "null"] },
      sessionTitle: { type: ["string", "null"] },
      title: { type: "string" },
      description: { type: ["string", "null"] },
      dueAt: { type: ["string", "null"], format: "date-time" },
      dueOrgDay: {
        type: ["string", "null"],
        format: "date",
        description: "Organisation-calendar day of `dueAt`; null when there is no due date.",
      },
      dueOrgTime: {
        type: ["string", "null"],
        pattern: "^([01]\\d|2[0-3]):[0-5]\\d$",
        description: "Organisation wall-clock time of `dueAt`, 24-hour `HH:mm`; null when there is no due date. With `dueOrgDay`, exactly what the write body's `dueDay`/`dueTime` take.",
      },
      isAllGroups: { type: "boolean" },
      type: { $ref: "#/components/schemas/AssignmentType" },
      forumMinWords: { type: ["integer", "null"] },
      forumAllowComments: { type: "boolean" },
      forumPostToRead: { type: "boolean", description: "True: a student sees group-mates' responses only after posting their own." },
      maxFileSizeMb: { type: ["integer", "null"] },
      allowedMimeCategories: {
        type: "array",
        items: { type: "string", enum: ["image", "pdf", "doc", "audio", "video", "text"] },
        description: "Empty means any MIME type is accepted.",
      },
      isOverdue: { type: "boolean", description: "Derived server-side." },
      groupIds: {
        type: ["array", "null"],
        items: { type: "integer" },
        description:
          "**Null for a STUDENT.** v1 sent the authoring shape so its own page could re-check targeting; that check now runs server-side, so the ids need not travel to the one role that should not enumerate them.",
      },
      canManage: {
        type: "boolean",
        description:
          "Whether this caller may edit or delete the assignment. Drives what the UI offers; never the gate itself.",
      },
      readOnly: {
        type: "boolean",
        description:
          "True for a student whose enrolment is no longer ACTIVE (finished, dropped, alumnus): they can read the assignment and their own work, not change it. False for everyone else.",
      },
      mySubmission: {
        type: ["object", "null"],
        description: "Populated only for a STUDENT.",
        properties: {
          publicId: { type: "string" },
          status: { $ref: "#/components/schemas/SubmissionStatus" },
          submittedAt: { type: ["string", "null"], format: "date-time" },
          reviewedAt: { type: ["string", "null"], format: "date-time" },
          feedback: { type: ["string", "null"] },
          isLate: {
            type: "boolean",
            description:
              "submittedAt is after dueAt. Derived server-side once; v1 recomputed this comparison at five separate render sites.",
          },
        },
      },
    },
  },
  AssignmentTrackerRow: {
    type: "object",
    properties: {
      studentUserId: { type: "integer" },
      name: { type: ["string", "null"] },
      email: { type: "string", format: "email" },
      groupId: { type: ["integer", "null"] },
      groupName: { type: ["string", "null"] },
      status: {
        oneOf: [
          { $ref: "#/components/schemas/SubmissionStatus" },
          { type: "string", enum: ["PENDING"] },
        ],
        description: "PENDING means no Submission row exists.",
      },
      isLate: { type: "boolean" },
      submittedAt: { type: ["string", "null"], format: "date-time" },
      reviewedAt: { type: ["string", "null"], format: "date-time" },
      submissionPublicId: {
        type: ["string", "null"],
        description: "The handle into the review screen; null when nothing was started.",
      },
    },
  },
  AssignmentWriteRequest: {
    type: "object",
    required: ["title", "isAllGroups"],
    description: "One full-replace body for create (POST) and update (PATCH). There is no `seasonId`: create takes it from the path and an assignment never moves season.",
    properties: {
      title: { type: "string", minLength: 2, maxLength: 160 },
      description: { type: ["string", "null"], maxLength: 20000 },
      dueDay: {
        type: ["string", "null"],
        format: "date",
        description: "Organisation-calendar day the assignment is due; null = no due date. The server composes the instant in ORG_TIMEZONE (ruling C2) — a client never sends an instant.",
      },
      dueTime: {
        type: ["string", "null"],
        pattern: "^([01]\\d|2[0-3]):[0-5]\\d$",
        default: "23:59",
        description: "Organisation wall-clock time, 24-hour. Ignored when `dueDay` is null.",
      },
      sessionId: { type: ["integer", "null"], description: "Must be a session of the assignment's season (400 `invalid_session`)." },
      type: { $ref: "#/components/schemas/AssignmentType" },
      forumMinWords: { type: ["integer", "null"], minimum: 0, maximum: 2000, description: "Kept only for FORUM; forced null for STANDARD." },
      forumAllowComments: { type: "boolean", default: false, description: "Kept only for FORUM; forced false for STANDARD." },
      forumPostToRead: { type: "boolean", default: true, description: "FORUM only: a student reads group-mates' responses only after posting their own. Forced true for STANDARD." },
      maxFileSizeMb: { type: ["integer", "null"], minimum: 1, maximum: 100, description: "Null = accepts no files. Forced null for FORUM." },
      allowedMimeCategories: {
        type: "array",
        items: { type: "string", enum: ["image", "pdf", "doc", "audio", "video", "text"] },
        default: [],
        description: "Empty = any type. Forced empty for FORUM.",
      },
      isAllGroups: { type: "boolean" },
      groupIds: {
        type: "array",
        items: { type: "integer" },
        default: [],
        description: "Required non-empty when `isAllGroups` is false; every id must be a group of the assignment's season (400 `invalid_group`). Duplicates collapse. Ignored when `isAllGroups` is true.",
      },
    },
  },
  AssignmentTracker: {
    type: "object",
    properties: {
      assignmentId: { type: "integer" },
      dueAt: { type: ["string", "null"], format: "date-time" },
      isOverdue: { type: "boolean" },
      submittedCount: { type: "integer" },
      expectedCount: { type: "integer" },
      rows: { type: "array", items: { $ref: "#/components/schemas/AssignmentTrackerRow" } },
    },
  },

} as const;
