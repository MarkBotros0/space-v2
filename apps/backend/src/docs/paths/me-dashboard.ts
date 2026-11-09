import { errRef, ok } from "../helpers";

/** `/api/v1/me/dashboard`, spread into `mePaths` (./me.ts). */
export const meDashboardPaths = {
  "/api/v1/me/dashboard": {
    get: {
      tags: ["Me"],
      summary: "The caller's role dashboard figures",
      description: [
        "A discriminated union on `variant` (spec 19 §7). Every figure is derived once, server-side (ruling C4); clients render, never recompute.",
        "",
        "- **STUDENT** (not graduated, or an alumnus studying in a community-wide season): the caller's own figures only — no cohort, no other student, no score (C8). Season from the token's `activeSeasonId`; `seasonId` is ignored. With no active season every field but `variant` is null.",
        "- **SEASON_STAFF**: `seasonId` required. ADMIN must administer it, SUPER may name any, a LEADER gets `scope: \"groups\"` over the ACTIVE enrolments of the groups they lead in it. Attendance % starts at each student's enrolment and never exceeds 100; `atRisk` is the shared `isAtRisk` (either component below 60), not v1's 70 % rule; review counts use the review queue's own scope; ONLINE quiz drafts are counted as `drafts`.",
        "- **MENTOR**: the eight most recent attendance marks, submissions and reviews across all seasons, merged and newest first (reviews at `reviewedAt`), excluding DRAFT work, deleted students and graduated ones (an alumnus counts only for their marks in the community-wide season they study in) and deleted assignments or seasons. The mentor's at-risk list is `GET /api/v1/reports/engagement`.",
        "- An alumnus gets 403, unless studying (holding an ACTIVE place in a community-wide season): they get the student variant.",
        "",
        "`nextSession` is the session in progress (`isInProgress: true`) if there is one, else the next; `dayKey`/`time` are the organisation's calendar day and wall-clock time.",
      ].join("\n"),
      parameters: [
        {
          name: "seasonId",
          in: "query",
          required: false,
          description: "Required for ADMIN, LEADER and SUPER; ignored for STUDENT and MENTOR.",
          schema: { type: "integer", minimum: 1 },
        },
      ],
      responses: {
        200: ok(
          {
            oneOf: [
              {
                type: "object",
                description: "variant STUDENT",
                properties: {
                  variant: { const: "STUDENT" },
                  todayOrgDay: {
                    type: "string",
                    format: "date",
                    description:
                      "Today's organisation-calendar day (ORG_TIMEZONE). Always present, also when the student is not enrolled.",
                  },
                  season: { type: ["object", "null"] },
                  progress: {
                    type: ["object", "null"],
                    properties: {
                      sessionsHeld: { type: "integer" },
                      sessionsTotal: { type: "integer" },
                      pct: { type: ["integer", "null"] },
                    },
                  },
                  nextSession: { type: ["object", "null"] },
                  assignments: {
                    type: ["object", "null"],
                    properties: {
                      outstandingCount: {
                        type: "integer",
                        description: "PENDING or DRAFT, targeted assignments only.",
                      },
                      overdueCount: { type: "integer" },
                      lateSubmittedCount: { type: "integer" },
                      dueSoon: {
                        type: "array",
                        maxItems: 3,
                        items: { $ref: "#/components/schemas/StudentAssignmentListItem" },
                      },
                      open: {
                        type: "array",
                        description:
                          "Every PENDING, DRAFT or RETURNED assignment, uncapped, `dueAt` ascending with undated last, then id. RETURNED rows are open work but not in `outstandingCount`.",
                        items: { $ref: "#/components/schemas/StudentAssignmentListItem" },
                      },
                    },
                  },
                },
              },
              {
                type: "object",
                description: "variant SEASON_STAFF",
                properties: {
                  variant: { const: "SEASON_STAFF" },
                  todayOrgDay: {
                    type: "string",
                    format: "date",
                    description:
                      "Today's organisation-calendar day (ORG_TIMEZONE). Staff screens count past, live and next sessions from this, not from the device's day.",
                  },
                  scope: { enum: ["season", "groups"] },
                  season: { type: "object" },
                  groups: { type: "array", items: { type: "object" } },
                  progress: { type: "object" },
                  nextSession: { type: ["object", "null"] },
                  cohort: {
                    type: "object",
                    properties: {
                      studentCount: { type: "integer" },
                      meanAttendancePct: {
                        type: ["integer", "null"],
                        description: "Mean over students with at least one past session; null when none.",
                      },
                      atRiskTotal: { type: "integer" },
                      atRisk: { type: "array", maxItems: 10, items: { type: "object" } },
                    },
                  },
                  submissions: {
                    type: "object",
                    properties: { pendingReview: { type: "integer" }, reviewed: { type: "integer" } },
                  },
                  quizzes: {
                    type: "object",
                    properties: {
                      total: { type: "integer" },
                      pending: { type: "integer" },
                      fullyGraded: { type: "integer" },
                      drafts: { type: "integer" },
                    },
                  },
                  leaderSession: {
                    type: ["object", "null"],
                    description:
                      'Present only for `scope: "groups"` (a LEADER): the check-in counts of the leader\'s groups for `nextSession` (read-only). Null when there is no next session; the key is absent for ADMIN/SUPER.',
                    required: ["sessionId", "total", "present", "late", "absent", "notCheckedIn"],
                    additionalProperties: false,
                    properties: {
                      sessionId: { type: "integer", description: "Equals `nextSession.id`." },
                      total: { type: "integer", description: "ACTIVE students in the leader's groups." },
                      present: { type: "integer" },
                      late: { type: "integer" },
                      absent: { type: "integer" },
                      notCheckedIn: {
                        type: "array",
                        description: "Students with no attendance mark yet; name falls back to the email when blank.",
                        items: {
                          type: "object",
                          required: ["id", "name"],
                          additionalProperties: false,
                          properties: { id: { type: "integer" }, name: { type: "string" } },
                        },
                      },
                    },
                  },
                },
              },
              {
                type: "object",
                description: "variant MENTOR",
                properties: {
                  variant: { const: "MENTOR" },
                  recentActivity: { type: "array", maxItems: 8, items: { type: "object" } },
                },
              },
            ],
          },
          "The caller's dashboard variant.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
  },
} as const;
