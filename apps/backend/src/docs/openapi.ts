/**
 * OpenAPI 3.1 description of the whole `/api/v1` surface.
 *
 * Hand-authored rather than generated. The request bodies have Zod schemas in
 * `packages/shared`, but the *responses* are plain TypeScript interfaces (the
 * backend never validates its own output), so there is no single source to
 * generate from. When you change a route, change this document in the same
 * commit — it is the contract the mobile client is written against.
 *
 * Served by `src/routes/docs.ts` at /api/docs (UI) and /api/docs.json (raw).
 */

/** `{ error: { code, message } }` — every failure in the API uses this shape. */
const errorResponse = {
  type: "object",
  required: ["error"],
  properties: {
    error: {
      type: "object",
      required: ["code", "message"],
      properties: {
        code: { type: "string", example: "forbidden" },
        message: { type: "string", example: "You don't have access to this." },
      },
    },
  },
} as const;

/** Wrap a schema in the `{ data: ... }` success envelope. */
function ok(schema: unknown, description: string) {
  return {
    description,
    content: {
      "application/json": {
        schema: {
          type: "object",
          required: ["data"],
          properties: { data: schema },
        },
      },
    },
  };
}

function errRef(ref: string) {
  return { $ref: `#/components/responses/${ref}` };
}

function conflict(description: string) {
  return { description, content: { "application/json": { schema: errorResponse } } };
}

const idParam = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "integer", minimum: 1 },
} as const;

const questionIdParam = {
  name: "questionId",
  in: "path",
  required: true,
  schema: { type: "integer", minimum: 1 },
} as const;

const publicIdParam = {
  name: "publicId",
  in: "path",
  required: true,
  description: "Opaque 10-character submission identifier — not numeric.",
  schema: { type: "string" },
} as const;

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "JPC Space API (space-v2)",
    version: "1.0.0",
    description: [
      "The mobile API for JPC Space.",
      "",
      "This service is a port of the v1 Next.js app's `/api/v1` surface and runs against",
      "**the same database**. Access tokens are interchangeable between the two: same",
      "secret, same `jpc-mobile` audience, same claims, same 15-minute TTL.",
      "",
      "**Envelope.** Success responses are `{ \"data\": ... }`. Failures are",
      "`{ \"error\": { \"code\", \"message\" } }` — including 404s, rate-limit rejections,",
      "and malformed JSON bodies. The one exception is the file-download endpoint, whose",
      "success path returns raw bytes; its error paths still use the envelope.",
      "",
      "**Auth.** Every endpoint except `/health`, `/api/v1/auth/*` requires",
      "`Authorization: Bearer <accessToken>`. Access tokens last 15 minutes; rotate with",
      "`POST /api/v1/auth/refresh`, which also revokes the presented refresh token.",
      "",
      "**Timestamps** are ISO-8601 strings.",
    ].join("\n"),
  },
  servers: [
    { url: "http://localhost:4000", description: "Local development" },
  ],
  tags: [
    { name: "Health", description: "Liveness" },
    { name: "Auth", description: "Login, refresh, logout" },
    { name: "Me", description: "The authenticated user" },
    { name: "Seasons", description: "Seasons and their sub-resources" },
    { name: "Groups", description: "Group detail" },
    { name: "Users", description: "SUPER-only user administration: list, detail, role change, activation, invites" },
    { name: "Students", description: "Student lists, role-shaped detail, profile edits and enrollment transitions" },
    { name: "Sessions", description: "Sessions, attendance, and check-in" },
    { name: "Assignments", description: "Assignment detail, authoring and the submission tracker" },
    { name: "Submissions", description: "Submissions and their files" },
    { name: "Quizzes", description: "Quiz authoring, attempts and grading" },
    { name: "Notifications", description: "The caller's own notification inbox: list, unread count, explicit mark-read" },
    { name: "Video quiz", description: "Interactive session-video questions: student view, ordered answers, progress (authoring and results below)" },
    { name: "Forum", description: "Forum assignments: the group thread, the post that unlocks it, and comments" },
    { name: "Events", description: "JPC events: one token-derived visibility rule, a bounded window, SUPER-only writes (event photos are deferred while uploads are disabled)" },
    { name: "Notes", description: "Pastoral notes about students (sensitive) and engagement scores" },
  ],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Access token from `POST /api/v1/auth/login`.",
      },
    },
    responses: {
      BadRequest: {
        description: "`bad_request` — malformed path parameter or body.",
        content: { "application/json": { schema: errorResponse } },
      },
      Unauthorized: {
        description: "`unauthorized` — missing, malformed, or expired access token.",
        content: { "application/json": { schema: errorResponse } },
      },
      Forbidden: {
        description: "`forbidden` — authenticated, but not permitted to see or change this.",
        content: { "application/json": { schema: errorResponse } },
      },
      NotFound: {
        description: "`not_found` — no such resource, or it is outside your scope.",
        content: { "application/json": { schema: errorResponse } },
      },
      TooManyRequests: {
        description: "`too_many_requests` — auth rate limit exceeded.",
        content: { "application/json": { schema: errorResponse } },
      },
    },
    schemas: {
      VideoQuestionInput: {
        type: "object",
        required: ["atSeconds", "prompt", "options", "correctIndex"],
        properties: {
          atSeconds: { type: "integer", minimum: 0, maximum: 86400 },
          prompt: { type: "string", minLength: 2, maxLength: 500 },
          options: { type: "array", minItems: 2, maxItems: 6, items: { type: "string", minLength: 1, maxLength: 200 } },
          correctIndex: { type: "integer", minimum: 0, description: "Must be a valid index into `options`." },
          points: { type: "integer", minimum: 1, maximum: 100, default: 1 },
        },
      },
      VideoQuestionAdmin: {
        type: "object",
        description: "The authoring row. **Carries `correctIndex`** — never request it from a student screen.",
        required: ["id", "atSeconds", "prompt", "options", "correctIndex", "points", "responseCount"],
        properties: {
          id: { type: "integer" },
          atSeconds: { type: "integer" },
          prompt: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          correctIndex: { type: "integer" },
          points: { type: "integer" },
          responseCount: { type: "integer", description: "Recorded answers (all, not only correct ones)." },
        },
      },
      JpcEventListItem: {
        type: "object",
        description: "Every day and time here is computed on the server in the organisation timezone; the client never derives a day from `date`.",
        required: ["id", "title", "date", "endDate", "dayKey", "endDayKey", "time", "allDay", "url", "visibility", "seasonId", "seasonCode"],
        properties: {
          id: { type: "integer" },
          title: { type: "string" },
          date: { type: "string", format: "date-time", description: "The stored instant — for ordering only." },
          endDate: { type: ["string", "null"], format: "date-time" },
          dayKey: { type: "string", description: "`YYYY-MM-DD`, the organisation day `date` falls on." },
          endDayKey: { type: ["string", "null"] },
          time: { type: ["string", "null"], description: "Organisation wall-clock `HH:mm`; null exactly when `allDay`." },
          allDay: { type: "boolean", description: "Server-derived: `date` is midnight on the organisation clock (there is no column)." },
          url: { type: ["string", "null"] },
          visibility: { type: "string", enum: ["ALL", "ALUMNI_ONLY", "SEASON"] },
          seasonId: { type: ["integer", "null"] },
          seasonCode: { type: ["string", "null"] },
        },
      },
      JpcEventDetail: {
        description: "A list item plus the fields v1 never displayed (it has no event detail page).",
        allOf: [
          { $ref: "#/components/schemas/JpcEventListItem" },
          {
            type: "object",
            required: ["description", "seasonTitle", "canManage"],
            properties: {
              description: { type: ["string", "null"] },
              seasonTitle: { type: ["string", "null"] },
              canManage: { type: "boolean", description: "Drives the UI; the gate is enforced server-side regardless." },
            },
          },
        ],
      },
      CreateJpcEventRequest: {
        type: "object",
        description: "Wall-clock fields in the organisation timezone — the request carries no zone and the server composes the instant.",
        required: ["title", "day", "visibility"],
        properties: {
          title: { type: "string", minLength: 1, maxLength: 200 },
          day: { type: "string", description: "`YYYY-MM-DD`." },
          time: { type: ["string", "null"], description: "`HH:mm`; null (default) means all-day, stored as organisation midnight." },
          endDay: { type: ["string", "null"], description: "`YYYY-MM-DD`, on or after `day`; stored at organisation midnight." },
          description: { type: ["string", "null"], maxLength: 2000 },
          url: { type: ["string", "null"], format: "uri" },
          visibility: { type: "string", enum: ["ALL", "ALUMNI_ONLY", "SEASON"] },
          seasonId: { type: ["integer", "null"], description: "Required when `visibility` is SEASON; ignored (nulled) otherwise." },
        },
      },
      UpdateJpcEventRequest: {
        type: "object",
        description: "Every field optional. The patch is merged onto the stored row (read back as wall-clock fields) and both refinements re-run against the merged result.",
        properties: {
          title: { type: "string", minLength: 1, maxLength: 200 },
          day: { type: "string" },
          time: { type: ["string", "null"] },
          endDay: { type: ["string", "null"] },
          description: { type: ["string", "null"], maxLength: 2000 },
          url: { type: ["string", "null"], format: "uri" },
          visibility: { type: "string", enum: ["ALL", "ALUMNI_ONLY", "SEASON"] },
          seasonId: { type: ["integer", "null"] },
        },
      },
      VideoQuizResults: {
        type: "object",
        required: ["questionCount", "totalPoints", "rows"],
        properties: {
          questionCount: { type: "integer" },
          totalPoints: { type: "integer" },
          rows: {
            type: "array",
            items: {
              type: "object",
              required: ["studentUserId", "studentName", "groupId", "groupName", "answeredCount", "questionCount", "earnedPoints", "totalPoints", "completedAt"],
              properties: {
                studentUserId: { type: "integer" },
                studentName: { type: ["string", "null"] },
                groupId: { type: ["integer", "null"] },
                groupName: { type: ["string", "null"] },
                answeredCount: { type: "integer" },
                questionCount: { type: "integer" },
                earnedPoints: { type: "integer" },
                totalPoints: { type: "integer" },
                completedAt: { type: ["string", "null"], format: "date-time" },
              },
            },
          },
        },
      },
      StudentVideoQuiz: {
        type: "object",
        description:
          "The student's view of a session's video quiz. **`correctIndex` is absent from every question by design** (the answer-key split): the select list never reads it and the mobile schema is strict. It is returned only by the answer endpoint, for the question just answered.",
        required: ["videoId", "youtubeUrl", "questions", "furthestSeconds", "completedAt", "earnedPoints", "totalPoints", "answeredCount", "nextQuestionId"],
        properties: {
          videoId: { type: ["string", "null"], description: "Resolved server-side from `Session.youtubeUrl`; null when missing or unparseable." },
          youtubeUrl: { type: ["string", "null"] },
          questions: {
            type: "array",
            items: {
              type: "object",
              required: ["id", "atSeconds", "prompt", "options", "points", "answered", "selectedIndex", "isCorrect"],
              properties: {
                id: { type: "integer" },
                atSeconds: { type: "integer" },
                prompt: { type: "string" },
                options: { type: "array", items: { type: "string" } },
                points: { type: "integer" },
                answered: { type: "boolean" },
                selectedIndex: { type: ["integer", "null"] },
                isCorrect: { type: ["boolean", "null"] },
              },
            },
          },
          furthestSeconds: { type: "integer" },
          completedAt: { type: ["string", "null"], format: "date-time" },
          earnedPoints: { type: "integer" },
          totalPoints: { type: "integer" },
          answeredCount: { type: "integer" },
          nextQuestionId: { type: ["integer", "null"], description: "The only question the server will accept an answer for next (earliest unanswered by `atSeconds`, `id` tiebreak); null when all are answered." },
        },
      },
      SubmitVideoAnswerRequest: {
        type: "object",
        required: ["questionId", "selectedIndex"],
        properties: {
          questionId: { type: "integer", minimum: 1 },
          selectedIndex: { type: "integer", minimum: 0, description: "Checked against the stored option count, not a client value." },
        },
      },
      SubmitVideoAnswerResponse: {
        type: "object",
        required: ["isCorrect", "correctIndex", "furthestSeconds", "completedAt", "nextQuestionId"],
        properties: {
          isCorrect: { type: "boolean" },
          correctIndex: { type: "integer", description: "Returned for the question just answered, and only then. Safe because the first answer is final." },
          furthestSeconds: { type: "integer" },
          completedAt: { type: ["string", "null"], format: "date-time" },
          nextQuestionId: { type: ["integer", "null"] },
        },
      },
      VideoProgressRequest: {
        type: "object",
        required: ["furthestSeconds"],
        description: "There is no `completed` field: any extra key is ignored. Completion is derived by the server when the last question is answered.",
        properties: { furthestSeconds: { type: "integer", minimum: 0, maximum: 86400 } },
      },
      ForumOwnResponse: {
        type: "object",
        description: "The caller's own post. With no submission row in existence (nothing creates one on read) `submissionPublicId` is null, `status` DRAFT and `posted` false.",
        required: ["submissionPublicId", "text", "status", "wordCount", "posted", "feedback", "reviewedAt"],
        properties: {
          submissionPublicId: { type: ["string", "null"] },
          text: { type: "string", description: "Plain text. Stored as HTML for v1's renderer and converted at this boundary in both directions." },
          status: { $ref: "#/components/schemas/SubmissionStatus" },
          wordCount: { type: "integer" },
          posted: { type: "boolean" },
          feedback: { type: ["string", "null"], description: "A reviewer's verdict, as plain text. v1's forum screen never rendered it." },
          reviewedAt: { type: ["string", "null"], format: "date-time" },
        },
      },
      ForumComment: {
        type: "object",
        required: ["id", "authorUserId", "authorDisplayName", "body", "createdAt", "canDelete"],
        properties: {
          id: { type: "integer" },
          authorUserId: { type: "integer" },
          authorDisplayName: { type: "string", description: "`name`, or the literal \"Group member\". Never an email address." },
          body: { type: "string", description: "Plain text, rendered as plain text." },
          createdAt: { type: "string", format: "date-time" },
          canDelete: { type: "boolean", description: "Authoritative: computed from the same gate as DELETE. The client must not re-derive it." },
        },
      },
      ForumPost: {
        type: "object",
        required: ["submissionPublicId", "studentUserId", "authorDisplayName", "text", "submittedAt", "commentCount", "comments", "canComment"],
        properties: {
          submissionPublicId: { type: "string" },
          studentUserId: { type: "integer" },
          authorDisplayName: { type: "string" },
          text: { type: "string", description: "Plain text." },
          submittedAt: { type: ["string", "null"], format: "date-time" },
          commentCount: { type: "integer" },
          comments: { type: "array", items: { $ref: "#/components/schemas/ForumComment" }, description: "The first three, oldest first. The rest come from the comments endpoint." },
          canComment: { type: "boolean" },
        },
      },
      ForumView: {
        type: "object",
        required: ["assignmentId", "dueAt", "own", "locked", "minWords", "allowComments", "groupId", "posts", "nextCursor"],
        properties: {
          assignmentId: { type: "integer" },
          dueAt: { type: ["string", "null"], format: "date-time" },
          own: { oneOf: [{ $ref: "#/components/schemas/ForumOwnResponse" }, { type: "null" }], description: "Null for a staff reader." },
          locked: { type: "boolean", description: "A product mechanic, not an error: a student sees no peer's work until their own response is posted. Staff are never locked." },
          minWords: { type: ["integer", "null"] },
          allowComments: { type: "boolean" },
          groupId: { type: ["integer", "null"], description: "Null for a staff reader seeing every group." },
          posts: { type: "array", items: { $ref: "#/components/schemas/ForumPost" } },
          nextCursor: { type: ["string", "null"], description: "The last returned post's `publicId`." },
        },
      },
      SubmitForumResponseRequest: {
        type: "object",
        required: ["text"],
        properties: { text: { type: "string", minLength: 1, maxLength: 20000, description: "Plain text. At least one word regardless of `forumMinWords`, so an empty post cannot unlock the feed." } },
      },
      AddForumCommentRequest: {
        type: "object",
        required: ["body"],
        properties: { body: { type: "string", minLength: 1, maxLength: 5000, description: "Plain text; trimmed." } },
      },
      ForumCommentsPage: {
        type: "object",
        required: ["comments", "nextCursor"],
        properties: {
          comments: { type: "array", items: { $ref: "#/components/schemas/ForumComment" } },
          nextCursor: { type: ["integer", "null"] },
        },
      },
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
          entityType: { type: "string", enum: ["assignment", "quiz", "calendar", "student"] },
          entityId: { type: ["integer", "null"], description: "Null for the list-level targets (`quiz`, `calendar`)." },
        },
      },
      Notification: {
        type: "object",
        required: ["id", "type", "title", "body", "link", "target", "readAt", "createdAt"],
        properties: {
          id: { type: "integer" },
          type: { type: "string", enum: ["ASSIGNMENT_CREATED", "SUBMISSION_REVIEWED", "SESSION_RESCHEDULED", "LOW_ATTENDANCE_FLAG", "MENTOR_FOLLOWUP", "QUIZ_GRADED"] },
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
        required: ["assignmentCreated", "submissionReviewed", "sessionRescheduled", "lowAttendanceFlag", "mentorFollowup", "quizGraded"],
        description: "One boolean per notification type — all six keys. A user with no stored row is opted in to everything.",
        properties: {
          assignmentCreated: { type: "boolean" },
          submissionReviewed: { type: "boolean" },
          sessionRescheduled: { type: "boolean" },
          lowAttendanceFlag: { type: "boolean" },
          mentorFollowup: { type: "boolean" },
          quizGraded: { type: "boolean" },
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
      CreateQuizRequest: {
        type: "object",
        required: ["seasonId", "title", "kind"],
        properties: {
          seasonId: { type: "integer", minimum: 1 },
          sessionId: { type: ["integer", "null"], minimum: 1, description: "Null for a season-level quiz." },
          title: { type: "string", minLength: 1, maxLength: 200 },
          kind: { $ref: "#/components/schemas/QuizKind" },
          maxScore: { type: "integer", minimum: 1, maximum: 1000, description: "Required for PAPER; rejected for ONLINE." },
        },
      },
      UpdateQuizRequest: {
        type: "object",
        description: "At least one field. `kind` is not accepted.",
        properties: {
          title: { type: "string", minLength: 1, maxLength: 200 },
          maxScore: { type: "integer", minimum: 1, maximum: 1000 },
          sessionId: { type: ["integer", "null"], minimum: 1 },
        },
      },
      QuizSummary: {
        type: "object",
        required: ["id", "title", "kind", "publishedAt", "questionCount", "maxScore", "sessionId", "sessionTitle", "sessionDate", "seasonId", "seasonCode", "gradedCount", "studentCount"],
        properties: {
          id: { type: "integer" },
          title: { type: "string" },
          kind: { $ref: "#/components/schemas/QuizKind" },
          publishedAt: { type: ["string", "null"], format: "date-time" },
          questionCount: { type: "integer" },
          maxScore: { type: "integer" },
          sessionId: { type: ["integer", "null"] },
          sessionTitle: { type: ["string", "null"] },
          sessionDate: { type: ["string", "null"], format: "date-time" },
          seasonId: { type: "integer" },
          seasonCode: { type: "string" },
          gradedCount: { type: "integer" },
          studentCount: { type: "integer" },
        },
      },
      QuizQuestionAuthoring: {
        type: "object",
        description: "The authoring projection — the only quiz question shape that carries the answer key (`correctIndex`).",
        required: ["id", "order", "type", "prompt", "points", "options", "correctIndex"],
        properties: {
          id: { type: "integer" },
          order: { type: "integer", description: "A 0-based position; renumbered on delete." },
          type: { $ref: "#/components/schemas/QuizQuestionType" },
          prompt: { type: "string" },
          points: { type: "integer" },
          options: { type: "array", items: { type: "string" } },
          correctIndex: { type: ["integer", "null"] },
        },
      },
      QuizQuestionRequest: {
        type: "object",
        required: ["type", "prompt", "points"],
        properties: {
          type: { $ref: "#/components/schemas/QuizQuestionType" },
          prompt: { type: "string", minLength: 2, maxLength: 2000 },
          points: { type: "integer", minimum: 1, maximum: 100 },
          options: { type: "array", maxItems: 6, items: { type: "string", minLength: 1, maxLength: 500 }, description: "MCQ needs at least 2. An ESSAY's options are discarded." },
          correctIndex: { type: ["integer", "null"], minimum: 0, description: "MCQ only; must be a valid index into `options`. Discarded for ESSAY." },
        },
      },
      QuizAuthoringDetail: {
        type: "object",
        description: "Staff projection of a quiz. Carries the answer key (`questions[].correctIndex`).",
        required: ["id", "title", "kind", "seasonId", "seasonCode", "sessionId", "sessionTitle", "publishedAt", "maxScore", "attemptCount", "gradeCount", "canEditStructure", "canManage", "questions"],
        properties: {
          id: { type: "integer" },
          title: { type: "string" },
          kind: { $ref: "#/components/schemas/QuizKind" },
          seasonId: { type: "integer" },
          seasonCode: { type: "string" },
          sessionId: { type: ["integer", "null"] },
          sessionTitle: { type: ["string", "null"] },
          publishedAt: { type: ["string", "null"], format: "date-time" },
          maxScore: { type: "integer" },
          attemptCount: { type: "integer" },
          gradeCount: { type: "integer" },
          canEditStructure: { type: "boolean", description: "`canManage`, ONLINE, and no attempts yet — exactly the condition the question writes enforce." },
          canManage: { type: "boolean", description: "SUPER or admin of the quiz's season (authoring and publishing); a grading-only leader gets false." },
          questions: { type: "array", items: { $ref: "#/components/schemas/QuizQuestionAuthoring" } },
        },
      },
      QuizQuestionStudent: {
        type: "object",
        description: "The student projection of a question. **There is no `correctIndex` field** — not null, not optional; it is a different shape from `QuizQuestionAuthoring`.",
        required: ["id", "order", "type", "prompt", "points", "options", "selectedIndex", "text", "isCorrect", "pointsAwarded"],
        properties: {
          id: { type: "integer" },
          order: { type: "integer" },
          type: { $ref: "#/components/schemas/QuizQuestionType" },
          prompt: { type: "string" },
          points: { type: "integer" },
          options: { type: "array", items: { type: "string" } },
          selectedIndex: { type: ["integer", "null"] },
          text: { type: ["string", "null"] },
          isCorrect: { type: ["boolean", "null"], description: "Null until an auto-graded submit." },
          pointsAwarded: { type: ["integer", "null"], description: "Null until graded." },
        },
      },
      StudentQuizDetail: {
        type: "object",
        description: "A student's view of an ONLINE quiz and their own attempt. `autoScore`/`manualScore` are deliberately absent; `totalScore` is the only score shown.",
        required: ["id", "title", "kind", "seasonId", "maxScore", "sessionTitle", "attemptId", "attemptNumber", "status", "totalScore", "submittedAt", "gradedAt", "questions"],
        properties: {
          id: { type: "integer" },
          title: { type: "string" },
          kind: { $ref: "#/components/schemas/QuizKind" },
          seasonId: { type: "integer" },
          maxScore: { type: "integer" },
          sessionTitle: { type: ["string", "null"] },
          attemptId: { type: ["integer", "null"], description: "Null until the student starts." },
          attemptNumber: { type: "integer", description: "0 when there is no attempt." },
          status: { oneOf: [{ $ref: "#/components/schemas/QuizAttemptStatus" }, { type: "null" }] },
          totalScore: { type: ["integer", "null"] },
          submittedAt: { type: ["string", "null"], format: "date-time" },
          gradedAt: { type: ["string", "null"], format: "date-time" },
          questions: { type: "array", items: { $ref: "#/components/schemas/QuizQuestionStudent" } },
        },
      },
      QuizGradingAnswer: {
        type: "object",
        description: "Grader-only: carries the answer key by design.",
        required: ["questionId", "type", "prompt", "points", "options", "correctIndex", "selectedIndex", "isCorrect", "text", "pointsAwarded"],
        properties: {
          questionId: { type: "integer" },
          type: { $ref: "#/components/schemas/QuizQuestionType" },
          prompt: { type: "string" },
          points: { type: "integer" },
          options: { type: "array", items: { type: "string" } },
          correctIndex: { type: ["integer", "null"] },
          selectedIndex: { type: ["integer", "null"] },
          isCorrect: { type: ["boolean", "null"] },
          text: { type: ["string", "null"] },
          pointsAwarded: { type: ["integer", "null"] },
        },
      },
      QuizGradingAttempt: {
        type: "object",
        required: ["attemptId", "studentUserId", "studentName", "attemptNumber", "status", "autoScore", "manualScore", "totalScore", "submittedAt", "gradedByName", "answers"],
        properties: {
          attemptId: { type: "integer" },
          studentUserId: { type: "integer" },
          studentName: { type: ["string", "null"] },
          attemptNumber: { type: "integer" },
          status: { $ref: "#/components/schemas/QuizAttemptStatus" },
          autoScore: { type: ["integer", "null"] },
          manualScore: { type: ["integer", "null"] },
          totalScore: { type: ["integer", "null"] },
          submittedAt: { type: ["string", "null"], format: "date-time" },
          gradedByName: { type: ["string", "null"], description: "Who graded it; null for an auto-graded attempt." },
          answers: { type: "array", items: { $ref: "#/components/schemas/QuizGradingAnswer" } },
        },
      },
      QuizGradingPage: {
        type: "object",
        required: ["id", "title", "kind", "maxScore", "hasEssays", "studentCount", "items", "waiting", "nextCursor"],
        properties: {
          id: { type: "integer" },
          title: { type: "string" },
          kind: { $ref: "#/components/schemas/QuizKind" },
          maxScore: { type: "integer" },
          hasEssays: { type: "boolean" },
          studentCount: { type: "integer", description: "The caller's whole student set, not just this page." },
          items: { type: "array", description: "The latest attempt of each student on this page whose attempt is SUBMITTED or GRADED.", items: { $ref: "#/components/schemas/QuizGradingAttempt" } },
          waiting: {
            type: "array",
            description: "Students on this page with no gradable attempt: never started (`startedAt` null) or latest attempt IN_PROGRESS (`startedAt` = when it was opened).",
            items: {
              type: "object",
              required: ["studentUserId", "studentName", "startedAt"],
              properties: {
                studentUserId: { type: "integer" },
                studentName: { type: ["string", "null"] },
                startedAt: { type: ["string", "null"], format: "date-time" },
              },
            },
          },
          nextCursor: { type: ["integer", "null"], description: "A student user id; pages over the caller's student set." },
        },
      },
      QuizGradeRow: {
        type: "object",
        required: ["studentUserId", "studentName", "score", "notes", "gradedAt", "gradedByName"],
        properties: {
          studentUserId: { type: "integer" },
          studentName: { type: ["string", "null"] },
          score: { type: ["integer", "null"] },
          notes: { type: ["string", "null"] },
          gradedAt: { type: ["string", "null"], format: "date-time" },
          gradedByName: { type: ["string", "null"] },
        },
      },
      QuizGradeSheet: {
        type: "object",
        description: "One row per student in the caller's scope, ungraded students included.",
        required: ["id", "title", "kind", "maxScore", "seasonId", "sessionTitle", "studentCount", "rows"],
        properties: {
          id: { type: "integer" },
          title: { type: "string" },
          kind: { $ref: "#/components/schemas/QuizKind" },
          maxScore: { type: "integer" },
          seasonId: { type: "integer" },
          sessionTitle: { type: ["string", "null"] },
          studentCount: { type: "integer" },
          rows: { type: "array", items: { $ref: "#/components/schemas/QuizGradeRow" } },
        },
      },
      StudentQuizResult: {
        type: "object",
        required: ["quizId", "title", "kind", "maxScore", "score", "notes", "gradedAt", "sessionTitle", "sessionDate", "attemptStatus"],
        properties: {
          quizId: { type: "integer" },
          title: { type: "string" },
          kind: { $ref: "#/components/schemas/QuizKind" },
          maxScore: { type: "integer" },
          score: { type: ["integer", "null"] },
          notes: { type: ["string", "null"] },
          gradedAt: { type: ["string", "null"], format: "date-time" },
          sessionTitle: { type: ["string", "null"] },
          sessionDate: { type: ["string", "null"], format: "date-time" },
          attemptStatus: { oneOf: [{ $ref: "#/components/schemas/QuizAttemptStatus" }, { type: "null" }], description: "ONLINE only." },
        },
      },

      Session: {
        type: "object",
        description: "An issued token pair.",
        required: ["accessToken", "expiresIn", "refreshToken"],
        properties: {
          accessToken: { type: "string" },
          expiresIn: { type: "integer", example: 900, description: "Seconds until the access token expires." },
          refreshToken: { type: "string", description: "Opaque; rotated on every refresh." },
        },
      },
      AuthUser: {
        type: "object",
        required: ["id", "name", "email", "role"],
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          email: { type: "string", format: "email" },
          role: { $ref: "#/components/schemas/UserRole" },
        },
      },

      SeasonListItem: {
        type: "object",
        properties: {
          id: { type: "integer" },
          code: { type: "string", example: "gbv-2026" },
          title: { type: "string" },
          program: { type: "string", example: "GBV" },
          year: { type: "integer" },
          status: { $ref: "#/components/schemas/SeasonStatus" },
          startDate: { type: "string", format: "date-time" },
          endDate: { type: "string", format: "date-time" },
        },
      },
      SeasonDetail: {
        type: "object",
        properties: {
          id: { type: "integer" },
          code: { type: "string" },
          title: { type: "string" },
          program: { type: "string" },
          year: { type: "integer" },
          description: { type: ["string", "null"] },
          status: { $ref: "#/components/schemas/SeasonStatus" },
          startDate: { type: "string", format: "date-time" },
          endDate: { type: "string", format: "date-time" },
          sessionCount: { type: "integer" },
          studentCount: { type: "integer" },
          absenceBudgetMinutes: { type: "integer" },
          absenceWeightMinutes: { type: "integer" },
          canAdminister: { type: "boolean", description: "isAdminOfSeason for the caller (C4)." },
          groups: {
            type: "array",
            description: "A STUDENT sees only their own group here.",
            items: {
              type: "object",
              properties: {
                id: { type: "integer" },
                name: { type: "string" },
                studentCount: { type: "integer" },
                leaderNames: { type: "array", items: { type: "string" } },
              },
            },
          },
        },
      },

      SeasonRosterRow: {
        type: "object",
        properties: {
          userId: { type: "integer" },
          name: { type: ["string", "null"] },
          email: { type: "string" },
          groupId: { type: ["integer", "null"], description: "This season's group, from SeasonEnrollment.groupId (C9)." },
          groupName: { type: ["string", "null"] },
          otherSeasonGroup: {
            type: ["object", "null"],
            description: "The student's current group in ANOTHER season. Assigning them here removes it (GroupStudent is globally unique).",
            properties: { groupName: { type: "string" }, seasonCode: { type: "string" } },
          },
        },
      },
      GroupAssignmentsRequest: {
        type: "object",
        required: ["assignments"],
        properties: {
          assignments: {
            type: "array",
            maxItems: 500,
            items: {
              type: "object",
              required: ["studentUserId", "groupId"],
              properties: {
                studentUserId: { type: "integer" },
                groupId: { type: ["integer", "null"], description: "null unassigns from this season's group." },
              },
            },
          },
        },
      },
      GroupListItem: {
        type: "object",
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          description: { type: ["string", "null"] },
          studentCount: {
            type: "integer",
            description:
              "ACTIVE season enrolments naming this group — not GroupStudent rows, which are unique per student across the whole database and so report the current roster whichever season is asked about.",
          },
          leaderNames: { type: "array", items: { type: "string" } },
          seasonId: { type: "integer" },
          seasonCode: { type: "string" },
          seasonTitle: { type: "string" },
        },
      },
      SeasonWriteRequest: {
        type: "object",
        required: ["program", "year", "startDate", "endDate", "status"],
        properties: {
          code: { type: "string", description: "Slugified server-side (v1 rules); defaults to '<program> <year>'. The slug must be 2–40 chars of a-z, 0-9 and inner dashes." },
          program: { type: "string", minLength: 1, maxLength: 60 },
          year: { type: "integer", minimum: 2000, maximum: 2100 },
          description: { type: ["string", "null"], maxLength: 2000 },
          startDate: { type: "string", format: "date-time" },
          endDate: { type: "string", format: "date-time" },
          status: { type: "string", enum: ["DRAFT", "ACTIVE", "COMPLETED", "ARCHIVED"] },
          absenceBudgetMinutes: { type: "integer", minimum: 1, default: 180 },
          absenceWeightMinutes: { type: "integer", minimum: 1, default: 90 },
        },
      },
      GroupWriteRequest: {
        type: "object",
        required: ["name"],
        description:
          "v1's schema covered name and description only — leaderIds and studentIds were read straight off the raw body with no eligibility check. Since a GroupLeader row populates the groupLeaderIds claim, an unvalidated leader list is a privilege path rather than a data-quality problem.",
        properties: {
          name: { type: "string", minLength: 2, maxLength: 80 },
          description: { type: ["string", "null"], maxLength: 2000 },
          leaderIds: {
            type: "array",
            maxItems: 20,
            items: { type: "integer" },
            description: "Must all be users with the LEADER role. Replaces the current set.",
          },
          studentIds: {
            type: "array",
            maxItems: 500,
            items: { type: "integer" },
            description:
              "Must all already be enrolled in the season. Replaces the current roster; a student dropped from the list keeps their enrolment and loses only the group pointer.",
          },
        },
      },
      GroupMember: {
        type: "object",
        required: ["id", "name"],
        properties: {
          id: { type: "integer" },
          name: { type: ["string", "null"] },
          email: {
            type: "string",
            format: "email",
            description:
              "Omitted entirely for a STUDENT caller. A student may read their own group, but v1 only ever put this payload on staff pages — showing every member of a group each other's address is not a change this API makes.",
          },
        },
      },
      GroupDetail: {
        type: "object",
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          description: { type: ["string", "null"] },
          seasonId: { type: "integer" },
          seasonCode: { type: "string" },
          seasonTitle: { type: "string" },
          leaders: { type: "array", items: { $ref: "#/components/schemas/GroupMember" } },
          students: { type: "array", items: { $ref: "#/components/schemas/GroupMember" } },
          canManage: { type: "boolean", description: "isAdminOfSeason for the caller." },
        },
      },

      InviteState: {
        type: "object",
        required: ["issuedAt", "expiresAt", "usedAt", "invitedByName"],
        description: "Invite metadata. There is no token field, ever: the code travels in the invite email only.",
        properties: {
          issuedAt: { type: "string", format: "date-time" },
          expiresAt: { type: "string", format: "date-time" },
          usedAt: { type: ["string", "null"], format: "date-time" },
          invitedByName: { type: ["string", "null"] },
        },
      },

      UserListItem: {
        type: "object",
        required: ["id", "name", "email", "role", "graduationYear", "lastLoginAt", "deletedAt", "status"],
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          email: { type: "string", format: "email" },
          role: { $ref: "#/components/schemas/UserRole" },
          graduationYear: { type: ["integer", "null"] },
          lastLoginAt: { type: ["string", "null"], format: "date-time" },
          deletedAt: { type: ["string", "null"], format: "date-time" },
          status: {
            type: "string",
            enum: ["active", "invited", "pending", "inactive"],
            description: "Derived server-side: inactive (soft-deleted) > active (has a password or has logged in) > invited (live unaccepted invite) > pending.",
          },
        },
      },

      UserDetail: {
        allOf: [
          { $ref: "#/components/schemas/UserListItem" },
          {
            type: "object",
            required: ["invite"],
            properties: { invite: { oneOf: [{ $ref: "#/components/schemas/InviteState" }, { type: "null" }] } },
          },
        ],
      },

      StudentListItem: {
        type: "object",
        required: ["id", "name", "email", "avatarPath", "university", "year", "graduationYear", "activeSeasonTitle", "currentGroupName", "droppedEnrollment"],
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          email: { type: "string" },
          avatarPath: { type: ["string", "null"] },
          university: { type: ["string", "null"] },
          year: { type: ["string", "null"] },
          graduationYear: { type: ["integer", "null"] },
          activeSeasonTitle: { type: ["string", "null"] },
          currentGroupName: { type: ["string", "null"], description: "Advisory: from GroupStudent, the one question that table may answer (C9)." },
          droppedEnrollment: {
            description: "Non-null only on `status=dropped` rows, which are enrollment-keyed — key rows on `enrollmentId`, not the user id.",
            oneOf: [
              {
                type: "object",
                properties: {
                  enrollmentId: { type: "integer" },
                  seasonId: { type: "integer" },
                  seasonTitle: { type: "string" },
                  droppedAt: { type: ["string", "null"], format: "date-time" },
                  dropReason: { type: ["string", "null"] },
                },
              },
              { type: "null" },
            ],
          },
        },
      },

      EnrollmentHistoryItem: {
        type: "object",
        properties: {
          enrollmentId: { type: "integer" },
          seasonId: { type: "integer" },
          seasonCode: { type: "string" },
          seasonTitle: { type: "string" },
          seasonStatus: { $ref: "#/components/schemas/SeasonStatus" },
          startDate: { type: "string", format: "date-time" },
          endDate: { type: "string", format: "date-time" },
          groupName: { type: ["string", "null"], description: "The historic group for that season, from SeasonEnrollment.groupId (C9)." },
          status: { type: "string", enum: ["ACTIVE", "COMPLETED", "WITHDRAWN"] },
          enrolledAt: { type: "string", format: "date-time" },
          completedAt: { type: ["string", "null"], format: "date-time" },
          droppedAt: { type: ["string", "null"], format: "date-time" },
          dropReason: { type: ["string", "null"], description: "Always null for MENTOR and LEADER." },
        },
      },
      StudentDetail: {
        type: "object",
        description:
          "Three role-shaped payloads share this envelope; only `profile` differs. **Fields withheld from a role are absent from the wire, not null.** `public` (MENTOR, LEADER): university, year, gifts, activeSeasonId/Title/Code. `private` (the student themselves): public + phone, dateOfBirth, spiritualBackground. `internal` (SUPER, ADMIN): private + notes. The subject never receives `notes`.",
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          email: { type: "string" },
          avatarPath: { type: ["string", "null"] },
          graduationYear: { type: ["integer", "null"] },
          currentGroup: {
            description: "Advisory current group (GroupStudent).",
            oneOf: [{ type: "object", properties: { id: { type: "integer" }, name: { type: "string" } } }, { type: "null" }],
          },
          enrollments: { type: "array", items: { $ref: "#/components/schemas/EnrollmentHistoryItem" }, description: "`enrolledAt` descending. For a LEADER only the rows naming one of their groups." },
          profile: {
            type: "object",
            properties: {
              university: { type: ["string", "null"] },
              year: { type: ["string", "null"] },
              gifts: { type: ["string", "null"] },
              activeSeasonId: { type: ["integer", "null"] },
              activeSeasonTitle: { type: ["string", "null"] },
              activeSeasonCode: { type: ["string", "null"] },
              phone: { type: ["string", "null"], description: "private and internal shapes only." },
              dateOfBirth: { type: ["string", "null"], format: "date-time", description: "private and internal shapes only." },
              spiritualBackground: { type: ["string", "null"], description: "private and internal shapes only." },
              notes: { type: ["string", "null"], description: "internal shape only (SUPER, ADMIN)." },
            },
          },
        },
      },

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
              "True only while `POST /sessions/check-in` would actually accept a scan: opened, not explicitly closed, and within three hours of opening. Both endpoints derive this from the same predicate, so the read cannot advertise a window the write refuses.",
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
              "ACTIVE season enrolments in the targeted groups — not GroupStudent rows, which are unique per student across all seasons and so cannot answer a per-season question.",
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
          status: {
            oneOf: [
              { $ref: "#/components/schemas/SubmissionStatus" },
              { type: "string", enum: ["PENDING"] },
            ],
          },
          isOverdue: { type: "boolean", description: "Derived server-side." },
          reviewedAt: { type: ["string", "null"], format: "date-time" },
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

      SubmissionFile: {
        type: "object",
        properties: {
          id: { type: "integer" },
          originalName: { type: "string" },
          mimeType: { type: "string" },
          sizeBytes: { type: "integer" },
        },
        description:
          "`storagePath` is deliberately absent. v1's client needed it to build a URL into the endpoint that served any stored file to any logged-in user; here a file is addressed by id scoped to its submission, so the path is the one field that made the old hole exploitable by anyone who saw a response.",
      },
      SubmissionDetail: {
        type: "object",
        properties: {
          id: { type: "integer" },
          publicId: { type: "string" },
          status: { $ref: "#/components/schemas/SubmissionStatus" },
          text: { type: ["string", "null"] },
          feedback: { type: ["string", "null"] },
          submittedAt: { type: ["string", "null"], format: "date-time" },
          reviewedAt: { type: ["string", "null"], format: "date-time" },
          isLate: {
            type: "boolean",
            description:
              "submittedAt is after the assignment's dueAt. Derived server-side once; v1 recomputed this comparison at five separate render sites.",
          },
          assignmentId: { type: "integer" },
          assignmentTitle: { type: "string" },
          assignmentDueAt: { type: ["string", "null"], format: "date-time" },
          assignmentDescription: { type: ["string", "null"] },
          seasonCode: { type: "string" },
          studentUserId: { type: "integer" },
          studentName: { type: ["string", "null"] },
          studentEmail: { type: "string", format: "email" },
          files: { type: "array", items: { $ref: "#/components/schemas/SubmissionFile" } },
          canUploadFiles: {
            type: "boolean",
            description:
              "Whether an upload would currently succeed. False while ENABLE_UPLOADS is off, so a screen can explain the gap rather than offering a control that returns 503. Reading and deleting recorded files are unaffected.",
          },
          canReview: {
            type: "boolean",
            description:
              "Whether this caller may review. Drives what the UI offers, never the gate. False for the author and for a MENTOR, both of whom can read.",
          },
        },
      },
      SubmissionQueueItem: {
        type: "object",
        description: "A reviewer's queue row. Deliberately narrower than the detail.",
        properties: {
          publicId: { type: "string" },
          status: { $ref: "#/components/schemas/SubmissionStatus" },
          submittedAt: { type: ["string", "null"], format: "date-time" },
          isLate: { type: "boolean" },
          assignmentId: { type: "integer" },
          assignmentTitle: { type: "string" },
          assignmentDueAt: { type: ["string", "null"], format: "date-time" },
          seasonCode: { type: "string" },
          studentUserId: { type: "integer" },
          studentName: { type: ["string", "null"] },
          groupId: { type: ["integer", "null"] },
          groupName: { type: ["string", "null"] },
        },
      },
      SubmissionQueue: {
        type: "object",
        properties: {
          items: { type: "array", items: { $ref: "#/components/schemas/SubmissionQueueItem" } },
          nextCursor: {
            type: ["string", "null"],
            description: "Pass as `cursor` for the next page. Null on the last page.",
          },
        },
      },
      SeasonHistoryRow: {
        type: "object",
        additionalProperties: false,
        description: "A past enrollment — attendance % and curriculum ONLY (spec 02 R34: no submissions, feedback or notes, by design).",
        properties: {
          seasonId: { type: "integer" },
          title: { type: "string" },
          startDate: { type: "string", format: "date-time" },
          endDate: { type: "string", format: "date-time" },
          groupName: { type: ["string", "null"] },
          attendancePct: { type: "integer", minimum: 0, maximum: 100 },
          curriculum: {
            type: "array",
            items: {
              type: "object",
              properties: {
                sessionId: { type: "integer" },
                title: { type: "string" },
                startsAt: { type: "string", format: "date-time" },
                dayKey: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Org-calendar day (ruling X13)." },
              },
            },
          },
        },
      },
      MySeason: {
        type: "object",
        properties: {
          id: { type: "integer" },
          code: { type: "string" },
          title: { type: "string" },
          description: { type: ["string", "null"] },
          status: { $ref: "#/components/schemas/SeasonStatus" },
          startDate: { type: "string", format: "date-time" },
          endDate: { type: "string", format: "date-time" },
          progress: {
            type: "object",
            description: "Session-based (R29): completed = startsAt <= now.",
            properties: {
              completedSessions: { type: "integer" },
              totalSessions: { type: "integer" },
              pct: { type: "integer", minimum: 0, maximum: 100 },
            },
          },
          group: {
            type: ["object", "null"],
            description: "From this season's SeasonEnrollment (ruling C9). Leaders carry email; peers never do (R89).",
            properties: {
              id: { type: "integer" },
              name: { type: "string" },
              description: { type: ["string", "null"] },
              leaders: { type: "array", items: { type: "object", properties: { id: { type: "integer" }, name: { type: "string" }, email: { type: "string" } } } },
              members: { type: "array", items: { type: "object", properties: { id: { type: "integer" }, name: { type: "string" }, isYou: { type: "boolean" } } } },
            },
          },
          upcoming: {
            type: "array",
            maxItems: 3,
            items: {
              type: "object",
              properties: {
                id: { type: "integer" },
                title: { type: "string" },
                startsAt: { type: "string", format: "date-time" },
                dayKey: { type: "string" },
                location: { type: ["string", "null"] },
              },
            },
          },
        },
      },
      MyProfile: {
        type: "object",
        additionalProperties: false,
        description: "The caller's own profile. Never carries staff-only notes (spec 06 R23).",
        properties: {
          name: { type: "string" },
          email: { type: "string" },
          avatarPath: { type: ["string", "null"] },
          graduationYear: { type: ["integer", "null"], description: "Non-null = alumnus; the profile is then read-only." },
          activeSeasonTitle: { type: ["string", "null"] },
          university: { type: ["string", "null"] },
          year: { type: ["string", "null"] },
          phone: { type: ["string", "null"] },
          dateOfBirth: { type: ["string", "null"], pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "A calendar date." },
          spiritualBackground: { type: ["string", "null"] },
          gifts: { type: ["string", "null"] },
        },
      },
      MyAttendance: {
        type: "object",
        properties: {
          season: {
            type: ["object", "null"],
            properties: {
              id: { type: "integer" },
              title: { type: "string" },
              absenceBudgetMinutes: { type: "integer" },
              absenceWeightMinutes: { type: "integer" },
            },
          },
          budget: {
            type: ["object", "null"],
            properties: {
              minutesUsed: { type: "integer" },
              budgetMinutes: { type: "integer" },
              budgetPct: { type: "integer", minimum: 0, maximum: 100 },
              remainingPct: { type: "integer", minimum: 0, maximum: 100, description: "max(0, 100 − budgetPct) — 'Absence budget left' (spec 19 D14)." },
              absentCount: { type: "integer" },
              lateCount: { type: "integer" },
            },
          },
          streak: { type: "integer", minimum: 0, description: "Consecutive attended past sessions; ABSENT breaks it, unmarked is skipped." },
          sessions: {
            type: "array",
            description: "Past sessions, newest first.",
            items: {
              type: "object",
              properties: {
                sessionId: { type: "integer" },
                title: { type: "string" },
                startsAt: { type: "string", format: "date-time" },
                dayKey: { type: "string" },
                status: { oneOf: [{ $ref: "#/components/schemas/AttendanceStatus" }, { type: "null" }] },
                checkedInAt: { type: ["string", "null"], format: "date-time" },
                lateMinutes: { type: ["integer", "null"] },
                costMinutes: { type: ["integer", "null"] },
              },
            },
          },
        },
      },
    },
  },

  paths: {
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Liveness plus a database round-trip",
        security: [],
        responses: {
          200: ok({ type: "object", properties: { status: { type: "string", example: "ok" } } }, "Service and database are reachable."),
          503: { description: "Database unreachable.", content: { "application/json": { schema: errorResponse } } },
        },
      },
    },

    "/api/v1/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Exchange credentials for a token pair",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string", minLength: 1 },
                },
              },
            },
          },
        },
        responses: {
          200: ok(
            {
              allOf: [
                { $ref: "#/components/schemas/Session" },
                { type: "object", properties: { user: { $ref: "#/components/schemas/AuthUser" } } },
              ],
            },
            "Authenticated.",
          ),
          400: errRef("BadRequest"),
          401: {
            description: "`invalid_credentials` — deliberately identical whether the email is unknown or the password is wrong.",
            content: { "application/json": { schema: errorResponse } },
          },
          429: errRef("TooManyRequests"),
        },
      },
    },
    "/api/v1/auth/refresh": {
      post: {
        tags: ["Auth"],
        summary: "Rotate a refresh token",
        description: "The presented token is revoked and a fresh pair issued. Reusing a rotated token fails.",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["refreshToken"],
                properties: { refreshToken: { type: "string", minLength: 1 } },
              },
            },
          },
        },
        responses: {
          200: ok({ $ref: "#/components/schemas/Session" }, "A fresh token pair."),
          400: errRef("BadRequest"),
          401: {
            description: "`invalid_token` — unknown, revoked, or expired.",
            content: { "application/json": { schema: errorResponse } },
          },
          429: errRef("TooManyRequests"),
        },
      },
    },
    "/api/v1/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Revoke a refresh token",
        description:
          "Idempotent: an unknown or already-revoked token also returns 200, so the response never discloses whether a token existed.",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["refreshToken"],
                properties: { refreshToken: { type: "string", minLength: 1 } },
              },
            },
          },
        },
        responses: {
          200: ok({ type: "object", properties: { ok: { type: "boolean", example: true } } }, "Revoked, or already was."),
          400: errRef("BadRequest"),
          429: errRef("TooManyRequests"),
        },
      },
    },

    "/api/v1/auth/accept-invite": {
      post: {
        tags: ["Auth"],
        summary: "Accept an invite and set a first password",
        description:
          "Anonymous: possession of the invite code is the authorization, behind its own rate limiter (20 / 15 min per IP). The code is looked up by SHA-256 digest only. Consumed atomically (single use); sets a bcrypt cost-12 password hash. An invite activates an account, it never resets one: a target that already has a password, or is deactivated, is refused. **Every failure is the same `400 invalid_invite` body** (unknown, used, expired, already-activated or deactivated target) so the endpoint is not an existence oracle. Shape violations (missing token, password under 8 characters or over 72 bytes) are `400 bad_request`.",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["token", "password"],
                properties: {
                  token: { type: "string", minLength: 16, maxLength: 128, description: "The code from the invite email." },
                  password: { type: "string", minLength: 8, description: "At most 72 bytes (bcrypt)." },
                },
              },
            },
          },
        },
        responses: {
          200: ok({ type: "object", required: ["ok"], properties: { ok: { type: "boolean", example: true } } }, "Activated; sign in with the new password."),
          400: conflict("`bad_request` (malformed body) or `invalid_invite` (any invite failure)."),
          429: errRef("TooManyRequests"),
        },
      },
    },

    "/api/v1/auth/forgot-password": {
      post: {
        tags: ["Auth"],
        summary: "Request a password-reset code",
        description:
          "Anonymous, behind its own rate limiter (10 / 15 min per IP). **Always answers `{ ok: true }`** for a well-formed body, whether or not the address exists, and the work runs after the response is sent, so neither the body nor the timing reveals the account. A malformed email is `400 bad_request`. Behind the response: nothing is minted for an unknown or deactivated account, or when no mail transport is configured; a second request for the same account within 60 s is ignored; a new code expires the previous one (one live reset per user). The code is v1's format (32 random bytes as 64 hex characters), stored only as its SHA-256 digest, valid for 60 minutes, and is delivered by email only.",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object", required: ["email"], properties: { email: { type: "string", format: "email" } } },
            },
          },
        },
        responses: {
          200: ok({ type: "object", required: ["ok"], properties: { ok: { type: "boolean", example: true } } }, "Acknowledged."),
          400: errRef("BadRequest"),
          429: errRef("TooManyRequests"),
        },
      },
    },

    "/api/v1/auth/reset-password": {
      post: {
        tags: ["Auth"],
        summary: "Complete a password reset",
        description:
          "Anonymous: possession of the code is the authorization (20 / 15 min per IP). Tokens minted by v1 are accepted (same format and storage). The password is validated before the code is looked at, so a weak password consumes nothing. **Every code failure is the same `400 invalid_reset_token`** (unknown, used, expired, or deleted account). On success, in one transaction: a bcrypt cost-12 hash is written, the code is consumed (single use), every other outstanding reset code and live invite is expired, and every refresh token of the account is revoked. A never-activated account may reset, which activates it.",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["token", "password"],
                properties: {
                  token: { type: "string", minLength: 16, maxLength: 256 },
                  password: { type: "string", minLength: 8, description: "At most 72 bytes (bcrypt)." },
                },
              },
            },
          },
        },
        responses: {
          200: ok({ type: "object", required: ["ok"], properties: { ok: { type: "boolean", example: true } } }, "Password set; sign in."),
          400: conflict("`bad_request` (malformed body) or `invalid_reset_token`."),
          429: errRef("TooManyRequests"),
        },
      },
    },

    "/api/v1/auth/logout-all": {
      post: {
        tags: ["Auth"],
        summary: "Revoke every refresh token you hold",
        description:
          "Authenticated (Bearer). Revokes all of the caller's live refresh tokens, including the current device's: the lost-phone lever. Access tokens already issued live out their 15-minute TTL.",
        responses: {
          200: ok({ type: "object", required: ["revoked"], properties: { revoked: { type: "integer", minimum: 0 } } }, "Number of sessions revoked."),
          401: errRef("Unauthorized"),
        },
      },
    },

    "/api/v1/me": {
      get: {
        tags: ["Me"],
        summary: "The authenticated user and their scopes",
        description: "Scopes come from the token's claims, not a fresh database read — they are what this token was minted with. `user` is null when the row is soft-deleted (or gone).",
        responses: {
          200: ok(
            {
              type: "object",
              properties: {
                user: {
                  type: ["object", "null"],
                  properties: {
                    id: { type: "integer" },
                    name: { type: "string" },
                    email: { type: "string", format: "email" },
                    role: { $ref: "#/components/schemas/UserRole" },
                    avatarPath: { type: ["string", "null"] },
                    hasPassword: { type: "boolean", description: "False for an invited account that has never set a password." },
                  },
                },
                scopes: {
                  type: "object",
                  properties: {
                    seasonAdminIds: { type: "array", items: { type: "integer" } },
                    groupLeaderIds: { type: "array", items: { type: "integer" } },
                    activeSeasonId: { type: ["integer", "null"] },
                    graduationYear: {
                      type: ["integer", "null"],
                      description: "Set when a student has graduated; non-null means alumnus.",
                    },
                  },
                },
              },
            },
            "The current user.",
          ),
          401: errRef("Unauthorized"),
        },
      },
      patch: {
        tags: ["Me"],
        summary: "Update your own display name",
        description:
          "Self-scoped: the subject is the token, never the body. A body carrying `userId` (or any unknown key) is a 400. The name is trimmed, 2-120 characters. Returns the updated user.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                additionalProperties: false,
                properties: { name: { type: "string", minLength: 2, maxLength: 120 } },
              },
            },
          },
        },
        responses: {
          200: ok(
            {
              type: "object",
              properties: {
                user: {
                  type: "object",
                  properties: {
                    id: { type: "integer" },
                    name: { type: "string" },
                    email: { type: "string", format: "email" },
                    role: { $ref: "#/components/schemas/UserRole" },
                    avatarPath: { type: ["string", "null"] },
                    hasPassword: { type: "boolean" },
                  },
                },
              },
            },
            "The updated user.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
        },
      },
    },

    "/api/v1/me/season-history": {
      get: {
        tags: ["Me"],
        summary: "The caller's past seasons (students and alumni)",
        description: "Self only. A current student's active season is excluded; an alumnus sees every enrollment. Soft-deleted seasons are hidden.",
        responses: {
          200: ok({ type: "object", properties: { seasons: { type: "array", items: { $ref: "#/components/schemas/SeasonHistoryRow" } } } }, "Past seasons, most recent enrollment first."),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
        },
      },
    },
    "/api/v1/me/season": {
      get: {
        tags: ["Me"],
        summary: "The caller's current season — progress, group, next sessions (students)",
        responses: {
          200: ok({ type: "object", properties: { season: { oneOf: [{ $ref: "#/components/schemas/MySeason" }, { type: "null" }] } } }, "Null when the student has no active season."),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
        },
      },
    },
    "/api/v1/me/attendance": {
      get: {
        tags: ["Me"],
        summary: "The caller's absence budget, streak and past-session attendance (students)",
        responses: {
          200: ok({ $ref: "#/components/schemas/MyAttendance" }, "Empty shape (season null) when there is no active season."),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
        },
      },
    },
    "/api/v1/me/profile": {
      get: {
        tags: ["Me"],
        summary: "The caller's own student profile (students and alumni)",
        responses: {
          200: ok({ type: "object", properties: { profile: { $ref: "#/components/schemas/MyProfile" } } }, "The profile."),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
      patch: {
        tags: ["Me"],
        summary: "Edit the caller's own StudentProfile columns (students; alumni are read-only)",
        description: "PATCH: absent = untouched, '' or null = cleared. Any key outside university/year/phone/dateOfBirth/spiritualBackground/gifts is refused 403 forbidden_field — name is PATCH /me, email is staff-only.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  university: { type: ["string", "null"], maxLength: 160 },
                  year: { type: ["string", "null"], maxLength: 40 },
                  phone: { type: ["string", "null"], maxLength: 60 },
                  dateOfBirth: { type: ["string", "null"], pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
                  spiritualBackground: { type: ["string", "null"], maxLength: 4000 },
                  gifts: { type: ["string", "null"], maxLength: 2000 },
                },
              },
            },
          },
        },
        responses: {
          200: ok({ type: "object", properties: { profile: { $ref: "#/components/schemas/MyProfile" } } }, "The updated profile."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
    },
    "/api/v1/me/password": {
      post: {
        tags: ["Me"],
        summary: "Change your password and evict other sessions",
        description:
          "Verifies `currentPassword`, writes a bcrypt cost-12 hash and revokes every refresh token of the caller in one transaction, **except** the one whose raw value is sent as `refreshToken` (this device). Omit `refreshToken` and every session is revoked. A wrong current password is `400 incorrect_password` (deliberately not 401, which the mobile client reads as an expired access token). An invited account with no password is `409 no_password`. Rate limited (10 / 15 min per IP); 429 uses the standard envelope. New password: 8+ characters, at most 72 bytes. Also expires any outstanding password-reset codes.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["currentPassword", "newPassword"],
                additionalProperties: false,
                properties: {
                  currentPassword: { type: "string", minLength: 1 },
                  newPassword: { type: "string", minLength: 8 },
                  refreshToken: { type: "string", description: "The caller's own refresh token, spared from the sweep." },
                },
              },
            },
          },
        },
        responses: {
          200: ok(
            {
              type: "object",
              required: ["ok", "sessionsRevoked"],
              properties: { ok: { type: "boolean", example: true }, sessionsRevoked: { type: "integer", minimum: 0 } },
            },
            "Changed.",
          ),
          400: conflict("`bad_request` (malformed body) or `incorrect_password`."),
          401: errRef("Unauthorized"),
          409: conflict("`no_password`."),
          429: errRef("TooManyRequests"),
        },
      },
    },

    "/api/v1/seasons": {
      get: {
        tags: ["Seasons"],
        summary: "Seasons visible to the caller",
        description:
          "SUPER and MENTOR see all; ADMIN sees their scoped seasons; LEADER sees seasons containing a group they lead; STUDENT sees seasons they are enrolled in. Filtering happens in the query, so a season you cannot see is never read.",
        responses: {
          200: ok(
            {
              type: "object",
              properties: {
                seasons: { type: "array", items: { $ref: "#/components/schemas/SeasonListItem" } },
              },
            },
            "Visible seasons, newest year first.",
          ),
          401: errRef("Unauthorized"),
        },
      },
      post: {
        tags: ["Seasons"],
        summary: "Create a season",
        description:
          "SUPER only (spec 02 D3). Title is derived as '<program> <year>'. Unlike v1, the absence budget fields are persisted on create (D1). A soft-deleted season still reserves its code.",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/SeasonWriteRequest" } } } },
        responses: {
          201: ok({ type: "object", properties: { id: { type: "integer" }, code: { type: "string" } } }, "Created."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          409: conflict("`code_taken` — the slugified code is in use (also returned for the unique-index race, D15; D15's generic `conflict` is deliberately more specific here)."),
        },
      },
    },
    "/api/v1/seasons/{id}": {
      get: {
        tags: ["Seasons"],
        summary: "Season detail with counts and groups",
        parameters: [idParam],
        responses: {
          200: ok({ $ref: "#/components/schemas/SeasonDetail" }, "The season."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
      patch: {
        tags: ["Seasons"],
        summary: "Update a season",
        description:
          "Asymmetric by role (spec 02 D3). SUPER sends the full SeasonWriteRequest (v1's whole-body update; title re-derived). A season ADMIN sends a partial body containing only `description`, `absenceBudgetMinutes`, `absenceWeightMinutes`; any other key is refused with 403 `forbidden_field` rather than stripped.",
        parameters: [idParam],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/SeasonWriteRequest" } } } },
        responses: {
          200: ok({ type: "object", properties: { id: { type: "integer" }, code: { type: "string" } } }, "Updated."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: conflict("`forbidden` (not SUPER, not this season's ADMIN) or `forbidden_field` (ADMIN sent an identity field)."),
          404: errRef("NotFound"),
          409: conflict("`code_taken`."),
        },
      },
      delete: {
        tags: ["Seasons"],
        summary: "Soft-delete a season",
        description:
          "SUPER only. Refused with 409 `season_in_use` while the season has any enrollment or session — archive it instead (decision on spec 02 D4). On success clears every StudentProfile.activeSeasonId pointing at it, in the same transaction.",
        parameters: [idParam],
        responses: {
          200: ok({ type: "object", properties: { deleted: { type: "boolean" } } }, "Deleted."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
          409: conflict("`season_in_use`."),
        },
      },
    },
    "/api/v1/seasons/{id}/duplicate": {
      post: {
        tags: ["Seasons"],
        summary: "Duplicate a season's structure",
        description:
          "SUPER only. Creates a DRAFT season copying program, description and the budget fields; groups (name/description only — leaders and students are NOT copied), sessions and non-deleted assignments, every date shifted by (startDate − source.startDate), assignment sessionIds and group targets remapped to the clones. Recurrence series get FRESH ids (v1 copied them, letting series edits cross seasons — ruling C10). `code` defaults to slugify('<program> <year>'). A soft-deleted source is 404.",
        parameters: [idParam],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["year", "startDate", "endDate"],
                properties: {
                  year: { type: "integer", minimum: 2000, maximum: 2100 },
                  code: { type: "string" },
                  startDate: { type: "string", format: "date-time" },
                  endDate: { type: "string", format: "date-time" },
                },
              },
            },
          },
        },
        responses: {
          201: ok({ type: "object", properties: { id: { type: "integer" }, code: { type: "string" } } }, "Created."),
          400: conflict("`bad_request` or `invalid_code` (the derived slug is not a valid season code)."),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
          409: conflict("`code_taken`."),
        },
      },
    },
    "/api/v1/seasons/by-code/{code}": {
      get: {
        tags: ["Seasons"],
        summary: "Season detail by code",
        description:
          "Resolves a season code (the mobile app's address) to the same SeasonDetail GET /seasons/{id} serves. 404 for an unknown or soft-deleted code; 403 when the caller cannot see the season. The API stays canonical on id (spec 02 D8).",
        parameters: [{ name: "code", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: ok({ $ref: "#/components/schemas/SeasonDetail" }, "The season."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
    },
    "/api/v1/seasons/{id}/roster": {
      get: {
        tags: ["Groups"],
        summary: "Season roster for bulk group assignment",
        description:
          "Season-admin only. ACTIVE enrolments of live students (C9 — v1 used StudentProfile.activeSeasonId), name-ordered, unpaginated (a season is hundreds of rows; the group form needs full membership).",
        parameters: [idParam],
        responses: {
          200: ok(
            { type: "object", properties: { roster: { type: "array", items: { $ref: "#/components/schemas/SeasonRosterRow" } } } },
            "The roster.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
    },
    "/api/v1/seasons/{id}/group-assignments": {
      put: {
        tags: ["Groups"],
        summary: "Bulk-assign students to this season's groups",
        description:
          "Season-admin only; at most 500 rows, each student once. Eligibility is an ACTIVE enrolment of a live student in THIS season (v1 gated on activeSeasonId and upserted enrolments, resurrecting withdrawn students). Non-eligible rows are skipped and returned in skippedStudentIds; counts are what was WRITTEN (v1 reported the requested length). A null groupId removes only this season's membership. Any groupId outside the season refuses the whole batch (400 group_outside_season). One transaction. Plan 17's group importer writes through the same function.",
        parameters: [idParam],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/GroupAssignmentsRequest" } } } },
        responses: {
          200: ok(
            {
              type: "object",
              properties: {
                assigned: { type: "integer" },
                unassigned: { type: "integer" },
                skippedStudentIds: { type: "array", items: { type: "integer" } },
              },
            },
            "What was written.",
          ),
          400: {
            description: "`bad_request` or `group_outside_season`.",
            content: { "application/json": { schema: errorResponse } },
          },
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
    },
    "/api/v1/seasons/{id}/groups": {
      post: {
        tags: ["Groups"],
        summary: "Create a group in a season",
        description:
          "Season-admin power. Refuses a duplicate name within the season — v1 has no such constraint and its CSV importer matches groups *by name*, so two groups sharing one silently misroute an import. A real constraint needs a migration; this is the check available now.",
        parameters: [idParam],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/GroupWriteRequest" },
            },
          },
        },
        responses: {
          201: ok({ type: "object", properties: { id: { type: "integer" } } }, "Created."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
          409: {
            description:
              "`name_taken`, `invalid_leader` (a named leader lacks the LEADER role) or `not_enrolled` (a named student is not in this season).",
            content: { "application/json": { schema: errorResponse } },
          },
        },
      },
      get: {
        tags: ["Seasons"],
        summary: "Groups in a season",
        description:
          "Scoped to the caller: SUPER, MENTOR and the season's ADMIN see every group; a LEADER sees only the ones they lead (v1 showed them all of them); a STUDENT sees their own, resolved from their enrolment in *this* season rather than from their current group membership.",
        parameters: [idParam],
        responses: {
          200: ok(
            { type: "object", properties: { groups: { type: "array", items: { $ref: "#/components/schemas/GroupListItem" } } } },
            "Groups.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
        },
      },
    },
    "/api/v1/seasons/{id}/sessions": {
      get: {
        tags: ["Seasons"],
        summary: "Sessions in a season",
        description: "`checkInToken` is null for a STUDENT.",
        parameters: [idParam],
        responses: {
          200: ok(
            { type: "object", properties: { sessions: { type: "array", items: { $ref: "#/components/schemas/SessionListItem" } } } },
            "Sessions, earliest first.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
        },
      },
    },
    "/api/v1/seasons/{id}/assignments": {
      get: {
        tags: ["Seasons"],
        summary: "Assignments in a season",
        description:
          "**The row shape depends on the caller's role.** Staff receive `StaffAssignmentListItem` (season-wide counts); a STUDENT receives `StudentAssignmentListItem` (their own status), filtered to assignments that target them.",
        parameters: [idParam],
        responses: {
          200: ok(
            {
              type: "object",
              properties: {
                assignments: {
                  type: "array",
                  items: {
                    oneOf: [
                      { $ref: "#/components/schemas/StaffAssignmentListItem" },
                      { $ref: "#/components/schemas/StudentAssignmentListItem" },
                    ],
                  },
                },
              },
            },
            "Assignments.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
        },
      },
      post: {
        tags: ["Assignments"],
        summary: "Create an assignment in a season",
        description:
          "Season admins (SUPER passes). Row and targets commit in one transaction. Afterwards every ACTIVE enrolled student the assignment targets — resolved through SeasonEnrollment (ruling C9), opted-out students skipped — gets ASSIGNMENT_CREATED titled `New assignment: <title>`, body `Due <org time>` (omitted with no due date), link `/student/assignments/<id>` (v1's path, ruling X1). A notification failure never fails the create.",
        parameters: [idParam],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/AssignmentWriteRequest" } } },
        },
        responses: {
          201: ok({ $ref: "#/components/schemas/AssignmentDetail" }, "Created — the same shape GET /assignments/{id} returns."),
          400: conflict("`bad_request` (body; message names the first failing field), `invalid_group`, or `invalid_session`."),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
    },

    "/api/v1/groups": {
      get: {
        tags: ["Groups"],
        summary: "The groups this caller is personally in",
        description:
          "What the `/groups` tab needs — `navigation.ts` gives LEADER this as their first tab, and until now nothing served it: v1 answered the question with a query written inside the page, one of five group reads that never reached its REST layer.\n\nA LEADER gets the groups they lead; a STUDENT gets their own, across every season they were enrolled in. Staff above leader are not *in* groups, so they get an empty list and browse by season instead — returning everything they could administer would make \"my groups\" mean something different per role.",
        responses: {
          200: ok(
            {
              type: "object",
              properties: {
                groups: {
                  type: "array",
                  items: { $ref: "#/components/schemas/GroupListItem" },
                },
              },
            },
            "Newest season first.",
          ),
          401: errRef("Unauthorized"),
        },
      },
    },

    "/api/v1/groups/leader-options": {
      get: {
        tags: ["Groups"],
        summary: "Leaders a group form may pick from",
        description:
          "Season-admin (of any season) or SUPER only. Live LEADER users, name-ordered. Interim: spec 05 puts this behind the user directory (Plan 9), which may replace this route.",
        responses: {
          200: ok(
            {
              type: "object",
              properties: {
                leaders: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { id: { type: "integer" }, name: { type: ["string", "null"] }, email: { type: "string" } },
                  },
                },
              },
            },
            "Leader users.",
          ),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
        },
      },
    },
    "/api/v1/groups/{id}/impact": {
      get: {
        tags: ["Groups"],
        summary: "What deleting a group would do",
        description:
          "Season-admin only. studentCount (ACTIVE enrolments that would lose their group), leaderCount, and soleTargetAssignments: live assignments targeted at this group ONLY, which make DELETE refuse (spec 05 R44).",
        parameters: [idParam],
        responses: {
          200: ok(
            {
              type: "object",
              properties: {
                studentCount: { type: "integer" },
                leaderCount: { type: "integer" },
                soleTargetAssignments: {
                  type: "array",
                  items: { type: "object", properties: { id: { type: "integer" }, title: { type: "string" } } },
                },
              },
            },
            "The impact.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
    },
    "/api/v1/groups/{id}": {
      delete: {
        tags: ["Groups"],
        summary: "Delete a group",
        description:
          "Season-admin only. Designed rather than ported: v1's delete action was unreachable (C12). Refuses with 409 `group_has_sole_targets` while any live non-all-groups assignment targets only this group, so none is left visible to nobody. Otherwise, in one transaction that re-checks that condition: unassigns every enrolment pointing at the group, deletes its leaders, memberships and target rows, and hard-deletes the group. Returns `{ deleted: true, orphanedStudentIds }`.",
        parameters: [idParam],
        responses: {
          200: ok(
            {
              type: "object",
              properties: { deleted: { type: "boolean" }, orphanedStudentIds: { type: "array", items: { type: "integer" } } },
            },
            "Deleted.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
          409: conflict("`group_has_sole_targets`."),
        },
      },
      patch: {
        tags: ["Groups"],
        summary: "Edit a group's name, description, leaders and roster",
        description:
          "Season-admin power. A group's own leader is deliberately refused: leading a group does not confer the right to change who else leads it, and a GroupLeader row is a claim in the token.\n\nThe roster write preserves enrolment history. v1's group form deleted and recreated the SeasonEnrollment, resetting status, enrolledAt, droppedAt and dropReason — a WITHDRAWN student silently returned as ACTIVE with their reason for leaving erased, on a model the schema itself calls append-only. A student removed from the list keeps their enrolment and loses only the group pointer.",
        parameters: [idParam],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/GroupWriteRequest" },
            },
          },
        },
        responses: {
          200: ok({ type: "object", properties: { id: { type: "integer" } } }, "Updated."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
          409: {
            description: "`name_taken`, `invalid_leader` or `not_enrolled`.",
            content: { "application/json": { schema: errorResponse } },
          },
        },
      },
      get: {
        tags: ["Groups"],
        summary: "Group detail with leaders and students",
        parameters: [idParam],
        responses: {
          200: ok({ $ref: "#/components/schemas/GroupDetail" }, "The group."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
    },

    "/api/v1/users": {
      get: {
        tags: ["Users"],
        summary: "User list (SUPER only)",
        description:
          "Cursor-paginated and filtered in the database. `status` is derived server-side (inactive, active, invited, pending); the password hash never leaves the server. `q` matches name or email, case-insensitive. `cursor` is the last row's id; `total` is the whole population under the current filters.",
        parameters: [
          { name: "q", in: "query", schema: { type: "string" } },
          { name: "role", in: "query", schema: { $ref: "#/components/schemas/UserRole" } },
          { name: "status", in: "query", schema: { type: "string", enum: ["active", "invited", "pending", "inactive"] } },
          { name: "cursor", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
        ],
        responses: {
          200: ok(
            {
              type: "object",
              properties: {
                users: { type: "array", items: { $ref: "#/components/schemas/UserListItem" } },
                nextCursor: { type: ["integer", "null"] },
                total: { type: "integer" },
              },
            },
            "One page of users.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
        },
      },
      post: {
        tags: ["Users"],
        summary: "Create a user and issue their invite (SUPER only)",
        description:
          "Creation and invitation are one operation. The account is created with a NULL password hash (there is no default password anywhere) and an invite is minted in the same transaction; the code goes out by email after commit, best-effort (a mail failure never rolls back the account, re-send from `POST /users/{id}/invite`). The response never carries the code. LEADER, ADMIN and MENTOR require a graduationYear. A STUDENT gets a StudentProfile. Creating a SUPER requires `confirmSuper: true`, otherwise `400 confirm_super_required` (a SUPER grant can never be a mis-tapped picker item).",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "email", "role"],
                properties: {
                  name: { type: "string", minLength: 2, maxLength: 120 },
                  email: { type: "string", format: "email" },
                  role: { $ref: "#/components/schemas/UserRole" },
                  graduationYear: { type: ["integer", "null"], minimum: 1990 },
                  confirmSuper: { type: "boolean", description: "Must be true when `role` is SUPER." },
                },
              },
            },
          },
        },
        responses: {
          201: ok({ type: "object", required: ["userId"], properties: { userId: { type: "integer" } } }, "Created."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          409: conflict("`email_taken`."),
        },
      },
    },

    "/api/v1/users/invites/pending": {
      get: {
        tags: ["Users"],
        summary: "Count accounts a bulk invite would reach (SUPER only)",
        description:
          "\"Pending\" means: not deleted, no password, never signed in, and no live **v2** invite. A live v1 plaintext invite still counts as pending, because v2 can never accept it. The client hides the bulk button at zero.",
        responses: {
          200: ok({ type: "object", required: ["pending"], properties: { pending: { type: "integer", minimum: 0 } } }, "The count."),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
        },
      },
      post: {
        tags: ["Users"],
        summary: "Send invites to pending accounts, one bounded batch (SUPER only)",
        description:
          "Processes at most 20 pending accounts per request, oldest id first; call again for the rest (`remaining`). Each account gets its own short transaction that row-locks the user and re-checks eligibility, so a double-tap or two SUPERs racing skip rather than re-mint (`skipped`). Mail goes out after the commits with a small concurrency pool. A mail failure expires the invite just minted, so that person stays pending and the next call retries them (`failed`). Refused with 503 `email_not_configured` when no mail transport is configured, so no invites are minted that nobody can receive. No response ever carries an invite code. Rate limited to 30 requests per hour.",
        responses: {
          200: ok(
            {
              type: "object",
              required: ["sent", "skipped", "failed", "remaining"],
              properties: {
                sent: { type: "integer", minimum: 0 },
                skipped: { type: "integer", minimum: 0 },
                failed: { type: "integer", minimum: 0 },
                remaining: { type: "integer", minimum: 0 },
              },
            },
            "Batch counters.",
          ),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          429: errRef("TooManyRequests"),
          503: { description: "`email_not_configured`.", content: { "application/json": { schema: errorResponse } } },
        },
      },
    },

    "/api/v1/users/{id}": {
      get: {
        tags: ["Users"],
        summary: "User detail with invite metadata (SUPER only)",
        parameters: [idParam],
        responses: {
          200: ok({ $ref: "#/components/schemas/UserDetail" }, "The user."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
      patch: {
        tags: ["Users"],
        summary: "Edit a user's name, role and graduation year (SUPER only)",
        description:
          "A full replace of `{ name, role, graduationYear }` (email is not editable; unknown keys are refused). LEADER, ADMIN and MENTOR require a graduationYear (alumni-only roles).\n\n**A role change is a revocation.** In one transaction: a demoted ADMIN loses their SeasonAdmin rows, a demoted LEADER their GroupLeader rows, a user landing on STUDENT gets a StudentProfile, and every live refresh token of the target is revoked — so the old claims cannot be re-minted. Access tokens already issued live out their 15-minute TTL.\n\nGuards: changing your own role is `409 cannot_change_own_role` (renaming yourself is fine); granting SUPER needs `confirmSuper: true` (`400 confirm_super_required`); demoting the only active SUPER is `409 last_super` (the active SUPER rows are locked FOR UPDATE inside the transaction, so two concurrent demotions cannot both pass). Answers with the same `UserDetail` GET returns.",
        parameters: [idParam],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "role", "graduationYear"],
                additionalProperties: false,
                properties: {
                  name: { type: "string", minLength: 2, maxLength: 120 },
                  role: { $ref: "#/components/schemas/UserRole" },
                  graduationYear: { type: ["integer", "null"], minimum: 1990 },
                  confirmSuper: { type: "boolean", description: "Must be true for a role change to SUPER." },
                },
              },
            },
          },
        },
        responses: {
          200: ok({ $ref: "#/components/schemas/UserDetail" }, "The updated user."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
          409: conflict("`cannot_change_own_role` or `last_super`."),
        },
      },
    },

    "/api/v1/users/{id}/invite": {
      post: {
        tags: ["Users"],
        summary: "Issue (or re-issue) an invite (SUPER only)",
        description:
          "Mints a fresh invite and expires the target's previous live one (one live invite per user), then emails the code. The response is the invite metadata only; the code is never returned. Refused explicitly: an already-activated target is `409 already_activated`, a deactivated one `409 user_deleted`.",
        parameters: [idParam],
        responses: {
          200: ok({ $ref: "#/components/schemas/InviteState" }, "The new invite's metadata."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
          409: conflict("`already_activated` or `user_deleted`."),
        },
      },
    },

    "/api/v1/users/{id}/deactivate": {
      post: {
        tags: ["Users"],
        summary: "Deactivate a user (SUPER only)",
        description:
          "Soft-deletes the user and revokes every live refresh token in the same transaction. Refused for yourself (`400 cannot_deactivate_self`) and for the only active SUPER (`409 last_super`, serialised with row locks).",
        parameters: [idParam],
        responses: {
          200: ok(
            { type: "object", required: ["deletedAt"], properties: { deletedAt: { type: "string", format: "date-time" } } },
            "Deactivated.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
          409: conflict("`last_super`."),
        },
      },
    },

    "/api/v1/users/{id}/reactivate": {
      post: {
        tags: ["Users"],
        summary: "Reactivate a deactivated user (SUPER only)",
        description: "Also clears a student profile's deletion stamp (set by `DELETE /students/{id}`).",
        parameters: [idParam],
        responses: {
          200: ok(
            { type: "object", required: ["deletedAt"], properties: { deletedAt: { type: "null" } } },
            "Reactivated.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
    },

    "/api/v1/students": {
      get: {
        tags: ["Students"],
        summary: "Student list (active, alumni or dropped)",
        description:
          "One endpoint serves all three list surfaces, selected by `status` (default `active`).\n\nScope is per role: SUPER and MENTOR read every student; ADMIN gets the students ever enrolled in their seasons; LEADER gets the students whose **enrollment** names one of their groups (C9 — never GroupStudent). `alumni` (graduationYear set) is refused with 403 `forbidden` to LEADER. `dropped` lists WITHDRAWN enrollments, not students (a student dropped from three seasons appears three times; rows carry `droppedEnrollment`) and is SUPER/ADMIN only — it hands out drop reasons, so MENTOR and LEADER get 403. STUDENT is refused on every surface.\n\nPagination is cursor-based: pass the last row's id (the enrollment id when `status=dropped`) as `cursor`; `nextCursor` is null on the last page. `total` is the whole population under the current filters, not the page size (D14). `q` matches name, email or university, case-insensitive.",
        parameters: [
          { name: "status", in: "query", schema: { type: "string", enum: ["active", "alumni", "dropped"], default: "active" } },
          { name: "seasonId", in: "query", description: "Has an enrollment in this season (any status).", schema: { type: "integer", minimum: 1 } },
          { name: "q", in: "query", schema: { type: "string", maxLength: 120 } },
          { name: "cursor", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } },
        ],
        responses: {
          200: ok(
            {
              type: "object",
              properties: {
                students: { type: "array", items: { $ref: "#/components/schemas/StudentListItem" } },
                nextCursor: { type: ["integer", "null"] },
                total: { type: "integer" },
              },
            },
            "One page of students.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
        },
      },
      post: {
        tags: ["Students"],
        summary: "Create a student",
        description:
          "SUPER only (v1 admitted any ADMIN with no season scoping). **There is no password field, by design (D7):** v1's hard-coded `ChangeMe123!` is not ported. The account is created with no password and an invite is minted in the same transaction and emailed after commit (best-effort — a mail failure never fails the create; the code never appears in any response). The student sets a password by accepting the invite. When `seasonId` is given, one transaction creates the user, the profile, an ACTIVE enrollment and points `activeSeasonId` at the same season, so the two definitions of \"in this season\" agree (D1). Empty strings are stored as null.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "email"],
                properties: {
                  name: { type: "string", minLength: 2, maxLength: 120 },
                  email: { type: "string", format: "email" },
                  university: { type: ["string", "null"], maxLength: 160 },
                  year: { type: ["string", "null"], maxLength: 40 },
                  phone: { type: ["string", "null"], maxLength: 60 },
                  dateOfBirth: { type: ["string", "null"], format: "date-time" },
                  spiritualBackground: { type: ["string", "null"], maxLength: 4000 },
                  gifts: { type: ["string", "null"], maxLength: 2000 },
                  notes: { type: ["string", "null"], maxLength: 4000 },
                  seasonId: { type: ["integer", "null"] },
                },
              },
            },
          },
        },
        responses: {
          201: ok({ type: "object", properties: { id: { type: "integer" }, email: { type: "string" } } }, "Created."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
          409: conflict("`email_taken` — also for a soft-deleted student's address, which stays reserved."),
        },
      },
    },

    "/api/v1/students/{id}": {
      get: {
        tags: ["Students"],
        summary: "Student detail, shaped by the caller's role",
        description:
          "The row gate lives here: SUPER and MENTOR may read any student, the student may read themselves, an ADMIN a student ever enrolled in one of their seasons, a LEADER a student whose enrollment names one of their groups (C9). Everyone else gets 403; a soft-deleted or non-student id is 404.\n\nThe payload is narrowed per role, not just the access (C8): see `StudentDetail` for which profile fields exist on the wire for MENTOR/LEADER (phone, dateOfBirth, spiritualBackground, notes and per-row dropReason are absent) and why the subject never receives `notes`.",
        parameters: [idParam],
        responses: {
          200: ok({ $ref: "#/components/schemas/StudentDetail" }, "The student."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
      patch: {
        tags: ["Students"],
        summary: "Edit a student's profile",
        description:
          "Absent field = untouched, `null` = cleared. The set of keys a caller may send is allowlisted per role, checked against the raw body before validation; a key outside it is refused with 403 `forbidden_field` (v1 silently dropped it). The subject may edit university, year, phone, dateOfBirth, spiritualBackground and gifts only (never `name` — that is PATCH /me — nor `email`, `notes` or `activeSeasonId`). ADMIN (of a season with an ACTIVE enrollment for the student) adds `name`, `email` and `notes`. SUPER may send everything, including `activeSeasonId`: `404 not_found` for a missing or deleted season, `409 not_enrolled` when the student has no ACTIVE enrollment there, `null` clears. `409 email_taken` on an address clash.",
        parameters: [idParam],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string", minLength: 2, maxLength: 120 },
                  email: { type: "string", format: "email" },
                  university: { type: ["string", "null"] },
                  year: { type: ["string", "null"] },
                  phone: { type: ["string", "null"] },
                  dateOfBirth: { type: ["string", "null"], format: "date-time" },
                  spiritualBackground: { type: ["string", "null"] },
                  gifts: { type: ["string", "null"] },
                  notes: { type: ["string", "null"] },
                  activeSeasonId: { type: ["integer", "null"] },
                },
              },
            },
          },
        },
        responses: {
          200: ok({ type: "object", properties: { id: { type: "integer" } } }, "Updated."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
          409: conflict("`email_taken` or `not_enrolled`."),
        },
      },
      delete: {
        tags: ["Students"],
        summary: "Soft-delete a student (SUPER only)",
        description:
          "SUPER only. One transaction stamps `User.deletedAt` and `StudentProfile.deletedAt` and revokes every refresh token. Nothing cascades: enrollments, attendance, submissions and notes survive as history. Reversible only through `POST /users/{id}/reactivate`. `not_found` covers a non-student, an unknown id and an already-deleted student. Writes a server-side audit line (ids only).",
        parameters: [idParam],
        responses: {
          200: ok(
            { type: "object", properties: { id: { type: "integer" }, deletedAt: { type: "string", format: "date-time" } } },
            "Deleted.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
    },

    "/api/v1/students/{id}/graduate": {
      post: {
        tags: ["Students"],
        summary: "Graduate a student (SUPER only)",
        description:
          "SUPER only (R55). Body `{ graduationYear }`, 1990 through the current year, evaluated per request. In one transaction: sets `graduationYear`, completes **every** ACTIVE enrollment (v1 completed only the one the profile pointed at), and clears `activeSeasonId`. WITHDRAWN and COMPLETED enrollments are untouched; `role` stays STUDENT. Irreversible: a second graduation is 409 `already_graduated`. `not_found` covers a non-student or deleted id. Writes a server-side audit line (ids only).",
        parameters: [idParam],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["graduationYear"],
                properties: { graduationYear: { type: "integer", minimum: 1990 } },
              },
            },
          },
        },
        responses: {
          200: ok(
            {
              type: "object",
              properties: {
                id: { type: "integer" },
                graduationYear: { type: "integer" },
                enrollmentsCompleted: { type: "integer" },
              },
            },
            "Graduated.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
          409: conflict("`already_graduated`."),
        },
      },
    },

    "/api/v1/students/{id}/enrollments": {
      post: {
        tags: ["Students"],
        summary: "Enroll a student in a season",
        description:
          "Season-admin of the **target** season (SUPER passes); gated before any lookup. Creates an ACTIVE enrollment and, if the student's `activeSeasonId` is unset, points it at the new season (never overwrites a set pointer). One enrollment per student per season, ever: a second attempt \u2014 even over a WITHDRAWN row \u2014 is 409 `already_enrolled`.\n\nBoundary: this endpoint owns enrollment existence and status only. `groupId` is written exclusively by `PATCH /api/v1/groups/{id}` \u2014 group membership is written only there. Enrollment rows are never deleted.",
        parameters: [idParam],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object", required: ["seasonId"], properties: { seasonId: { type: "integer", minimum: 1 } } },
            },
          },
        },
        responses: {
          201: ok(
            { type: "object", properties: { id: { type: "integer" }, seasonId: { type: "integer" }, status: { type: "string", enum: ["ACTIVE"] } } },
            "Enrolled.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
          409: conflict("`already_enrolled`."),
        },
      },
    },

    "/api/v1/students/{id}/enrollments/{seasonId}": {
      patch: {
        tags: ["Students"],
        summary: "Complete or drop an enrollment",
        description:
          "Addressed by (student, season) \u2014 the natural unique key. Season-admin of that season (SUPER passes); the gate runs **before** the row lookup so a refused caller learns nothing about whether the enrollment exists. The only transitions are ACTIVE \u2192 WITHDRAWN (sets droppedAt, optional `dropReason`) and ACTIVE \u2192 COMPLETED (sets completedAt). ACTIVE is not accepted in the body: there is no re-activation. A non-ACTIVE row is 409 `not_active`. The row is transitioned in place and never deleted. Writes a server-side audit line (actor and subject ids only).",
        parameters: [
          idParam,
          { name: "seasonId", in: "path", required: true, schema: { type: "integer", minimum: 1 } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["status"],
                properties: {
                  status: { type: "string", enum: ["WITHDRAWN", "COMPLETED"] },
                  dropReason: { type: ["string", "null"], maxLength: 500, description: "Only with WITHDRAWN." },
                },
              },
            },
          },
        },
        responses: {
          200: ok({ type: "object", properties: { id: { type: "integer" }, status: { type: "string" } } }, "Transitioned."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
          409: conflict("`not_active`."),
        },
      },
    },

    "/api/v1/students/{id}/notes": {
      get: {
        tags: ["Notes"],
        summary: "Notes about one student, narrowed to what the caller may read",
        description:
          "Pastoral records \u2014 sensitive. Two gates, in order: the caller must be able to view the student (`canViewStudent`), then the visibility rule is applied **in the query**, so a hidden note never leaves the database. Visibility is **equality**, not a ladder: a LEADER reads LEADERS notes, a MENTOR MENTORS, an ADMIN ADMINS, SUPER reads all, and every author reads their own regardless of visibility. An ADMIN therefore does not read a LEADERS note. A STUDENT receives `403 forbidden` \u2014 never an empty list, even for their own notes. `body` is plain text, not the HTML the column holds. Newest first, cursor-paged (`nextCursor` is opaque; pass it back as `cursor`). Rate-limited; each read writes a server-side audit line (viewer id, student id, count \u2014 never a body).",
        parameters: [
          idParam,
          { name: "cursor", in: "query", schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 50, default: 20 } },
        ],
        responses: {
          200: ok(
            {
              type: "object",
              required: ["notes", "nextCursor"],
              properties: {
                notes: { type: "array", items: { $ref: "#/components/schemas/NoteSummary" } },
                nextCursor: { type: ["string", "null"] },
              },
            },
            "A page of visible notes.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
          429: errRef("TooManyRequests"),
        },
      },
      post: {
        tags: ["Notes"],
        summary: "Write a note about a student",
        description:
          "Writer gate, independent of the read path: SUPER and MENTOR for any student; ADMIN if the student is enrolled in a season they administer; LEADER if the student's `SeasonEnrollment.groupId` is a group they lead; STUDENT never (including about themselves). `body` is **plain text in both directions**: the API escapes and paragraph-wraps it for storage (the column is still rendered raw by v1) and strips tags on read, so no live markup is ever stored or returned. `visibility` and `followUpFlagged` are immutable after creation. `authorUserId` always comes from the session. `seasonId` is optional; omitted, it defaults to the student's most recent ACTIVE enrollment, and when given it must be a season the student is enrolled in (`400 season_not_enrolled`). A flagged note notifies that season's admins (`MENTOR_FOLLOWUP`); the notification **deliberately carries no excerpt of the note** (title and link only), and a notification failure never fails the write.",
        parameters: [idParam],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["body", "visibility"],
                properties: {
                  body: { type: "string", minLength: 2, maxLength: 20000, description: "Plain text." },
                  visibility: { $ref: "#/components/schemas/NoteVisibility" },
                  followUpFlagged: { type: "boolean", default: false },
                  seasonId: { type: "integer", minimum: 1 },
                },
              },
            },
          },
        },
        responses: {
          201: ok(
            { type: "object", required: ["note"], properties: { note: { $ref: "#/components/schemas/NoteSummary" } } },
            "The created note.",
          ),
          400: conflict("`bad_request` or `season_not_enrolled`."),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
    },

    "/api/v1/notes/{id}": {
      patch: {
        tags: ["Notes"],
        summary: "Correct a note's body (author only)",
        description:
          "Author equality and nothing else: **SUPER is not exempt**. Body only \u2014 `visibility`, `followUpFlagged` and `seasonId` are immutable, and extra fields are ignored. The body has the same 2\u201320000 bound as create (v1 validated nothing). `body` is plain text in both directions. The response's `edited` becomes true.",
        parameters: [idParam],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["body"],
                properties: { body: { type: "string", minLength: 2, maxLength: 20000, description: "Plain text." } },
              },
            },
          },
        },
        responses: {
          200: ok(
            { type: "object", required: ["note"], properties: { note: { $ref: "#/components/schemas/NoteSummary" } } },
            "The updated note.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
      delete: {
        tags: ["Notes"],
        summary: "Delete a note (not available)",
        description:
          "Always `501 delete_unavailable`; nothing is deleted. v1's delete was a hard delete with no UI caller; soft delete needs a `deletedAt` column, which needs a migration the shared database cannot take while v1 writes to it. Correct a note by editing it.",
        parameters: [idParam],
        responses: {
          401: errRef("Unauthorized"),
          501: conflict("`delete_unavailable`."),
        },
      },
    },

    "/api/v1/notifications": {
      get: {
        tags: ["Notifications"],
        summary: "The caller's notification inbox, newest first",
        description:
          "Returns only the caller's own rows (the user id comes from the token, never a parameter). **Performs no write** — it never marks anything read, however often the client refetches (ruling C6); use `POST /notifications/read`. Ordered by id descending; `nextCursor` is the id of the last row of the page, or null at the end. `unreadCount` is a real count over all of the caller's unread rows, not a filter over the page. `target` is derived from the stored v1 link in one server-side function.",
        parameters: [
          { name: "cursor", in: "query", required: false, schema: { type: "integer", minimum: 1 }, description: "`nextCursor` of the previous page." },
          { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 50, default: 20 } },
          { name: "unreadOnly", in: "query", required: false, schema: { type: "string", enum: ["true", "false"], default: "false" } },
        ],
        responses: {
          200: ok(
            {
              type: "object",
              required: ["items", "nextCursor", "unreadCount"],
              properties: {
                items: { type: "array", items: { $ref: "#/components/schemas/Notification" } },
                nextCursor: { type: ["integer", "null"] },
                unreadCount: { type: "integer", minimum: 0 },
              },
            },
            "One page of the inbox.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
        },
      },
    },
    "/api/v1/notifications/unread-count": {
      get: {
        tags: ["Notifications"],
        summary: "The caller's unread notification count (the badge)",
        description: "A single count over the caller's own unread rows. Separate from the list so rendering a badge never fetches rows.",
        responses: {
          200: ok(
            { type: "object", required: ["unreadCount"], properties: { unreadCount: { type: "integer", minimum: 0 } } },
            "The unread count.",
          ),
          401: errRef("Unauthorized"),
        },
      },
    },
    "/api/v1/notifications/read": {
      post: {
        tags: ["Notifications"],
        summary: "Mark notifications read (the explicit write)",
        description:
          "Body is exactly one of `{ ids: number[] }` (1–200) or `{ all: true }`; both together, an empty `ids`, or any other key (including `userId`) is `400 bad_request`. **`ids` is not an ownership assertion**: the update is scoped to the caller's own unread rows, so another user's id updates nothing and counts as zero. Idempotent — already-read rows are skipped and keep their original `readAt`; `marked` is the number of rows this call changed.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                oneOf: [
                  {
                    type: "object",
                    required: ["ids"],
                    additionalProperties: false,
                    properties: { ids: { type: "array", minItems: 1, maxItems: 200, items: { type: "integer", minimum: 1 } } },
                  },
                  {
                    type: "object",
                    required: ["all"],
                    additionalProperties: false,
                    properties: { all: { type: "boolean", enum: [true] } },
                  },
                ],
              },
            },
          },
        },
        responses: {
          200: ok(
            { type: "object", required: ["marked"], properties: { marked: { type: "integer", minimum: 0 } } },
            "How many rows this call marked.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
        },
      },
    },
    "/api/v1/me/notification-preferences": {
      get: {
        tags: ["Me"],
        summary: "Your notification preferences (all six)",
        description:
          "Always returns all six keys. A user with no stored row is opted in to everything — the row is created lazily on first save, so most users have none. The preference governs outbound channels only (email now, push at cutover); the in-app inbox row is always written.",
        responses: {
          200: ok(
            { type: "object", required: ["preferences"], properties: { preferences: { $ref: "#/components/schemas/NotificationPreferences" } } },
            "The caller's preferences.",
          ),
          401: errRef("Unauthorized"),
        },
      },
      put: {
        tags: ["Me"],
        summary: "Replace your notification preferences",
        description:
          "PUT, not PATCH: the body must carry all six keys, so a partial body is `400 bad_request`. The row written is always the caller's (from the token); a `userId` in the body is ignored. Creates the row on first write.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/NotificationPreferences" } } },
        },
        responses: {
          200: ok(
            { type: "object", required: ["preferences"], properties: { preferences: { $ref: "#/components/schemas/NotificationPreferences" } } },
            "What was stored.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
        },
      },
    },
    "/api/v1/me/devices": {
      post: {
        tags: ["Me"],
        summary: "Register this device for push (blocked on cutover)",
        description:
          "The request body is validated, then the endpoint answers `503 push_unavailable`: Expo push needs a device-token table, the database schema is frozen while v1 runs against it, and the table lands at cutover (see docs/superpowers/cutover/2026-08-24-notifications-push.md). The contract is fixed now so the client is built once; the client keeps the token locally and stops retrying this session.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/DeviceRegistration" } } },
        },
        responses: {
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          503: conflict("`push_unavailable` — push registration is not available until the cutover migration lands."),
        },
      },
    },
    "/api/v1/me/notes": {
      get: {
        tags: ["Notes"],
        summary: "Notes the caller wrote",
        description:
          "Open to every authoring role (SUPER, ADMIN, LEADER, MENTOR); a STUDENT receives `403 forbidden`. Narrowed by author equality in the query. Optional `studentId` filters to one student. `body` is plain text. Cursor-paged, newest first. Rate-limited.",
        parameters: [
          { name: "studentId", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "cursor", in: "query", schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 50, default: 20 } },
        ],
        responses: {
          200: ok(
            {
              type: "object",
              required: ["notes", "nextCursor"],
              properties: {
                notes: { type: "array", items: { $ref: "#/components/schemas/AuthoredNote" } },
                nextCursor: { type: ["string", "null"] },
              },
            },
            "A page of the caller's own notes.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          429: errRef("TooManyRequests"),
        },
      },
    },

    "/api/v1/students/{id}/engagement": {
      get: {
        tags: ["Notes"],
        summary: "One student's engagement in one season",
        description:
          "Computed on the server from a single definition; clients never recompute the score or the at-risk flag. Two gates: the caller must be able to view the student, **and** must be scoped to the season being scored (a season admin of season A cannot read the student's season-B numbers; a leader must lead the student's group in that season; SUPER and MENTOR read any). `seasonId` selects the season, else the newest ACTIVE enrollment the caller is scoped to. **Staff** receive `StudentEngagement` (composite and `atRisk`). **A student asking about themselves** receives `StudentSelfEngagement`: the two components and **no `score` and no `atRisk`** (deliberate). The attendance denominator counts past sessions at or after the student's own enrollment date (a deliberate divergence from v1, which counted the whole season); a zero denominator never flags. The score counts PRESENT and LATE attendance rows and does **not** read `lateMinutes`, so it is unaffected by the lateness-instant defect (ruling C3) that the absence-budget figures in the attendance domain inherit.",
        parameters: [idParam, { name: "seasonId", in: "query", schema: { type: "integer", minimum: 1 } }],
        responses: {
          200: ok(
            { oneOf: [{ $ref: "#/components/schemas/StudentEngagement" }, { $ref: "#/components/schemas/StudentSelfEngagement" }] },
            "Staff arm or the student's own arm, by caller role.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: conflict("`no_season` (no enrollment to score) or `not_found`."),
        },
      },
    },

    "/api/v1/seasons/{id}/engagement": {
      get: {
        tags: ["Notes"],
        summary: "Engagement for a season's whole cohort",
        description:
          "Staff only (STUDENT gets 403). Computed in a constant number of queries regardless of cohort size (v1 issued four per student). SUPER, MENTOR and the season's admins read every active enrollment; a LEADER is narrowed to the students in the groups they lead (naming another group via `groupId` is 403). `groupId` optionally restricts to one group. Each row carries the composite `score` and the single `atRisk` flag. The attendance denominator starts at each student's enrollment date; the score does not read `lateMinutes` (see `GET /students/{id}/engagement`).",
        parameters: [idParam, { name: "groupId", in: "query", schema: { type: "integer", minimum: 1 } }],
        responses: {
          200: ok(
            {
              type: "object",
              required: ["students"],
              properties: { students: { type: "array", items: { $ref: "#/components/schemas/EngagementRow" } } },
            },
            "One row per active enrollment in scope.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
        },
      },
    },

    "/api/v1/sessions": {
      post: {
        tags: ["Sessions"],
        summary: "Create a session or weekly series",
        description:
          "Season-admin power. `repeatWeeks` (1–26; v1 clamped silently, v2 refuses) creates that many sessions one calendar week apart **in the organisation timezone** (ORG_TIMEZONE), so the wall-clock time holds across DST; they share a fresh recurrenceGroupId. Creation lives here with `seasonId` in the body, not under /seasons/:id, so the season and session write workstreams never share a route file — do not move it.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["seasonId", "title", "durationMinutes"],
                properties: {
                  seasonId: { type: "integer" },
                  title: { type: "string", minLength: 2, maxLength: 120 },
                  startsAt: { type: "string", format: "date-time", description: "An instant. Send this OR startDay + startTime, never both." },
                  startDay: { type: "string", description: "YYYY-MM-DD on the org calendar. Org wall-clock start (D-16.6, Plan 5's day/time split); send exactly one of startsAt, or startDay + startTime." },
                  startTime: { type: "string", description: "HH:mm on the org clock. Pair of startDay." },
                  durationMinutes: { type: "integer", minimum: 15, maximum: 600 },
                  location: { type: ["string", "null"], maxLength: 200 },
                  youtubeUrl: { type: ["string", "null"], format: "uri" },
                  description: { type: ["string", "null"], maxLength: 2000 },
                  repeatWeeks: { type: "integer", minimum: 1, maximum: 26, default: 1 },
                },
              },
            },
          },
        },
        responses: {
          201: ok(
            { type: "object", properties: { id: { type: "integer" }, recurrenceGroupId: { type: ["string", "null"] } } },
            "Created; `id` is the first session.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
      get: {
        tags: ["Sessions"],
        summary: "Calendar sessions across seasons, windowed",
        description:
          "Season set by role: SUPER all ACTIVE seasons (or any one live season via seasonId); ADMIN their seasons; LEADER every season they lead a group in; STUDENT/MENTOR 403. seasonId narrows within that set and is 403 outside it. Window [from, to) defaults to org-midnight today + 8 calendar weeks; one bound alone extends 8 weeks; span ≤ 120 days. checkInToken only on rows of seasons the caller administers.",
        parameters: [
          { name: "from", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "seasonId", in: "query", schema: { type: "integer" } },
        ],
        responses: {
          200: ok(
            {
              type: "object",
              properties: {
                sessions: { type: "array", items: { $ref: "#/components/schemas/SessionListItem" } },
                from: { type: "string", format: "date-time" },
                to: { type: "string", format: "date-time" },
                fromDayKey: { type: "string" },
                toDayKey: { type: "string" },
              },
            },
            "Sessions in the window.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
    },
    "/api/v1/sessions/{id}/series": {
      get: {
        tags: ["Sessions"],
        summary: "Preview the sessions a scoped edit or delete would touch",
        description:
          "Season-admin only. Same season-fenced selection PATCH/DELETE use (C10). 'future' = the anchor and every sibling at or after its stored start. Totals are what DELETE refuses without force.",
        parameters: [idParam, { name: "scope", in: "query", required: true, schema: { type: "string", enum: ["one", "future", "all"] } }],
        responses: {
          200: ok({ type: "object" }, "The targets with dayKey, startTime, isAnchor, attendanceCount; totals attendanceCount, videoProgressCount."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
    },
    "/api/v1/sessions/{id}/check-in": {
      get: {
        tags: ["Sessions"],
        summary: "Check-in state for the admin console",
        description: "Season-admin only. state ∈ not_open|open|expired|closed (lib/check-in.ts — the same rule the scan enforces); expiresAt/expiresAtTime only while open.",
        parameters: [idParam],
        responses: {
          200: ok({ type: "object" }, "The state."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
    },
    "/api/v1/sessions/{id}/check-in-regenerate": {
      post: {
        tags: ["Sessions"],
        summary: "Replace the check-in token",
        description: "Season-admin only. Timestamps untouched: an open window stays open under the new code, and the old code is rejected with invalid_token (v1 R40).",
        parameters: [idParam],
        responses: {
          200: ok({ type: "object", properties: { checkInToken: { type: "string" } } }, "The new token."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
    },
    "/api/v1/sessions/{id}/quizzes": {
      get: {
        tags: ["Sessions"],
        summary: "Quizzes linked to a session",
        description: "Season admins and leaders with a group in the season. Oldest first (v1 listQuizzesForSession).",
        parameters: [idParam],
        responses: {
          200: ok({ type: "object" }, "{ quizzes: [{ id, title, kind, maxScore, questionCount, publishedAt }] }"),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
    },
    "/api/v1/sessions/{id}": {
      get: {
        tags: ["Sessions"],
        summary: "Session detail",
        parameters: [idParam],
        responses: {
          200: ok({ $ref: "#/components/schemas/SessionDetail" }, "The session."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
      patch: {
        tags: ["Sessions"],
        summary: "Edit a session, optionally its series",
        description:
          "Season-admin power. Full body plus `scope`: `one` (this session), `future` (this and later siblings), `all`. Series scopes shift every target by the anchor's start delta. The series is ALWAYS limited to this session's season (ruling C10 — v1 matched on recurrenceGroupId alone and could rewrite another season's sessions). A moved start notifies ACTIVE enrollees (SESSION_RESCHEDULED, link `/student/calendar`, time in ORG_TIMEZONE).",
        parameters: [idParam],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["title", "durationMinutes", "scope"],
                properties: {
                  title: { type: "string", minLength: 2, maxLength: 120 },
                  startsAt: { type: "string", format: "date-time", description: "An instant. Send this OR startDay + startTime, never both." },
                  startDay: { type: "string", description: "YYYY-MM-DD on the org calendar. Org wall-clock start (D-16.6, Plan 5's day/time split); send exactly one of startsAt, or startDay + startTime." },
                  startTime: { type: "string", description: "HH:mm on the org clock. Pair of startDay." },
                  durationMinutes: { type: "integer", minimum: 15, maximum: 600 },
                  location: { type: ["string", "null"] },
                  youtubeUrl: { type: ["string", "null"] },
                  description: { type: ["string", "null"] },
                  scope: { type: "string", enum: ["one", "future", "all"] },
                },
              },
            },
          },
        },
        responses: {
          200: ok({ type: "object", properties: { updated: { type: "integer" } } }, "Updated."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
      delete: {
        tags: ["Sessions"],
        summary: "Delete a session, optionally its series",
        description:
          "Season-admin power. Body `{ scope?: 'one'|'future'|'all' (default 'one'), force?: boolean }`; series fenced to this season (C10). Refused with 409 `has_student_records` when any target has attendance or video progress, unless `force: true`, which deletes those rows too. Also removed by cascade: the sessions' video questions. Kept with `sessionId` set to null: assignments and quizzes linked to them.",
        parameters: [idParam],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  scope: { type: "string", enum: ["one", "future", "all"], default: "one" },
                  force: { type: "boolean", default: false },
                },
              },
            },
          },
        },
        responses: {
          200: ok({ type: "object", properties: { deleted: { type: "integer" } } }, "Deleted."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
          409: conflict("`has_student_records`."),
        },
      },
    },
    "/api/v1/sessions/{id}/attendance": {
      get: {
        tags: ["Sessions"],
        summary: "Attendance roster",
        description:
          "Staff only. The roster carries every enrolled student's name and email, so it is gated more tightly than session detail — a STUDENT who can read the session cannot read its roster.",
        parameters: [idParam],
        responses: {
          200: ok(
            { type: "object", properties: { roster: { type: "array", items: { $ref: "#/components/schemas/AttendanceRosterRow" } } } },
            "The roster.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
      post: {
        tags: ["Sessions"],
        summary: "Mark attendance",
        description:
          "Upserts every entry in one transaction. `lateMinutes` is stored only when `status` is LATE; any other status clears it, and an omitted `notes` clears the column.",
        parameters: [idParam],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["entries"],
                properties: {
                  entries: { type: "array", items: { $ref: "#/components/schemas/AttendanceEntry" } },
                },
              },
            },
          },
        },
        responses: {
          200: ok({ type: "object", properties: { saved: { type: "integer" } } }, "Entries written."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
        },
      },
    },
    "/api/v1/sessions/{id}/check-in-open": {
      post: {
        tags: ["Sessions"],
        summary: "Open check-in and mint a token",
        description:
          "Season admins and SUPER only — not group leaders. Reopening reuses the existing token, so a code already displayed to a room stays valid.",
        parameters: [idParam],
        responses: {
          200: ok({ type: "object", properties: { checkInToken: { type: "string" } } }, "Check-in is open."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
    },
    "/api/v1/sessions/{id}/check-in-close": {
      post: {
        tags: ["Sessions"],
        summary: "Close check-in",
        description: "Season admins and SUPER only.",
        parameters: [idParam],
        responses: {
          200: ok({ type: "object", properties: { closed: { type: "boolean" } } }, "Check-in is closed."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
    },
    "/api/v1/sessions/check-in": {
      post: {
        tags: ["Sessions"],
        summary: "Student self check-in",
        description:
          "Marks the caller PRESENT, or LATE with the whole minutes elapsed since the session's start (ruling C3 — not since check-in opened). Check-in hard-stops three hours after opening even if never explicitly closed.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["token"],
                properties: { token: { type: "string", minLength: 1 } },
              },
            },
          },
        },
        responses: {
          200: ok(
            {
              type: "object",
              properties: {
                status: { type: "string", enum: ["PRESENT", "LATE"] },
                minutesLate: { type: "integer", description: "Whole minutes after Session.startsAt; 0 when on time." },
              },
            },
            "Checked in.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: {
            description: "`not_enrolled` — you have no ACTIVE enrolment in this session's season.",
            content: { "application/json": { schema: errorResponse } },
          },
          404: {
            description: "`invalid_token` — no session carries this check-in token. Note this is 404, not 401.",
            content: { "application/json": { schema: errorResponse } },
          },
          409: {
            description:
              "`not_open` (check-in never opened), `closed` (explicitly closed, or more than three hours after opening), or `already_checked_in`.",
            content: { "application/json": { schema: errorResponse } },
          },
        },
      },
    },

    "/api/v1/assignments/{id}": {
      get: {
        tags: ["Assignments"],
        summary: "Assignment detail",
        description:
          "Season access alone is not enough: for a targeted assignment (`isAllGroups: false`), a STUDENT must also be in one of the targeted groups — resolved from their enrolment in *this* season, not from their current group membership.",
        parameters: [idParam],
        responses: {
          200: ok({ $ref: "#/components/schemas/AssignmentDetail" }, "The assignment."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
      patch: {
        tags: ["Assignments"],
        summary: "Replace an assignment",
        description:
          "Season admins of the assignment's season (SUPER passes). A full replace — send every field; omitted optional fields are cleared, exactly like v1's edit form. Targeting is replaced in the same transaction. The season never changes (any `seasonId` in the body is ignored). Students newly targeted by the edit get ASSIGNMENT_CREATED (same text and link as create); students already targeted are not notified again. Editing is allowed after submissions exist (v1 R72). A soft-deleted assignment is 404.",
        parameters: [idParam],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/AssignmentWriteRequest" } } },
        },
        responses: {
          200: ok({ $ref: "#/components/schemas/AssignmentDetail" }, "The updated assignment."),
          400: conflict("`bad_request`, `invalid_group`, or `invalid_session`."),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
      delete: {
        tags: ["Assignments"],
        summary: "Soft-delete an assignment nobody has started",
        description:
          "Season admins of the assignment's season. Designed rather than ported: v1's soft-delete action had no caller (ruling C12). Sets `deletedAt`; targets and any history stay. Refused with 409 `has_submissions` while any Submission row exists (any status, drafts included) — there is no force option. Notifies nobody. Deleting twice is 404. Returns 200 with `{ deleted: true }` (the response envelope), not 204.",
        parameters: [idParam],
        responses: {
          200: ok({ type: "object", properties: { deleted: { type: "boolean", enum: [true] } } }, "Deleted."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
          409: conflict("`has_submissions`."),
        },
      },
    },

    "/api/v1/assignments/{id}/tracker": {
      get: {
        tags: ["Assignments"],
        summary: "Who was given this assignment, and what they have done about it",
        description:
          "Staff only, and scoped: a LEADER sees only students in the groups they lead. The rows carry every student's name and email, so this is gated the same way the attendance roster is rather than on season access.\n\nThe population comes from season enrolments, not from who happens to have a submission — a student who has done nothing still appears, which is the point of a tracker.",
        parameters: [idParam],
        responses: {
          200: ok({ $ref: "#/components/schemas/AssignmentTracker" }, "The tracker."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
    },

    "/api/v1/submissions": {
      get: {
        tags: ["Submissions"],
        summary: "A reviewer's queue",
        description:
          "Staff only. Scoped to the caller: a LEADER sees submissions from students enrolled in a group they lead **in that assignment's own season**; an ADMIN sees their seasons; SUPER and MENTOR see everything.\n\nv1's equivalent was unscoped and unpaginated — every submission the reader could reach, in one response. Cursor-paged here, ordered newest first.",
        parameters: [
          {
            name: "pendingOnly",
            in: "query",
            schema: { type: "string", enum: ["true", "false"], default: "true" },
            description: "Only submissions awaiting a verdict. Defaults true — it is a queue.",
          },
          { name: "seasonId", in: "query", schema: { type: "integer" } },
          {
            name: "cursor",
            in: "query",
            schema: { type: "string" },
            description: "`nextCursor` from the previous page.",
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 100, default: 25 },
          },
        ],
        responses: {
          200: ok({ $ref: "#/components/schemas/SubmissionQueue" }, "A page of the queue."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
        },
      },
    },

    "/api/v1/submissions/by-assignment/{assignmentId}": {
      put: {
        tags: ["Submissions"],
        summary: "Start (or fetch) this student's submission for an assignment",
        description:
          "Idempotent: the first call creates a DRAFT, later calls return the same row untouched. Never overwrites saved work.\n\nThis exists because v1 created the row as a side effect of *rendering* the assignment page. A read that writes is wrong on its own terms, and React Query would make it far worse — it refetches on mount, on focus and on reconnect, so the write would fire every time the app is tabbed back to.\n\nSTUDENT only, and only for an assignment actually targeted at them.",
        parameters: [
          { name: "assignmentId", in: "path", required: true, schema: { type: "integer" } },
        ],
        responses: {
          200: ok(
            {
              type: "object",
              properties: {
                publicId: { type: "string" },
                status: { $ref: "#/components/schemas/SubmissionStatus" },
              },
            },
            "The student's submission for this assignment.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
          409: conflict("`use_forum_endpoint` —A FORUM assignment is written only through `PUT /assignments/{id}/forum/response`."),
        },
      },
    },

    "/api/v1/submissions/{publicId}/review": {
      post: {
        tags: ["Submissions"],
        summary: "Record a verdict",
        description:
          "Gated on a check strictly narrower than the read gate: the author never reviews their own work, and a MENTOR reads every submission in the system but reviews none.\n\n`returnForRevision` produces `RETURNED` rather than `REVIEWED`. v1 had `RETURNED` in its vocabulary with no producer, so the only route back to editable was its accidental one, where saving a draft silently demoted a reviewed submission and dropped it out of the queue.\n\nThe student is notified, best-effort — a mail failure does not report the review as failed.",
        parameters: [{ name: "publicId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["feedback"],
                properties: {
                  feedback: { type: "string", maxLength: 20000 },
                  returnForRevision: { type: "boolean" },
                },
              },
            },
          },
        },
        responses: {
          200: ok(
            {
              type: "object",
              properties: {
                reviewed: { type: "boolean" },
                returnedForRevision: { type: "boolean" },
              },
            },
            "Recorded.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
          409: {
            description:
              "`not_submitted` — a DRAFT that was never submitted cannot be marked REVIEWED. It can still be returned for revision.",
            content: { "application/json": { schema: errorResponse } },
          },
        },
      },
    },

    "/api/v1/submissions/{publicId}": {
      get: {
        tags: ["Submissions"],
        summary: "Submission detail",
        description:
          "Readable by the author, the student's group leader, a season admin, SUPER and MENTOR. A peer student cannot read another's submission.",
        parameters: [publicIdParam],
        responses: {
          200: ok({ $ref: "#/components/schemas/SubmissionDetail" }, "The submission."),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
      patch: {
        tags: ["Submissions"],
        summary: "Save a draft or submit",
        description:
          "**Author only** — reading and writing are different rights, so a season admin who can read this submission still cannot edit it. `submit: true` sets status SUBMITTED and stamps `submittedAt`; omitting it returns the row to DRAFT, so saving a draft after submitting un-submits it.",
        parameters: [publicIdParam],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["text"],
                properties: {
                  text: { type: "string" },
                  submit: { type: "boolean", default: false },
                },
              },
            },
          },
        },
        responses: {
          200: ok(
            { type: "object", properties: { saved: { type: "boolean" }, submitted: { type: "boolean" } } },
            "Saved.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
          409: conflict("`use_forum_endpoint` —A FORUM assignment is written only through `PUT /assignments/{id}/forum/response`."),
        },
      },
    },
    "/api/v1/submissions/{publicId}/files": {
      post: {
        tags: ["Submissions"],
        summary: "Attach a file",
        description: [
          "**Currently disabled.** `ENABLE_UPLOADS` defaults to `false` while file and image",
          "handling moves to a CMS, so this returns `503 uploads_disabled` — refused before the",
          "request body is read, so a large upload costs the server nothing. Reading and deleting",
          "files already recorded are unaffected.",
          "",
          "When enabled: author only. The assignment's own `maxFileSizeMb` and",
          "`allowedMimeCategories` are enforced after upload; a process-level ceiling",
          "(`MAX_UPLOAD_BYTES`, 25 MB by default) rejects anything larger before the handler runs.",
        ].join("\n"),
        parameters: [publicIdParam],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["file"],
                properties: { file: { type: "string", format: "binary" } },
              },
            },
          },
        },
        responses: {
          201: ok(
            {
              type: "object",
              properties: {
                file: {
                  type: "object",
                  properties: {
                    id: { type: "integer" },
                    originalName: { type: "string" },
                    mimeType: { type: "string" },
                    sizeBytes: { type: "integer" },
                  },
                },
              },
            },
            "Stored.",
          ),
          400: {
            description: "`file_too_large`, `mime_not_allowed`, or `bad_request` (no file part).",
            content: { "application/json": { schema: errorResponse } },
          },
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
          503: {
            description:
              "`uploads_disabled` — `ENABLE_UPLOADS` is off. The current default; retry once uploads are re-enabled.",
            content: { "application/json": { schema: errorResponse } },
          },
        },
      },
      delete: {
        tags: ["Submissions"],
        summary: "Remove an attached file",
        description: "Author only. The file must belong to this submission.",
        parameters: [
          publicIdParam,
          { name: "fileId", in: "query", required: true, schema: { type: "integer", minimum: 1 } },
        ],
        responses: {
          200: ok({ type: "object", properties: { deleted: { type: "boolean" } } }, "Deleted."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
    },
    "/api/v1/submissions/{publicId}/files/{fileId}": {
      get: {
        tags: ["Submissions"],
        summary: "Download an attached file",
        description: [
          "Streams the raw bytes — **this is the one endpoint whose success path is not the `{ data }` envelope.** Error paths still are.",
          "",
          "Gated by the same rule as reading the submission, so a season admin or the student's group leader can open submitted work while a peer student cannot.",
          "",
          "Served as `Content-Disposition: attachment` because uploads are arbitrary user content; `Content-Type` is the recorded MIME type, never sniffed from the extension.",
        ].join("\n"),
        parameters: [
          publicIdParam,
          { name: "fileId", in: "path", required: true, schema: { type: "integer", minimum: 1 } },
        ],
        responses: {
          200: {
            description: "The file.",
            headers: {
              "Content-Disposition": { schema: { type: "string" }, description: "`attachment`, with RFC 5987 `filename*`." },
              "Cache-Control": { schema: { type: "string", example: "private, max-age=3600" } },
            },
            content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } },
          },
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: {
            description: "No such file, it belongs to another submission, or the stored blob is missing.",
            content: { "application/json": { schema: errorResponse } },
          },
        },
      },
    },

    "/api/v1/quizzes": {
      post: {
        tags: ["Quizzes"],
        summary: "Create a quiz",
        description:
          "Season-admin (or SUPER) only. `seasonId` is in the **body**, not the path: every quiz route lives in one router mounted at `/api/v1/quizzes`, so creation cannot hang off `/seasons/{id}` — the same deviation `POST /api/v1/sessions` makes. `sessionId` may be null (a season-level quiz); when set it must belong to `seasonId` (400 `session_not_in_season`). PAPER requires `maxScore`; ONLINE **rejects** it (400) and starts at 0, then derives it from question points.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/CreateQuizRequest" } } },
        },
        responses: {
          201: ok({ type: "object", required: ["id"], properties: { id: { type: "integer" } } }, "Created."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
      get: {
        tags: ["Quizzes"],
        summary: "List quizzes (row shape depends on the caller's role)",
        description:
          "**The row shape differs by role.** Staff (SUPER, season admin, leader with a group in the season) receive `QuizSummary` rows. A STUDENT receives their own `StudentQuizResult` rows and `nextCursor` is always null: PAPER quizzes appear only once graded, ONLINE quizzes as soon as they are published.\n\n`seasonId` defaults to the caller's active season; with none, the list is empty. Staff outside the season get 403.\n\nOne definition each, computed server-side: `studentCount` is the ACTIVE enrolments of the quiz's season narrowed to the caller's scope (a leader sees only their own groups); `gradedCount` is, within that same student set, QuizGrade rows with a non-null score for PAPER and QuizAttempt rows with status GRADED for ONLINE.",
        parameters: [
          { name: "seasonId", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "sessionId", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "cursor", in: "query", description: "Quiz id; returns rows with a smaller id.", schema: { type: "integer", minimum: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } },
        ],
        responses: {
          200: ok(
            {
              type: "object",
              required: ["items", "nextCursor"],
              properties: {
                items: {
                  type: "array",
                  items: {
                    oneOf: [
                      { $ref: "#/components/schemas/QuizSummary" },
                      { $ref: "#/components/schemas/StudentQuizResult" },
                    ],
                  },
                },
                nextCursor: { type: ["integer", "null"] },
              },
            },
            "Newest first for staff; by session date descending for a student.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
        },
      },
    },
    "/api/v1/quizzes/{id}": {
      get: {
        tags: ["Quizzes"],
        summary: "Quiz detail (the schema depends on the caller's role)",
        description:
          "**Two response schemas, chosen by role on the server.** Staff with a scope in the quiz's season (SUPER, season admin, leader of a group in it) receive `QuizAuthoringDetail`, which **carries the answer key** because grading needs it. A STUDENT receives `StudentQuizDetail`, whose questions have **no `correctIndex` field at all**; this is enforced by separate loaders with separate selects and pinned by a raw-JSON integration test. A student gets 404 for a quiz that is unpublished, PAPER, or in a season they cannot access (indistinguishable from a missing quiz). A GET never creates an attempt.",
        parameters: [idParam],
        responses: {
          200: ok(
            {
              oneOf: [
                { $ref: "#/components/schemas/QuizAuthoringDetail" },
                { $ref: "#/components/schemas/StudentQuizDetail" },
              ],
            },
            "`QuizAuthoringDetail` for staff, `StudentQuizDetail` for a student.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
      patch: {
        tags: ["Quizzes"],
        summary: "Edit a quiz's title, session or max score",
        description:
          "Season-admin (or SUPER) of the quiz's season. `kind` can never change. `maxScore` is refused with 409 `wrong_quiz_kind` on an ONLINE quiz (it is derived), and with 409 `quiz_has_grades` on a PAPER quiz that already has grades — moving the denominator under awarded scores is refused, not silently applied. A new `sessionId` must belong to the quiz's season.",
        parameters: [idParam],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/UpdateQuizRequest" } } },
        },
        responses: {
          200: ok({ type: "object", required: ["updated"], properties: { updated: { type: "boolean", const: true } } }, "Updated."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
          409: conflict("`wrong_quiz_kind` or `quiz_has_grades`."),
        },
      },
    },

    "/api/v1/quizzes/{id}/questions": {
      post: {
        tags: ["Quizzes"],
        summary: "Add a question to an ONLINE quiz",
        description:
          "Season-admin (or SUPER) only — a leader is refused. Appended at the end (`order` = current count) and, in the same transaction, the quiz's `maxScore` is recomputed as the sum of question points.\n\n**Structural freeze (D3):** once any attempt exists, every question write (add, edit, delete, reorder) is refused with 409 `quiz_has_attempts`; nothing versions a quiz, so editing under attempts would rebase graded scores or cascade-delete graded answers. A PAPER quiz has no questions: 409 `wrong_quiz_kind`.",
        parameters: [idParam],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/QuizQuestionRequest" } } },
        },
        responses: {
          201: ok({ $ref: "#/components/schemas/QuizQuestionAuthoring" }, "The created question."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
          409: conflict("`wrong_quiz_kind` or `quiz_has_attempts`."),
        },
      },
    },
    "/api/v1/quizzes/{id}/questions/order": {
      put: {
        tags: ["Quizzes"],
        summary: "Reorder a quiz's questions",
        description:
          "Season-admin only. `questionIds` must be an exact permutation of the quiz's current question ids (400 `invalid_order` otherwise — a partial list would leave omitted questions on stale positions). Subject to the same attempt freeze as every question write (409 `quiz_has_attempts`). Returns the questions in their new order.",
        parameters: [idParam],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["questionIds"],
                properties: { questionIds: { type: "array", minItems: 1, items: { type: "integer", minimum: 1 } } },
              },
            },
          },
        },
        responses: {
          200: ok(
            {
              type: "object",
              required: ["questions"],
              properties: { questions: { type: "array", items: { $ref: "#/components/schemas/QuizQuestionAuthoring" } } },
            },
            "The reordered questions.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
          409: conflict("`wrong_quiz_kind` or `quiz_has_attempts`."),
        },
      },
    },
    "/api/v1/quizzes/{id}/questions/{questionId}": {
      patch: {
        tags: ["Quizzes"],
        summary: "Replace a question's content",
        description:
          "Season-admin only. Takes the same body as create; `order` is not writable here (use the reorder endpoint). The question is addressed through its quiz: an id belonging to another quiz is 404 `question_not_in_quiz`. Recomputes `maxScore`. Frozen once attempts exist (409 `quiz_has_attempts`).",
        parameters: [idParam, { name: "questionId", in: "path", required: true, schema: { type: "integer", minimum: 1 } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/QuizQuestionRequest" } } },
        },
        responses: {
          200: ok({ $ref: "#/components/schemas/QuizQuestionAuthoring" }, "The updated question."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: conflict("`not_found` (quiz) or `question_not_in_quiz`."),
          409: conflict("`wrong_quiz_kind` or `quiz_has_attempts`."),
        },
      },
      delete: {
        tags: ["Quizzes"],
        summary: "Delete a question",
        description:
          "Season-admin only. In one transaction: deletes the question, renumbers the survivors to a gap-free `0..n-1`, and recomputes `maxScore`. Frozen once attempts exist (409 `quiz_has_attempts`); 404 `question_not_in_quiz` for another quiz's question.",
        parameters: [idParam, { name: "questionId", in: "path", required: true, schema: { type: "integer", minimum: 1 } }],
        responses: {
          200: ok({ type: "object", required: ["deleted"], properties: { deleted: { type: "boolean", const: true } } }, "Deleted."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: conflict("`not_found` (quiz) or `question_not_in_quiz`."),
          409: conflict("`wrong_quiz_kind` or `quiz_has_attempts`."),
        },
      },
    },
    "/api/v1/quizzes/{id}/publish": {
      post: {
        tags: ["Quizzes"],
        summary: "Publish or unpublish an ONLINE quiz",
        description:
          "Season-admin only. Body `{ publish: boolean }`. Publishing requires at least one question (409 `no_questions`) and every MCQ to have a `correctIndex` inside its options (409 `mcq_without_answer`); it is allowed while attempts exist. **Unpublishing is refused (409 `quiz_has_graded_attempts`) once any attempt is GRADED (D4)** — both student reads filter on `publishedAt`, so unpublishing would make graded students lose their own result. A PAPER quiz cannot be published (409 `wrong_quiz_kind`). Returns the new `publishedAt` (null when unpublished).",
        parameters: [idParam],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object", required: ["publish"], properties: { publish: { type: "boolean" } } },
            },
          },
        },
        responses: {
          200: ok(
            { type: "object", required: ["publishedAt"], properties: { publishedAt: { type: ["string", "null"], format: "date-time" } } },
            "The new publish state.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
          409: conflict("`wrong_quiz_kind`, `no_questions`, `mcq_without_answer` or `quiz_has_graded_attempts`."),
        },
      },
    },

    "/api/v1/quizzes/{id}/attempt": {
      put: {
        tags: ["Quizzes"],
        summary: "Start or resume the caller's attempt",
        description:
          "STUDENT only (staff get 403), in a season they can access. Idempotent create-or-resume: the first call creates attempt 1 (an upsert on the natural key, so concurrent calls cannot create two); later calls return the same attempt. The attempt is addressed by quiz, never by attempt id. 409 `quiz_not_published` if the quiz is PAPER or unpublished; 409 `attempt_closed` once the attempt is SUBMITTED or GRADED (a retake needs staff to reopen). Returns `StudentQuizDetail` without the answer key.",
        parameters: [idParam],
        responses: {
          200: ok({ $ref: "#/components/schemas/StudentQuizDetail" }, "The open attempt."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
          409: conflict("`quiz_not_published` or `attempt_closed`."),
        },
      },
      patch: {
        tags: ["Quizzes"],
        summary: "Save a batch of answers",
        description:
          "STUDENT only. Upserts one answer per question into the open attempt (1-100 per call); saving never grades. Validation, all-or-nothing before any write: 400 `question_not_in_quiz`; 400 `wrong_answer_type` (text on an MCQ, or an option index on an ESSAY); 400 `answer_out_of_range` (`selectedIndex` must be below **that question's** option count). 409 `no_attempt` if the quiz was never started; 409 `attempt_closed` once submitted.",
        parameters: [idParam],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["answers"],
                properties: {
                  answers: {
                    type: "array",
                    minItems: 1,
                    maxItems: 100,
                    items: {
                      type: "object",
                      required: ["questionId"],
                      properties: {
                        questionId: { type: "integer", minimum: 1 },
                        selectedIndex: { type: ["integer", "null"], minimum: 0 },
                        text: { type: ["string", "null"], maxLength: 20000 },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          200: ok({ type: "object", required: ["saved"], properties: { saved: { type: "integer" } } }, "How many answers were saved."),
          400: conflict("`bad_request`, `question_not_in_quiz`, `wrong_answer_type` or `answer_out_of_range`."),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          409: conflict("`no_attempt` or `attempt_closed`."),
        },
      },
    },
    "/api/v1/quizzes/{id}/attempt/submit": {
      post: {
        tags: ["Quizzes"],
        summary: "Submit the open attempt",
        description:
          "STUDENT only. Every question must be answered (409 `attempt_incomplete`; an essay must be non-blank). MCQs are scored all-or-nothing against the key, in the same request. A quiz with an ESSAY becomes `SUBMITTED` with `autoScore` set and no `totalScore` (a human must grade it, and nobody is notified). An all-MCQ quiz becomes `GRADED` immediately, `gradedById` stays null, and one `QUIZ_GRADED` notification (link `/student/quizzes`, v1's format) is created best-effort. 409 `attempt_closed` on a second submit. Returns `StudentQuizDetail`, now with `isCorrect`/`pointsAwarded` per MCQ but never the key.",
        parameters: [idParam],
        responses: {
          200: ok({ $ref: "#/components/schemas/StudentQuizDetail" }, "The submitted attempt."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
          409: conflict("`no_attempt`, `attempt_closed` or `attempt_incomplete`."),
        },
      },
    },

    "/api/v1/quizzes/{id}/attempts": {
      get: {
        tags: ["Quizzes"],
        summary: "The grading list for an ONLINE quiz",
        description:
          "Staff with a scope in the quiz's season (SUPER, season admin, leader of a group in it). **The student set is derived on the server** from the caller's scope (a leader sees only their own groups' ACTIVE enrolments) and is never accepted from the client. Pages over that set by student id (`cursor` = last student id of the previous page). `items` holds each student's latest attempt when it is SUBMITTED or GRADED, with the answer key (grader audience). `waiting` lists students with no gradable attempt — never started, or latest attempt still IN_PROGRESS (including one just reopened) — so nobody vanishes from the screen.",
        parameters: [
          idParam,
          { name: "cursor", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 50, default: 20 } },
        ],
        responses: {
          200: ok({ $ref: "#/components/schemas/QuizGradingPage" }, "One page of the grading list."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
    },
    "/api/v1/quizzes/{id}/attempts/{attemptId}/grade": {
      post: {
        tags: ["Quizzes"],
        summary: "Mark an attempt's essay answers",
        description:
          "Staff with a scope in the season; the attempt's student must be in the caller's own student set (403 `student_not_in_scope`), and the attempt must belong to this quiz (404). 409 `attempt_not_submitted` for an IN_PROGRESS attempt. `awards` must name **every** ESSAY question exactly once (400 `awards_incomplete`) and each award may not exceed that question's points (400 `score_exceeds_max` — rejected, not clamped). Sets `manualScore` = sum of awards, `totalScore` = stored `autoScore` + `manualScore`, status GRADED, `gradedById` = caller. The student gets a `QUIZ_GRADED` notification on a first grade or whenever the total changes; an identical re-save is silent. The response carries `answers: []` — refetch the list for the recomputed page.",
        parameters: [idParam, { name: "attemptId", in: "path", required: true, schema: { type: "integer", minimum: 1 } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["awards"],
                properties: {
                  awards: {
                    type: "array",
                    minItems: 1,
                    items: {
                      type: "object",
                      required: ["questionId", "points"],
                      properties: { questionId: { type: "integer", minimum: 1 }, points: { type: "integer", minimum: 0 } },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          200: ok({ $ref: "#/components/schemas/QuizGradingAttempt" }, "The graded attempt (with an empty `answers`)."),
          400: conflict("`bad_request`, `awards_incomplete` or `score_exceeds_max`."),
          401: errRef("Unauthorized"),
          403: conflict("`forbidden` or `student_not_in_scope`."),
          404: errRef("NotFound"),
          409: conflict("`attempt_not_submitted`."),
        },
      },
    },
    "/api/v1/quizzes/{id}/attempts/reopen": {
      post: {
        tags: ["Quizzes"],
        summary: "Grant a student a retake",
        description:
          "**A leader power, not admin-only:** any staff with a scope in the season may reopen, for a student in their own student set (403 `student_not_in_scope`). Creates a new attempt (`attemptNumber` + 1, IN_PROGRESS); earlier attempts and answers are preserved. 409 `quiz_not_published` (PAPER or unpublished), `no_attempt` (never attempted), `attempt_open` (latest attempt is already IN_PROGRESS). The student is notified (reusing `QUIZ_GRADED` with retake copy, link `/student/quizzes`).",
        parameters: [idParam],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["studentUserId"],
                properties: { studentUserId: { type: "integer", minimum: 1 } },
              },
            },
          },
        },
        responses: {
          201: ok(
            { type: "object", required: ["attemptId", "attemptNumber"], properties: { attemptId: { type: "integer" }, attemptNumber: { type: "integer" } } },
            "The new attempt.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: conflict("`forbidden` or `student_not_in_scope`."),
          404: errRef("NotFound"),
          409: conflict("`quiz_not_published`, `no_attempt` or `attempt_open`."),
        },
      },
    },

    "/api/v1/quizzes/{id}/grades": {
      get: {
        tags: ["Quizzes"],
        summary: "The PAPER grade sheet",
        description:
          "Staff with a scope in the quiz's season. One row per live student in the caller's server-derived student set (a leader: their own groups' ACTIVE enrolments; admin/SUPER: the whole season), name-ordered, with `score`/`notes` null for ungraded students and `gradedByName` as the audit trail.",
        parameters: [idParam],
        responses: {
          200: ok({ $ref: "#/components/schemas/QuizGradeSheet" }, "The sheet."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
      post: {
        tags: ["Quizzes"],
        summary: "Save PAPER grades in one batch",
        description:
          "Replaces v1's `saveQuizGradesAction`, which was unscoped twice over. (1) **One gate for every role:** any staff with a scope in *this quiz's season* (v1 checked the season only for LEADERs, so an ADMIN of any other season could write grades anywhere) — 403 `forbidden`. (2) **The student set is server-derived**, and every entry must be inside it: **the whole batch is rejected, nothing written,** with 403 `student_not_in_scope` if any entry is not (v1 upserted whatever ids it was sent). (3) **Atomic:** all upserts/deletes run in one transaction, and a score above the quiz's `maxScore` rejects the whole batch with 400 `score_exceeds_max` (not clamped). `score: null` **clears** that student's grade. A PAPER-only route: 409 `wrong_quiz_kind` for an ONLINE quiz. Students are notified (`QUIZ_GRADED`) only for a first grade or a changed score. Returns the sheet after the write.\n\nThere is deliberately no `DELETE /quizzes/{id}`.",
        parameters: [idParam],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["entries"],
                properties: {
                  entries: {
                    type: "array",
                    minItems: 1,
                    maxItems: 200,
                    items: {
                      type: "object",
                      required: ["studentUserId", "score"],
                      properties: {
                        studentUserId: { type: "integer", minimum: 1 },
                        score: { type: ["integer", "null"], minimum: 0, description: "Null clears the grade." },
                        notes: { type: ["string", "null"], maxLength: 1000 },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          200: ok({ $ref: "#/components/schemas/QuizGradeSheet" }, "The sheet after the write."),
          400: conflict("`bad_request` or `score_exceeds_max`."),
          401: errRef("Unauthorized"),
          403: conflict("`forbidden` or `student_not_in_scope`."),
          404: errRef("NotFound"),
          409: conflict("`wrong_quiz_kind`."),
        },
      },
    },
    "/api/v1/assignments/{id}/forum": {
      get: {
        tags: ["Forum"],
        summary: "The forum thread",
        description:
          "Existence first: a missing, deleted or non-FORUM assignment is 404 for every caller, then the audience gate (403). A STUDENT sees their own response plus their own group's posted responses once they have posted; until then `locked` is true and `posts` is empty — a product mechanic, not an error. LEADER: the groups they lead; ADMIN/SUPER: the season; MENTOR: read-only across the season (a widening of v1, taken so that moderation is possible). An unposted draft is never served. **This read never creates the submission row** — `PUT .../forum/response` does. No email address or avatar appears anywhere in the payload. Moderation beyond comment deletion does not exist (plan 14 D-14.4).",
        parameters: [
          idParam,
          { name: "cursor", in: "query", schema: { type: "string" }, description: "`nextCursor` of the previous page." },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 50, default: 10 } },
        ],
        responses: {
          200: ok({ $ref: "#/components/schemas/ForumView" }, "The thread."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
    },
    "/api/v1/assignments/{id}/forum/response": {
      put: {
        tags: ["Forum"],
        summary: "Post (or re-post) the caller's response",
        description:
          "**This PUT creates the submission row** (ruling C6 forbids a read-time write, so a GET must not). One upsert writes the body, `status = SUBMITTED` and `submittedAt` together; re-posting overwrites and re-stamps. It is the only writer of a FORUM submission — the generic submission routes answer 409 `use_forum_endpoint`. STUDENT only, targeted and ACTIVE-enrolled. `text` is plain text and is stored as escaped HTML. `forumMinWords` is applied to the same word count the client shows (400 `too_few_words`), and at least one word is always required. **A late post is allowed on purpose**: a discussion that closes at a deadline stops being a discussion.",
        parameters: [idParam],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/SubmitForumResponseRequest" } } },
        },
        responses: {
          200: ok({ $ref: "#/components/schemas/ForumOwnResponse" }, "The posted response."),
          400: conflict("`bad_request` or `too_few_words`."),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
    },
    "/api/v1/assignments/{id}/forum/posts/{publicId}/comments": {
      get: {
        tags: ["Forum"],
        summary: "A post's comments",
        description:
          "Oldest first, numeric cursor. The thread inlines only the first three per post. Same gates as the feed: assignment 404 first, then the audience (403), then the post must be a real (non-DRAFT) post inside the caller's audience, and a student must have posted their own response (403 `post_first` — a rule, not an error condition). `canDelete` is authoritative; the client must not re-derive it.",
        parameters: [
          idParam,
          publicIdParam,
          { name: "cursor", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
        ],
        responses: {
          200: ok({ $ref: "#/components/schemas/ForumCommentsPage" }, "One page of comments."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: conflict("`forbidden` or `post_first`."),
          404: errRef("NotFound"),
        },
      },
      post: {
        tags: ["Forum"],
        summary: "Comment on a post",
        description:
          "Allowed for a student in the post author's group who has posted their own response first (403 `post_first` otherwise), for the LEADER of that group and for the season ADMIN / SUPER without posting anything. A MENTOR stays read-only. The post must belong to the assignment in the path (404 otherwise). No notification is sent (no forum `NotificationType`; a cutover task). **No moderation beyond comment deletion exists** — there is no way to hide a post or report one (plan 14, D-14.4).",
        parameters: [idParam, publicIdParam],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/AddForumCommentRequest" } } },
        },
        responses: {
          201: ok(
            { type: "object", required: ["comment"], properties: { comment: { $ref: "#/components/schemas/ForumComment" } } },
            "The new comment.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: conflict("`forbidden` or `post_first`."),
          404: errRef("NotFound"),
        },
      },
    },
    "/api/v1/forum/comments/{commentId}": {
      delete: {
        tags: ["Forum"],
        summary: "Remove a comment",
        description:
          "The comment's author, SUPER, the season's ADMIN, or the LEADER of the post author's group (new: in v1 the staff power was unreachable from any UI). The post's own author may not remove someone else's comment. Hard delete — there is no `deletedAt` column. The only moderation lever that exists; see plan 14 D-14.4.",
        parameters: [{ name: "commentId", in: "path", required: true, schema: { type: "integer", minimum: 1 } }],
        responses: {
          200: ok(
            { type: "object", required: ["deleted"], properties: { deleted: { type: "boolean", enum: [true] } } },
            "Removed.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
    },
    "/api/v1/events": {
      get: {
        tags: ["Events"],
        summary: "List events",
        description:
          "**Visibility is derived from the token and cannot be widened by a parameter.** ALL: everyone. ALUMNI_ONLY: alumni (a STUDENT with a graduation year) and every non-student role. SEASON: the seasons the caller holds (a student's active season, an admin's seasons, a leader's groups' seasons); a MENTOR holds none, as in v1. SUPER sees everything, orphans included; no other role sees events on a soft-deleted season. The window is on `(endDate ?? date)`; when `from`/`to` are omitted it defaults to `[now - 30d, now + 365d]`. `upcoming=true` starts the window at today's organisation midnight (not combinable with `from`), `limit` (1-20) caps `events`, and `total` is counted before the cap. `allDay`, `dayKey` and `time` are server-derived against the organisation timezone. Event photo endpoints are deliberately absent while uploads are disabled.",
        parameters: [
          { name: "from", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "upcoming", in: "query", schema: { type: "boolean" } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 20 } },
        ],
        responses: {
          200: ok(
            {
              type: "object",
              required: ["events", "total"],
              properties: {
                events: { type: "array", items: { $ref: "#/components/schemas/JpcEventListItem" } },
                total: { type: "integer", minimum: 0 },
              },
            },
            "Events ordered by date, then id.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
        },
      },
      post: {
        tags: ["Events"],
        summary: "Create an event (SUPER only)",
        description:
          "SUPER only, checked before the body is read; an ADMIN is refused. The server composes the instant in the organisation timezone from `day`/`time`; `time: null` is all-day. The season is nulled unless visibility is SEASON. v1 returns only `{ success: true }`; this returns the detail.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/CreateJpcEventRequest" } } },
        },
        responses: {
          201: ok({ $ref: "#/components/schemas/JpcEventDetail" }, "The created event."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
        },
      },
    },
    "/api/v1/events/{id}": {
      get: {
        tags: ["Events"],
        summary: "Event detail",
        description:
          "v1 has no event detail page. The same visibility predicate as the list applies to the row; an event the caller may not see is 404, not 403, so it cannot be told from one that does not exist.",
        parameters: [idParam],
        responses: {
          200: ok({ $ref: "#/components/schemas/JpcEventDetail" }, "The event."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          404: errRef("NotFound"),
        },
      },
      patch: {
        tags: ["Events"],
        summary: "Update an event (SUPER only)",
        description:
          "A true partial, unlike v1 (whose update reuses the create schema). `createdById` is not touched. Visibility leaving SEASON detaches the season.",
        parameters: [idParam],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/UpdateJpcEventRequest" } } },
        },
        responses: {
          200: ok({ $ref: "#/components/schemas/JpcEventDetail" }, "The updated event."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
      delete: {
        tags: ["Events"],
        summary: "Delete an event (SUPER only)",
        description:
          "A hard delete — the model has no `deletedAt`, so a deleted event is unrecoverable. Its stored photo, if any, is left behind exactly as v1 leaves it; the blob lifecycle belongs with the CMS work. A stale id is 404, not a raw database error.",
        parameters: [idParam],
        responses: {
          200: ok(
            { type: "object", required: ["deleted"], properties: { deleted: { type: "boolean", enum: [true] } } },
            "Deleted.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
    },
    "/api/v1/sessions/{id}/video-quiz": {
      get: {
        tags: ["Video quiz"],
        summary: "The student's video quiz",
        description:
          "STUDENT with an **ACTIVE** enrolment in the session's season only (staff use the authoring read) — 403 otherwise. **`correctIndex` is absent from this payload by design**: it travels to a student on exactly one path, the answer response for the question they just answered. `videoId` is resolved server-side so no client parses a URL; `nextQuestionId` is the barrier, derived once.",
        parameters: [idParam],
        responses: {
          200: ok({ $ref: "#/components/schemas/StudentVideoQuiz" }, "The quiz and the caller's progress."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
    },
    "/api/v1/sessions/{id}/video-quiz/answers": {
      post: {
        tags: ["Video quiz"],
        summary: "Answer a video question",
        description:
          "Same gate as the read. **`out_of_order` (409) is the server-side barrier:** an answer is accepted only for the earliest unanswered question (`atSeconds` asc, `id` asc), which reproduces the ordering v1 enforced only inside its player component. It proves ordering, **not** that the video was watched — `furthestSeconds` is client-reported and no server can observe a YouTube playhead. The first answer is final; repeating a question replays the recorded verdict (200) instead of failing, including a double tap that loses the unique-index race. Completion is derived in the same transaction as the last answer. `furthestSeconds` only moves forward. A question belonging to another session is 404; an index outside the stored options is 400 `invalid_answer`.",
        parameters: [idParam],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/SubmitVideoAnswerRequest" } } },
        },
        responses: {
          200: ok({ $ref: "#/components/schemas/SubmitVideoAnswerResponse" }, "The verdict and the new progress."),
          400: conflict("`bad_request` or `invalid_answer`."),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
          409: conflict("`out_of_order` — answer the earlier questions first."),
        },
      },
    },
    "/api/v1/sessions/{id}/video-quiz/progress": {
      put: {
        tags: ["Video quiz"],
        summary: "Save playback progress",
        description:
          "Idempotent and monotone: `furthestSeconds` is `max(stored, sent)`, read and written in one transaction. **`completed` is not an accepted field** — a body carrying it is accepted but the key is ignored; completion is derived when the last question is answered, never asserted by the client.",
        parameters: [idParam],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/VideoProgressRequest" } } },
        },
        responses: {
          200: ok(
            {
              type: "object",
              required: ["furthestSeconds", "completedAt"],
              properties: { furthestSeconds: { type: "integer" }, completedAt: { type: ["string", "null"], format: "date-time" } },
            },
            "The stored progress.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
    },
    "/api/v1/sessions/{id}/video-questions": {
      get: {
        tags: ["Video quiz"],
        summary: "List video questions with the answer key",
        description:
          "Season ADMIN of the session's season, or SUPER — a group LEADER or MENTOR is refused (403). **This list carries `correctIndex` for every question and must never be requested by a student screen**; v1's equivalent authorized nothing and relied on the admin page being the only caller. Ordered by `atSeconds`, then `id`.",
        parameters: [idParam],
        responses: {
          200: ok(
            {
              type: "object",
              required: ["questions"],
              properties: { questions: { type: "array", items: { $ref: "#/components/schemas/VideoQuestionAdmin" } } },
            },
            "The questions.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
      post: {
        tags: ["Video quiz"],
        summary: "Add a video question",
        description:
          "Same gate as the list, checked **before** the body is validated. No check that the session has a `youtubeUrl` or that `atSeconds` fits the video (the length is not stored); the client guards that. `createdById` records who first authored the question.",
        parameters: [idParam],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/VideoQuestionInput" } } },
        },
        responses: {
          201: ok(
            { type: "object", required: ["question"], properties: { question: { $ref: "#/components/schemas/VideoQuestionAdmin" } } },
            "The created question.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
    },
    "/api/v1/video-questions/{questionId}": {
      patch: {
        tags: ["Video quiz"],
        summary: "Edit a video question and re-grade",
        description:
          "Full replacement of the authored fields (same body as create). **`regradedCount` exists because an edit rewrites history:** when the correct index or the options change, every recorded answer is re-evaluated in the same transaction (an index the shrunken options no longer contain can never be right) and the number whose verdict flipped is returned. `pointsChanged` is true when `points` moved — points are not stored on a response, so nothing is re-graded, but every earned score changed.",
        parameters: [questionIdParam],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/VideoQuestionInput" } } },
        },
        responses: {
          200: ok(
            {
              type: "object",
              required: ["question", "regradedCount", "pointsChanged"],
              properties: {
                question: { $ref: "#/components/schemas/VideoQuestionAdmin" },
                regradedCount: { type: "integer", minimum: 0 },
                pointsChanged: { type: "boolean" },
              },
            },
            "The updated question and the re-grade outcome.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
      delete: {
        tags: ["Video quiz"],
        summary: "Delete a video question",
        description:
          "**`responsesRemoved` counts destroyed student work:** the database cascade deletes every recorded answer to the question, so the client should warn with the `responseCount` it already holds and confirm with this number. `SessionVideoProgress` rows are deliberately left alone (v1 does the same; there is no soft-delete column).",
        parameters: [questionIdParam],
        responses: {
          200: ok(
            {
              type: "object",
              required: ["deleted", "responsesRemoved"],
              properties: { deleted: { type: "boolean", const: true }, responsesRemoved: { type: "integer", minimum: 0 } },
            },
            "Deleted.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
    },
    "/api/v1/sessions/{id}/video-quiz/results": {
      get: {
        tags: ["Video quiz"],
        summary: "Every student's video-quiz result",
        description:
          "Staff with a scope in the session's season (SUPER and season ADMIN: every ACTIVE student; a LEADER: their own groups' ACTIVE students — the same roster as attendance; a MENTOR is refused). One row per ACTIVE enrolment, including students who have answered nothing. New capability: v1 shows no student's video-quiz result to anybody.",
        parameters: [idParam],
        responses: {
          200: ok({ $ref: "#/components/schemas/VideoQuizResults" }, "The results."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
    },
  },
} as const;
