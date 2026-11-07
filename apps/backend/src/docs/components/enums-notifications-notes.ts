import { errorResponse } from "../helpers";

/** Shared enums, notifications, engagement and notes schemas. Assembled into the document by `../openapi.ts`. */
export const enumsNotificationsNotesSchemas = {
  Error: errorResponse,
  UserRole: { type: "string", enum: ["SUPER", "ADMIN", "LEADER", "STUDENT", "MENTOR"] },
  SeasonStatus: { type: "string", enum: ["DRAFT", "ACTIVE", "COMPLETED", "ARCHIVED"] },
  AttendanceStatus: { type: "string", enum: ["PRESENT", "ABSENT", "LATE"] },
  SubmissionStatus: { type: "string", enum: ["DRAFT", "SUBMITTED", "REVIEWED", "RETURNED"] },
  AssignmentType: { type: "string", enum: ["STANDARD", "FORUM"] },

  QuizKind: { type: "string", enum: ["PAPER", "ONLINE"] },
  QuizQuestionType: { type: "string", enum: ["MCQ", "ESSAY"] },
  QuizAttemptStatus: { type: "string", enum: ["IN_PROGRESS", "SUBMITTED", "GRADED"] },
  NotificationTarget: {
    type: "object",
    required: ["entityType", "entityId"],
    description: "Route-independent reference derived server-side from the stored v1 link (spec D1). Clients never parse `link`.",
    properties: {
      entityType: { type: "string", enum: ["assignment", "quiz", "calendar", "student", "submission"] },
      entityId: {
        type: ["integer", "string", "null"],
        description: "A string (the submission's `publicId`) when `entityType` is `submission`; otherwise an integer id, or null for the list-level targets (`quiz`, `calendar`).",
      },
    },
  },
  Notification: {
    type: "object",
    required: ["id", "type", "title", "body", "link", "target", "readAt", "createdAt"],
    properties: {
      id: { type: "integer" },
      type: { type: "string", enum: ["ASSIGNMENT_CREATED", "SUBMISSION_REVIEWED", "SESSION_RESCHEDULED", "LOW_ATTENDANCE_FLAG", "MENTOR_FOLLOWUP", "QUIZ_GRADED", "QUIZ_PUBLISHED", "SUBMISSION_RECEIVED", "SESSION_CANCELLED"] },
      title: { type: "string" },
      body: { type: ["string", "null"] },
      link: { type: ["string", "null"], description: "The raw v1 path, still written for v1's benefit. Render `target`." },
      target: { oneOf: [{ $ref: "#/components/schemas/NotificationTarget" }, { type: "null" }] },
      readAt: { type: ["string", "null"], format: "date-time", description: "Null means unread." },
      createdAt: { type: "string", format: "date-time" },
    },
  },
  NotificationPreferences: {
    type: "object",
    required: ["assignmentCreated", "submissionReviewed", "sessionRescheduled", "lowAttendanceFlag", "mentorFollowup", "quizGraded", "quizPublished", "submissionReceived", "sessionCancelled"],
    description: "One boolean per notification type — all nine keys. A user with no stored row is opted in to everything.",
    properties: {
      assignmentCreated: { type: "boolean" },
      submissionReviewed: { type: "boolean" },
      sessionRescheduled: { type: "boolean" },
      lowAttendanceFlag: { type: "boolean" },
      mentorFollowup: { type: "boolean" },
      quizGraded: { type: "boolean" },
      quizPublished: { type: "boolean" },
      submissionReceived: { type: "boolean" },
      sessionCancelled: { type: "boolean" },
    },
  },
  DeviceRegistration: {
    type: "object",
    required: ["token", "platform"],
    additionalProperties: false,
    properties: {
      token: { type: "string", minLength: 1, maxLength: 200, description: "Expo push token. A credential; never log it." },
      platform: { type: "string", enum: ["ios", "android"] },
    },
  },
  EngagementScore: {
    type: "object",
    required: ["score", "attendancePct", "submissionPct", "attendanceTotal", "attendancePresent", "submissionsExpected", "submissionsCompleted"],
    properties: {
      score: { type: "integer", minimum: 0, maximum: 100, description: "round(attendancePct * 0.5 + submissionPct * 0.5). Staff-only." },
      attendancePct: { type: "integer", minimum: 0, maximum: 100 },
      submissionPct: { type: "integer", minimum: 0, maximum: 100 },
      attendanceTotal: { type: "integer", minimum: 0 },
      attendancePresent: { type: "integer", minimum: 0 },
      submissionsExpected: { type: "integer", minimum: 0 },
      submissionsCompleted: { type: "integer", minimum: 0 },
    },
  },
  StudentEngagement: {
    allOf: [
      { $ref: "#/components/schemas/EngagementScore" },
      {
        type: "object",
        required: ["studentUserId", "seasonId", "seasonTitle", "atRisk"],
        properties: {
          studentUserId: { type: "integer" },
          seasonId: { type: "integer" },
          seasonTitle: { type: ["string", "null"] },
          atRisk: { type: "boolean", description: "The one at-risk definition: a component under 60% with a non-zero denominator." },
        },
      },
    ],
  },
  StudentEngagementDetail: {
    description: "One student's page, staff view: `StudentEngagement` plus their quizzes. Given counts published ONLINE quizzes and PAPER quizzes anyone has been graded on; taken is an ONLINE attempt handed in (SUBMITTED or GRADED) or a PAPER grade. Not part of `score` or `atRisk`.",
    allOf: [
      { $ref: "#/components/schemas/StudentEngagement" },
      {
        type: "object",
        required: ["quizzesGiven", "quizzesTaken", "quizPct"],
        properties: {
          quizzesGiven: { type: "integer", minimum: 0 },
          quizzesTaken: { type: "integer", minimum: 0 },
          quizPct: { type: "integer", minimum: 0, maximum: 100, description: "round(taken / given * 100); 0 when none given." },
        },
      },
    ],
  },
  StudentSelfEngagement: {
    type: "object",
    description: "A student's own view: the two components only. No `score` and no `atRisk` \u2014 deliberately.",
    required: ["attendancePct", "submissionPct", "attendanceTotal", "attendancePresent", "submissionsExpected", "submissionsCompleted", "seasonId", "seasonTitle"],
    properties: {
      attendancePct: { type: "integer", minimum: 0, maximum: 100 },
      submissionPct: { type: "integer", minimum: 0, maximum: 100 },
      attendanceTotal: { type: "integer", minimum: 0 },
      attendancePresent: { type: "integer", minimum: 0 },
      submissionsExpected: { type: "integer", minimum: 0 },
      submissionsCompleted: { type: "integer", minimum: 0 },
      seasonId: { type: "integer" },
      seasonTitle: { type: ["string", "null"] },
    },
  },
  EngagementRow: {
    allOf: [
      { $ref: "#/components/schemas/StudentEngagement" },
      {
        type: "object",
        required: ["studentName", "groupId", "groupName"],
        properties: {
          studentName: { type: "string" },
          groupId: { type: ["integer", "null"] },
          groupName: { type: ["string", "null"] },
        },
      },
    ],
  },
  NoteVisibility: {
    type: "string",
    enum: ["LEADERS", "MENTORS", "ADMINS"],
    description: "Matched by EQUALITY against the reader's role, not a ladder: an ADMIN does not read a LEADERS note.",
  },
  NoteSummary: {
    type: "object",
    required: ["id", "body", "visibility", "followUpFlagged", "createdAt", "updatedAt", "edited", "authorId", "authorName", "authorRole", "seasonId", "seasonTitle", "canEdit"],
    properties: {
      id: { type: "integer" },
      body: { type: "string", description: "PLAIN TEXT, never HTML. The column holds v1's TipTap HTML; the API strips it on read." },
      visibility: { $ref: "#/components/schemas/NoteVisibility" },
      followUpFlagged: { type: "boolean" },
      createdAt: { type: "string", format: "date-time" },
      updatedAt: { type: "string", format: "date-time" },
      edited: { type: "boolean", description: "Server-derived: updatedAt is more than a second after createdAt." },
      authorId: { type: "integer" },
      authorName: { type: "string" },
      authorRole: { $ref: "#/components/schemas/UserRole" },
      seasonId: { type: ["integer", "null"] },
      seasonTitle: { type: ["string", "null"] },
      canEdit: { type: "boolean", description: "Server-derived: the caller is the author. SUPER is not exempt." },
    },
  },
  AuthoredNote: {
    allOf: [
      { $ref: "#/components/schemas/NoteSummary" },
      {
        type: "object",
        required: ["student"],
        properties: {
          student: {
            type: "object",
            required: ["id", "name", "email"],
            properties: { id: { type: "integer" }, name: { type: "string" }, email: { type: "string" } },
          },
        },
      },
    ],
  },
} as const;
