/** Sessions, attendance and assignments schemas. Assembled into the document by `../openapi.ts`. */
export const sessionsAssignmentsSchemas = {
  SessionListItem: {
    type: "object",
    properties: {
      id: { type: "integer" },
      title: { type: "string" },
      startsAt: { type: "string", format: "date-time" },
      startTime: { type: "string", pattern: "^\\d{2}:\\d{2}$", description: "Org wall-clock start, HH:mm (X13)." },
      dayKey: {
        type: "string",
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
        description:
          "Org-timezone calendar day of startsAt (ruling X13). Group by this, not by formatting startsAt on the device.",
      },
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
      canManageCheckIn: {
        type: "boolean",
        description:
          "Season admins only — the gate check-in-open/close enforce. Group leaders have canMarkAttendance but not this.",
      },
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
        description:
          "Organisation-calendar day of `dueAt` (ORG_TIMEZONE), derived server-side. Label deadlines with this, never by formatting `dueAt` on the device.",
      },
      isOverdue: {
        type: "boolean",
        description:
          "Derived server-side. Do not recompute from `dueAt` on the client — a device in another timezone would disagree with the badge its leader is looking at.",
      },
      partsCount: { type: "integer", description: "How many parts the assignment has." },
      submissionCount: {
        type: "integer",
        description:
          "Season participants who have tapped Submit (`submittedAt` set). The one definition of 'submitted'.",
      },
      expectedCount: {
        type: "integer",
        description:
          "Every participant of the season (SeasonEnrollment is the authority, ruling C9): an assignment is for the whole season.",
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
        description:
          "Organisation-calendar day of `dueAt` (ORG_TIMEZONE), derived server-side. Label and compare deadlines with this (and the dashboard's `todayOrgDay`), never by formatting `dueAt` on the device.",
      },
      status: {
        oneOf: [{ $ref: "#/components/schemas/SubmissionStatus" }, { type: "string", enum: ["PENDING"] }],
      },
      isOverdue: { type: "boolean", description: "Derived server-side." },
      reviewedAt: { type: ["string", "null"], format: "date-time" },
      submittedAt: {
        type: ["string", "null"],
        format: "date-time",
        description: "When they tapped Submit; null before they have, or since an essay was returned.",
      },
      partsTotal: { type: "integer" },
      partsDone: { type: "integer", description: "Parts done by the completion rules; a returned essay is not done." },
      returned: { type: "boolean", description: "A reviewer returned one of the essays." },
    },
  },
  AssignmentDetail: {
    type: "object",
    properties: {
      id: { type: "integer" },
      seasonId: { type: "integer" },
      seasonCode: { type: "string" },
      seasonTitle: { type: "string" },
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
        description:
          "Organisation wall-clock time of `dueAt`, 24-hour `HH:mm`; null when there is no due date. With `dueOrgDay`, exactly what the write body's `dueDay`/`dueTime` take.",
      },
      isOverdue: { type: "boolean", description: "Derived server-side." },
      reminder: {
        type: "object",
        properties: {
          enabled: { type: "boolean" },
          days: { type: "integer", minimum: 1, maximum: 14 },
          anchor: { type: "string", enum: ["NEXT_SESSION", "DUE_DATE"] },
          time: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
        },
      },
      reminderLine: {
        type: ["string", "null"],
        description:
          'When the reminder goes out, on the organisation\'s clock: "Tue 11 Nov, around 9:00 AM — students who haven\'t finished"; "No upcoming session yet — no reminder"; "Too close to the next session — no reminder"; "Sent Tue 11 Nov, around 9:00 AM" once it has gone. Null when it is off.',
      },
      parts: { type: "array", items: { $ref: "#/components/schemas/AssignmentPart" } },
      my: {
        type: ["object", "null"],
        description: "Populated only for a STUDENT: when they submitted, and their work on each part in order.",
        properties: {
          submittedAt: { type: ["string", "null"], format: "date-time" },
          parts: { type: "array", items: { $ref: "#/components/schemas/PartWork" } },
        },
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
    },
  },
  AssignmentPart: {
    type: "object",
    description:
      "A stored part: `id`, `position` and `kind`, then the kind's fields as in `AssignmentPartInput`. A VIDEO also carries `videoId`, the YouTube id.",
    properties: {
      id: { type: "integer" },
      position: { type: "integer" },
      kind: { type: "string", enum: ["VIDEO", "ESSAY", "FORUM"] },
      videoId: { type: ["string", "null"] },
    },
    additionalProperties: true,
  },
  PartWork: {
    type: "object",
    description:
      "One student's work on one part. VIDEO: done once 90% is watched and every timed question answered. ESSAY: done when written within the word range, until a reviewer returns it. FORUM: done once posted. A draft essay or forum post is the student's alone and reads as NOT_STARTED to staff.",
    properties: {
      partId: { type: "integer" },
      kind: { type: "string", enum: ["VIDEO", "ESSAY", "FORUM"] },
      status: { type: "string", enum: ["NOT_STARTED", "IN_PROGRESS", "DONE", "RETURNED"] },
      essay: {
        type: "object",
        properties: {
          publicId: { type: "string", description: "The essay's handle into the review screen." },
          wordCount: { type: "integer" },
          reviewStatus: { $ref: "#/components/schemas/SubmissionStatus" },
          feedback: { type: ["string", "null"] },
        },
      },
      video: {
        type: "object",
        properties: {
          watchedSeconds: { type: "integer" },
          durationSeconds: { type: "integer" },
          answered: { type: "integer" },
          questionCount: { type: "integer" },
          correct: { type: "integer" },
        },
      },
      forum: { type: "object", properties: { posted: { type: "boolean" } } },
    },
  },
  AssignmentWriteRequest: {
    type: "object",
    required: ["title", "description", "dueDay", "dueTime", "reminder", "parts"],
    description:
      "One full-replace body for create (POST) and update (PATCH). There is no `seasonId`: create takes it from the path and an assignment never moves season. There is no session and no group targeting: an assignment is for the whole season.",
    properties: {
      title: { type: "string", minLength: 2, maxLength: 160 },
      description: { type: ["string", "null"], maxLength: 20000 },
      dueDay: {
        type: ["string", "null"],
        format: "date",
        description:
          "Organisation-calendar day the assignment is due; null = no due date. The server composes the instant in ORG_TIMEZONE (ruling C2): a client never sends an instant.",
      },
      dueTime: {
        type: ["string", "null"],
        pattern: "^([01]\\d|2[0-3]):[0-5]\\d$",
        description: "Organisation wall-clock time, 24-hour. Ignored when `dueDay` is null.",
      },
      reminder: {
        type: "object",
        required: ["enabled", "days", "anchor", "time"],
        description: "`days` before the anchor at `time` (org clock). `DUE_DATE` needs a due date (400).",
        properties: {
          enabled: { type: "boolean" },
          days: { type: "integer", minimum: 1, maximum: 14 },
          anchor: { type: "string", enum: ["NEXT_SESSION", "DUE_DATE"] },
          time: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
        },
      },
      parts: {
        type: "array",
        minItems: 1,
        maxItems: 20,
        items: { $ref: "#/components/schemas/AssignmentPartInput" },
        description:
          "Every part, in order; at most one FORUM. On PATCH a part with an `id` keeps its row and the students' work on it, one without is new, a stored part left out is removed. An `id` this assignment doesn't have is 400 `unknown_part`; a part can't change kind (400).",
      },
      confirm: {
        type: "boolean",
        description: "PATCH: re-sent as true to apply an edit the server answered with 409 `needs_confirmation`.",
      },
    },
  },
  AssignmentPartInput: {
    oneOf: [
      {
        type: "object",
        required: ["kind", "title", "youtubeUrl", "blockSkipping", "durationSeconds"],
        properties: {
          id: { type: "integer" },
          kind: { type: "string", enum: ["VIDEO"] },
          title: { type: "string", minLength: 1, maxLength: 200 },
          youtubeUrl: { type: "string", description: "Must parse as a YouTube video; its id is stored." },
          blockSkipping: { type: "boolean" },
          durationSeconds: {
            type: "integer",
            minimum: 1,
            maximum: 43200,
            description: "The length the form's player reports; the server has no YouTube API key.",
          },
        },
      },
      {
        type: "object",
        required: ["kind", "prompt", "minWords", "maxWords", "maxFileSizeMb", "allowedMimeCategories"],
        properties: {
          id: { type: "integer" },
          kind: { type: "string", enum: ["ESSAY"] },
          prompt: { type: "string", minLength: 1, maxLength: 2000 },
          minWords: { type: ["integer", "null"], minimum: 1, maximum: 5000 },
          maxWords: { type: ["integer", "null"], minimum: 1, maximum: 5000, description: "At least `minWords`." },
          maxFileSizeMb: { type: ["integer", "null"], minimum: 1, maximum: 100, description: "Null = no files." },
          allowedMimeCategories: {
            type: "array",
            items: { type: "string", enum: ["image", "pdf", "doc", "audio", "video", "text"] },
            description: "Empty = any type.",
          },
        },
      },
      {
        type: "object",
        required: ["kind", "prompt", "minWords", "postToRead", "allowComments"],
        properties: {
          id: { type: "integer" },
          kind: { type: "string", enum: ["FORUM"] },
          prompt: { type: "string", minLength: 1, maxLength: 2000 },
          minWords: { type: ["integer", "null"], minimum: 1, maximum: 5000 },
          postToRead: { type: "boolean", description: "Group-mates' posts show only after the student's own." },
          allowComments: { type: "boolean" },
        },
      },
    ],
  },
  AssignmentProgress: {
    type: "object",
    properties: {
      rows: {
        type: "array",
        items: {
          type: "object",
          properties: {
            studentUserId: { type: "integer" },
            name: { type: ["string", "null"] },
            avatarPath: { type: ["string", "null"] },
            submittedAt: { type: ["string", "null"], format: "date-time" },
            parts: { type: "array", items: { $ref: "#/components/schemas/PartWork" } },
          },
        },
      },
    },
  },
} as const;
