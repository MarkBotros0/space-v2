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

import { errorResponse } from "./helpers";
import { videoEventsForumSchemas } from "./components/video-events-forum";
import { enumsNotificationsNotesSchemas } from "./components/enums-notifications-notes";
import { quizSchemas } from "./components/quizzes";
import { peopleSchemas } from "./components/people";
import { sessionsAssignmentsSchemas } from "./components/sessions-assignments";
import { submissionsMeSchemas } from "./components/submissions-me";
import { authPaths } from "./paths/auth";
import { mePaths } from "./paths/me";
import { seasonEndPaths } from "./paths/season-end";
import { seasonPaths } from "./paths/seasons";
import { peopleCandidatePaths } from "./paths/people-candidates";
import { seasonAdminPaths, seasonAdminSchemas } from "./paths/season-admins";
import { groupPaths } from "./paths/groups";
import { userPaths } from "./paths/users";
import { studentPaths } from "./paths/students";
import { notesNotificationsPaths } from "./paths/notes-notifications";
import { sessionPaths } from "./paths/sessions";
import { assignmentsSubmissionsPaths } from "./paths/assignments-submissions";
import { quizAuthoringPaths } from "./paths/quizzes-authoring";
import { quizAttemptsPaths } from "./paths/quizzes-attempts";
import { forumEventsPaths } from "./paths/forum-events";
import { videoQuizPaths } from "./paths/video-quiz";
import { reportsImportsPaths } from "./paths/reports-imports";

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
      "**Maintenance.** While `READ_ONLY` is on, every non-GET request except",
      "`POST /api/v1/auth/login|refresh|logout` answers `503 read_only` with",
      "`Retry-After: 600`.",
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
    { name: "Imports", description: "Paste-first bulk entry: SUPER student importer and season-scoped group importer (preview, then commit)" },
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
      ...videoEventsForumSchemas,
      ...enumsNotificationsNotesSchemas,
      ...quizSchemas,
      ...peopleSchemas,
      ...sessionsAssignmentsSchemas,
      ...submissionsMeSchemas,
      ...seasonAdminSchemas,
    },
  },

  paths: {
    ...authPaths,
    ...mePaths,
    ...seasonPaths,
    ...seasonEndPaths,
    ...seasonAdminPaths,
    ...peopleCandidatePaths,
    ...groupPaths,
    ...userPaths,
    ...studentPaths,
    ...notesNotificationsPaths,
    ...sessionPaths,
    ...assignmentsSubmissionsPaths,
    ...quizAuthoringPaths,
    ...quizAttemptsPaths,
    ...forumEventsPaths,
    ...videoQuizPaths,
    ...reportsImportsPaths,
  },
} as const;
