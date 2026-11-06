import { conflict, errRef, ok } from "../helpers";
import { idParam } from "../shared/params";

/** `/api/v1/students/*`. Assembled into the document by `../openapi.ts`. */
export const studentPaths = {
  "/api/v1/students": {
    get: {
      tags: ["Students"],
      summary: "Student list (active, alumni or dropped)",
      description:
        "One endpoint serves all three list surfaces, selected by `status` (default `active`).\n\nScope is per role: SUPER and MENTOR read every student; ADMIN gets the students ever enrolled in their seasons; LEADER gets the students whose **enrollment** names one of their groups (C9 — never GroupStudent). `alumni` (graduationYear set) is refused with 403 `forbidden` to LEADER. `dropped` lists WITHDRAWN enrollments, not students (a student dropped from three seasons appears three times; rows carry `droppedEnrollment`) and is SUPER/ADMIN only — it hands out drop reasons, so MENTOR and LEADER get 403. STUDENT is refused on every surface.\n\nPagination is cursor-based: pass the last row's id (the enrollment id when `status=dropped`) as `cursor`; `nextCursor` is null on the last page. `total` is the whole population under the current filters, not the page size (D14). `q` matches name, email or university, case-insensitive.",
      parameters: [
        { name: "status", in: "query", schema: { type: "string", enum: ["active", "alumni", "dropped"], default: "active" } },
        { name: "seasonId", in: "query", description: "Has an enrollment in this season (any status).", schema: { type: "integer", minimum: 1 } },
        { name: "groupId", in: "query", description: "Only students whose displayed current group (`currentGroupName`: their most recent GroupStudent membership, any season) is this group; `none` is v1's \"Unassigned\". ANDed with scope. Ignored for `status=dropped`. (REG-82)", schema: { oneOf: [{ type: "integer", minimum: 1 }, { type: "string", enum: ["none"] }] } },
        { name: "sort", in: "query", description: "v1's sort keys. A missing value sorts as an empty string: first ascending, last descending. Omitted keeps the list's own order (name; graduation year for alumni). Ignored for `status=dropped`. (REG-82)", schema: { type: "string", enum: ["name", "university", "season", "group"] } },
        { name: "dir", in: "query", schema: { type: "string", enum: ["asc", "desc"], default: "asc" } },
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
        "SUPER only (v1 admitted any ADMIN with no season scoping). **There is no password field, by design (D7):** v1's hard-coded `ChangeMe123!` is not ported. The account is created with no password and an invite is minted in the same transaction and emailed after commit, as `POST /users` does it. A mail failure (or no mail transport) never rolls back the student: the undelivered invite is expired again so the account reads `pending`, and the response says `inviteSent: false` (re-send from `POST /users/{id}/invite`). The code never appears in any response. The student sets a password by accepting the invite. When `seasonId` is given, one transaction creates the user, the profile, an ACTIVE enrollment; the student's current season is derived from that enrolment, never stored (D1). Empty strings are stored as null.",
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
                faculty: { type: ["string", "null"], maxLength: 160 },
                universityGraduationYear: { type: ["integer", "null"], minimum: 1950, maximum: 2100, description: "University graduation year; may be in the future. Not the JPCS graduationYear." },
                phone: { type: ["string", "null"], maxLength: 60, description: "Stored on the User (account-level)." },
                dateOfBirth: { type: ["string", "null"], format: "date-time", description: "Stored on the User (account-level)." },
                notes: { type: ["string", "null"], maxLength: 4000 },
                seasonId: { type: ["integer", "null"] },
              },
            },
          },
        },
      },
      responses: {
        201: ok(
          {
            type: "object",
            required: ["id", "email", "inviteSent"],
            properties: {
              id: { type: "integer" },
              email: { type: "string" },
              inviteSent: { type: "boolean", description: "False when the invite email could not be delivered." },
            },
          },
          "Created.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict("`season_finished` when `seasonId` names a COMPLETED or ARCHIVED season, or `email_taken` — also for a soft-deleted student's address, which stays reserved."),
      },
    },
  },

  "/api/v1/students/{id}/attendance": {
    get: {
      tags: ["Students"],
      summary: "A student's attendance history (staff only)",
      description:
        "v1's student record listed the 100 most recent attendance marks across seasons (REG-83). Staff only — STUDENT, the subject included, gets 403. Row scope follows the underlying gates: SUPER and MENTOR every season; ADMIN only seasons they administer; LEADER only seasons whose enrolment names one of their groups (C9). Newest session first. 403 before 404.",
      parameters: [idParam],
      responses: {
        200: ok(
          { type: "object", properties: { history: { type: "array", items: { $ref: "#/components/schemas/StudentAttendanceHistoryItem" } } } },
          "The history.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
  },
  "/api/v1/students/{id}/submissions": {
    get: {
      tags: ["Students"],
      summary: "A student's submissions (staff only)",
      description:
        "v1's student record listed the student's 100 most recent submissions (REG-83). Same staff-only gate and row scope as the attendance history. Newest first; a DRAFT is never listed (the student's private work in progress, hidden from every reviewer surface). Link a row to `GET /submissions/{publicId}`.",
      parameters: [idParam],
      responses: {
        200: ok(
          { type: "object", properties: { submissions: { type: "array", items: { $ref: "#/components/schemas/StudentSubmissionItem" } } } },
          "The submissions.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
  },
  "/api/v1/students/{id}": {
    get: {
      tags: ["Students"],
      summary: "Student detail, shaped by the caller's role",
      description:
        "The row gate lives here: SUPER and MENTOR may read any student, the student may read themselves, an ADMIN a student ever enrolled in one of their seasons, a LEADER a student whose enrollment names one of their groups (C9). Everyone else gets 403; a soft-deleted or non-student id is 404.\n\nThe payload is narrowed per role, not just the access (C8): see `StudentDetail` for which profile fields exist on the wire for MENTOR/LEADER (phone, dateOfBirth, notes are absent) and why the subject never receives `notes`. Per-row `dropReason` is staff-only: null for MENTOR, LEADER and the student themselves.",
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
        "Absent field = untouched, `null` = cleared. The set of keys a caller may send is allowlisted per role, checked against the raw body before validation; a key outside it is refused with 403 `forbidden_field` (v1 silently dropped it). The subject may edit university, faculty, universityGraduationYear, phone and dateOfBirth only (never `name` — that is PATCH /me — nor `email`, `notes` or `activeSeasonId`). phone and dateOfBirth are written to the User row. ADMIN (of a season with an ACTIVE enrollment for the student) adds `name`, `email` and `notes`. SUPER may send everything except `activeSeasonId`, which no role may send: it is derived from enrolments and is refused with 403 `forbidden_field`. `409 email_taken` on an address clash.",
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
                faculty: { type: ["string", "null"] },
                universityGraduationYear: { type: ["integer", "null"], minimum: 1950, maximum: 2100, description: "University graduation year; may be in the future. Not the JPCS graduationYear." },
                phone: { type: ["string", "null"] },
                dateOfBirth: { type: ["string", "null"], format: "date-time" },
                notes: { type: ["string", "null"] },
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
        409: conflict("`email_taken`."),
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
        "SUPER only (R55). Body `{ graduationYear }`, 1990 through the current year, evaluated per request. In one transaction: sets `graduationYear`, completes **every** ACTIVE enrollment (v1 completed only the one the profile pointed at), and marks the student's sessions stale so the current-season claim is re-read. WITHDRAWN and COMPLETED enrollments are untouched; `role` stays STUDENT. Irreversible: a second graduation is 409 `already_graduated`. `not_found` covers a non-student or deleted id. Writes a server-side audit line (ids only).",
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
        "Season-admin of the **target** season (SUPER passes); gated before any lookup. Creates an ACTIVE enrollment and marks the student's sessions stale; the current season is derived from live enrolments, never stored. One enrollment per student per season, ever: a second attempt \u2014 even over a WITHDRAWN row \u2014 is 409 `already_enrolled`. A COMPLETED or ARCHIVED season takes no enrollments: 409 `season_finished`, even for SUPER.\n\nBoundary: this endpoint owns enrollment existence and status only. `groupId` is written exclusively by `PATCH /api/v1/groups/{id}` \u2014 group membership is written only there. Enrollment rows are never deleted.",
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
        409: conflict("`already_enrolled` or `season_finished`."),
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

} as const;
