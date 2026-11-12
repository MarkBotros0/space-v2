import { conflict, errRef, ok } from "../helpers";
import { idParam } from "../shared/params";
import { seasonContentPaths } from "./season-contents";

/** `/api/v1/seasons/*`. Assembled into the document by `../openapi.ts`. */
export const seasonPaths = {
  "/api/v1/seasons": {
    get: {
      tags: ["Seasons"],
      summary: "Seasons visible to the caller",
      description:
        "SUPER and MENTOR see all; ADMIN sees their scoped seasons; LEADER sees DRAFT and ACTIVE seasons containing a group they lead (a former leader has no access to a finished season); STUDENT sees seasons they are enrolled in. Filtering happens in the query, so a season you cannot see is never read.",
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
        "SUPER only (spec 02 D3). Title is derived as '<program> <year>'. Unlike v1, the absence budget fields are persisted on create (D1). A soft-deleted season still reserves its code. `status` must be `DRAFT` (400 otherwise): no season skips Start.",
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/SeasonWriteRequest" } } },
      },
      responses: {
        201: ok({ type: "object", properties: { id: { type: "integer" }, code: { type: "string" } } }, "Created."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        409: conflict(
          "`code_taken` — the slugified code is in use (also returned for the unique-index race, D15; D15's generic `conflict` is deliberately more specific here).",
        ),
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
        "Asymmetric by role (spec 02 D3). SUPER sends the full SeasonWriteRequest (v1's whole-body update; title re-derived). A season ADMIN sends a partial body containing only `description`, `absenceBudgetMinutes`, `absenceWeightMinutes`; any other key is refused with 403 `forbidden_field` rather than stripped. Status moves (SUPER): only an unchanged status and COMPLETED to or from ARCHIVED are allowed. DRAFT to ACTIVE is 409 `use_start_season` (see `POST /seasons/{id}/start`); anything else from DRAFT is 409 `invalid_status_change`; anything else from ACTIVE is 409 `use_end_season`; COMPLETED or ARCHIVED back to ACTIVE or DRAFT is 409 `season_finished`; a status that changed while the request ran (a Start landing first) is 409 `season_changed`, and nothing is written.",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/SeasonWriteRequest" } } },
      },
      responses: {
        200: ok({ type: "object", properties: { id: { type: "integer" }, code: { type: "string" } } }, "Updated."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: conflict(
          "`forbidden` (not SUPER, not this season's ADMIN) or `forbidden_field` (ADMIN sent an identity field).",
        ),
        404: errRef("NotFound"),
        409: conflict(
          "`code_taken`, `use_start_season`, `use_end_season`, `invalid_status_change`, `season_finished` or `season_changed`.",
        ),
      },
    },
    delete: {
      tags: ["Seasons"],
      summary: "Soft-delete a season",
      description:
        "SUPER only. Refused with 409 `season_in_use` while the season has any enrollment or session — archive it instead (decision on spec 02 D4). The check and the delete run under the season's lock, so a seat going in lands wholly before the check or finds the season gone. The current season is derived from live seasons, so a deleted one drops out of every scope on its own; its staff's sessions go stale, so their claims change on the next refresh.",
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
        "SUPER only. Creates a DRAFT season copying program, `requiredProgram`, `graduatesOnPass`, `isCommunityWide`, description and the budget fields; groups (name/description only — leaders and students are NOT copied), sessions and non-deleted assignments (their settings and reminder, parts in order, each video's timed questions; no student work), every date shifted by (startDate − source.startDate). Recurrence series get FRESH ids (v1 copied them, letting series edits cross seasons — ruling C10). `code` defaults to slugify('<program> <year>'). A soft-deleted source is 404.",
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
  "/api/v1/seasons/{id}/end-check": {
    get: {
      tags: ["Seasons"],
      summary: "What blocks a season from ending",
      description:
        "Season-admin only (SUPER passes). Blockers: SUBMITTED submissions and quiz attempts awaiting a grade (not one whose student has the admin's score on that quiz, which counts instead), and finished sessions (`startsAt + durationMinutes` before now) with ACTIVE students unmarked (`missing`, counting only students enrolled by the time the session started). Drafts, returned work, in-progress attempts, soft-deleted assignments and students never block. `students` lists the ACTIVE, non-deleted students with their group, their three passing `numbers` and `attendancePct` (the attendance number as a whole percent: PRESENT + LATE over the sessions that have started since they enrolled, 0 with none). `criteria` is the season's pass criteria, or the default when it has none (`isDefault`); `available` says which numbers the season has anything for. The screen computes each score from `numbers` and the criteria with the shared `weightedScore`, as End recomputes it. `graduatesOnPass` says whether passing makes them alumni. 409 `season_not_active` unless the season is ACTIVE.",
      parameters: [idParam],
      responses: {
        200: ok(
          {
            type: "object",
            properties: {
              graduatesOnPass: { type: "boolean" },
              criteria: { $ref: "#/components/schemas/PassCriteria" },
              isDefault: { type: "boolean" },
              available: { $ref: "#/components/schemas/SeasonAvailability" },
              blockers: {
                type: "object",
                properties: {
                  submissions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        publicId: { type: "string" },
                        assignmentTitle: { type: "string" },
                        studentName: { type: "string" },
                      },
                    },
                  },
                  quizAttempts: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        quizId: { type: "integer" },
                        attemptId: { type: "integer" },
                        quizTitle: { type: "string" },
                        studentName: { type: "string" },
                      },
                    },
                  },
                  attendance: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        sessionId: { type: "integer" },
                        title: { type: "string" },
                        startsAt: { type: "string", format: "date-time" },
                        missing: { type: "integer" },
                      },
                    },
                  },
                },
              },
              students: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    userId: { type: "integer" },
                    name: { type: "string" },
                    groupName: { type: "string", nullable: true },
                    attendancePct: { type: "integer" },
                    graduationYear: { type: "integer", nullable: true },
                    numbers: { $ref: "#/components/schemas/PassingNumbers" },
                  },
                },
              },
            },
          },
          "The end check.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict("`season_not_active`."),
      },
    },
  },
  ...seasonContentPaths,
} as const;
