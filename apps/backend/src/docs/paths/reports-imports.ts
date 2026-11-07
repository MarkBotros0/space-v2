import { conflict, errRef, ok } from "../helpers";
import { groupImportPreviewDoc, groupImportResultDoc, importTemplateDoc, pastedSheetBodyDoc, studentImportCommitBodyDoc, studentImportPreviewDoc, studentImportResultDoc } from "../shared/imports";
import { idParam } from "../shared/params";
import { EXPORT_COMMON, engagementStudentPageSchemaDoc, engagementSummarySchemaDoc, exportManifestSchemaDoc, organisationReportSchemaDoc, xlsxResponse } from "../shared/reports";

/** Reports, exports and imports. Assembled into the document by `../openapi.ts`. */
export const reportsImportsPaths = {
  "/api/v1/reports/engagement": {
    get: {
      tags: ["Reports"],
      summary: "Engagement summary for the caller's permitted seasons",
      description:
        "Charts, band counts and the capped at-risk list. The cohort is NOT included — " +
        "see /api/v1/reports/engagement/students.\n\n" +
        "Scope: `seasonId` may repeat. The requested ids are INTERSECTED with the " +
        "caller's permitted set (SUPER/MENTOR: every non-deleted season; ADMIN: every " +
        "season they hold or held a SeasonAdmin row in, finished ones included, for Reports' History); ids outside it are dropped silently and `scope.truncated` is " +
        "set. LEADER and STUDENT are refused.\n\n" +
        "Metrics: `attendanceTrend[].pct` divides by the roster as it stood at that " +
        "session's instant, so it cannot exceed 100 and is `null` when nobody was " +
        "enrolled yet. `completion[].completionRate` is a per-ASSIGNMENT figure and is " +
        "not the same unit as a per-student submission percentage. A row's `band` is " +
        "the at-risk answer: `AT_RISK` means either engagement component is below 60, " +
        "and the at-risk list is exactly the rows in that band.\n\n" +
        "Times: `startsAt` is a raw UTC instant (for ordering); `dayKey` is its " +
        "organisation-calendar day (YYYY-MM-DD, ORG_TIMEZONE), which clients label by.",
      parameters: [
        { name: "seasonId", in: "query", required: false, schema: { type: "array", items: { type: "integer" } }, style: "form", explode: true },
        { name: "from", in: "query", required: false, schema: { type: "string", format: "date-time" } },
        { name: "to", in: "query", required: false, schema: { type: "string", format: "date-time" } },
        { name: "trendLimit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 200, default: 26 } },
      ],
      responses: {
        200: ok(engagementSummarySchemaDoc, "Engagement summary"),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
      },
    },
  },
  "/api/v1/reports/engagement/students": {
    get: {
      tags: ["Reports"],
      summary: "The engagement cohort, paged",
      description:
        "SEPARATELY GATED from the summary (same roles: SUPER, MENTOR, ADMIN; LEADER " +
        "and STUDENT refused) and absent from the summary's payload on purpose — v1 " +
        "shipped every student's name, email and scores to every screen (R34).\n\n" +
        "One row per participant's ENROLMENT (ACTIVE; in a finished season also COMPLETED), so a student in two in-scope seasons appears " +
        "twice. Ordered by score ascending, then studentUserId, then seasonId. " +
        "`cursor` is opaque; a malformed cursor restarts the list. `band` filters to " +
        "one engagement band. Scope intersection is identical to the summary's.",
      parameters: [
        { name: "seasonId", in: "query", required: false, schema: { type: "array", items: { type: "integer" } }, style: "form", explode: true },
        { name: "band", in: "query", required: false, schema: { type: "string", enum: ["HIGH", "MEDIUM", "LOW", "AT_RISK"] } },
        { name: "cursor", in: "query", required: false, schema: { type: "string" } },
        { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 200, default: 50 } },
      ],
      responses: {
        200: ok(engagementStudentPageSchemaDoc, "One page of the cohort"),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
      },
    },
  },
  "/api/v1/reports/organisation": {
    get: {
      tags: ["Reports"],
      summary: "Organisation roll-up (SUPER only)",
      description:
        "Counts across the whole organisation; every other role is refused with 403.\n\n" +
        "`totalStudentsNotGraduated` counts student ACCOUNTS (role STUDENT, no " +
        "graduationYear, not deleted), not enrolments — the same population v1 " +
        "labelled \"Current students\", renamed so the label stops overclaiming (D4). " +
        "`withdrawnCount` is the WITHDRAWN enrolment status, displayed as \"Dropped\". " +
        "Season rows carry `code` beside `seasonId` so a client can address the " +
        "season detail route by code (D13).",
      responses: {
        200: ok(organisationReportSchemaDoc, "Organisation roll-up"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
      },
    },
  },
  "/api/v1/reports/engagement/export": {
    get: {
      tags: ["Reports"],
      summary: "Engagement export (XLSX) for the caller's permitted seasons",
      description:
        EXPORT_COMMON + "\n\n" +
        "Roles: SUPER, ADMIN (their seasons) and MENTOR. MENTOR may take THIS export — " +
        "it is the data v1 shows mentors on screen — and may not take the season " +
        "workbook. Scope intersection is identical to /reports/engagement. " +
        "`?format=csv` is refused with a legible 400: XLSX is the only format (D7).",
      parameters: [
        { name: "seasonId", in: "query", required: false, schema: { type: "array", items: { type: "integer" } }, style: "form", explode: true },
        { name: "format", in: "query", required: false, schema: { type: "string", enum: ["xlsx"], default: "xlsx" } },
      ],
      responses: {
        200: xlsxResponse,
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        429: errRef("TooManyRequests"),
      },
    },
  },
  "/api/v1/seasons/{id}/exports/workbook": {
    get: {
      tags: ["Reports"],
      summary: "Season workbook (XLSX): attendance, grades, assignments, key",
      description:
        EXPORT_COMMON + "\n\n" +
        "Roles: SUPER, or an ADMIN of this season. MENTOR is REFUSED — a deliberate " +
        "divergence from v1, whose only mentor protection was an unrendered button " +
        "(spec D6 #3). A soft-deleted season is 404.\n\n" +
        "`Submitted %` divides by the assignments assigned to that student (ruling C5), " +
        "which CHANGES its value relative to v1 for any season with a group-targeted " +
        "assignment. LATE attendance cells render \"L\": the recorded minutes are " +
        "measured from the wrong instant for v1-era rows, and nothing tells those apart, so they are withheld " +
        "(ruling C3).",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
      responses: {
        200: xlsxResponse,
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        429: errRef("TooManyRequests"),
      },
    },
  },
  "/api/v1/seasons/{id}/exports/manifest": {
    get: {
      tags: ["Reports"],
      summary: "What the season workbook will contain, without building it",
      description:
        "Same gate as the workbook (a manifest a caller cannot act on is a size oracle). " +
        "Returns the exact filename the workbook download will carry, the sheet list, an " +
        "estimated byte size for a cellular-data warning, and a scope description. Not " +
        "rate-limited: it builds nothing.",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
      responses: {
        200: ok(exportManifestSchemaDoc, "Workbook manifest"),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
  },
  "/api/v1/imports/students/preview": {
    post: {
      tags: ["Imports"],
      summary: "Preview a pasted student sheet (SUPER only)",
      description:
        "SUPER only, deliberately (spec D3) - not an oversight. Body is `{ text, delimiter? }`: **pasted text, not multipart**. An import sheet is read once, parsed in memory and never stored, so it is not an 'upload' and is not gated by `ENABLE_UPLOADS`. " +
        "Every row is classified against the file and the live database: `new`, `exists` (email matched case-insensitively), `duplicate` (repeated earlier in the paste), `invalid` (fails the same validation as `POST /students`), or `previously_removed` (v2's addition: the address belongs to a soft-deleted user, who is never resurrected). " +
        "`unrecognisedColumns` echoes header cells that matched no alias. Each row carries its `values` so the client can resubmit them; the commit re-derives every status itself and trusts none of this. " +
        "Limits: 2000 rows, 256 KB of text. 400 `bad_request` carries the operator-facing parse message. Rate limited (429).",
      requestBody: { required: true, content: { "application/json": { schema: pastedSheetBodyDoc } } },
      responses: {
        200: ok(studentImportPreviewDoc, "Row-by-row classification."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        413: conflict("`payload_too_large`."),
        429: errRef("TooManyRequests"),
      },
    },
  },
  "/api/v1/imports/students/template": {
    get: {
      tags: ["Imports"],
      summary: "Student import column schema (SUPER only)",
      description:
        "The accepted columns as data, a copyable tab-separated header row, the caps, and `capabilities: { pasteText: true, fileUpload: false }` so the screen can say why there is no file picker.",
      responses: {
        200: ok(importTemplateDoc, "Template."),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
      },
    },
  },
  "/api/v1/imports/students/commit": {
    post: {
      tags: ["Imports"],
      summary: "Commit a student import (SUPER only)",
      description:
        "SUPER only. The body carries cell **values and a row number, never a status**: the server re-validates every row and re-runs the existence lookup inside the transaction, so a client cannot commit a row the server would have refused. " +
        "**All-or-nothing**: any unimportable row answers `422 import_rows_invalid` naming the row numbers and nothing is written (deliberate divergence from v1, which committed row-by-row and left partial imports behind). " +
        "**Idempotent by email**, matched case-insensitively and stored exactly as sent: a re-run creates nothing. In-paste repeats are skipped. " +
        "`onExisting` is required. `skip` reproduces v1. `enroll` (season mode only) enrols an existing live STUDENT using the same rules as `POST /students/{id}/enrollments` (an existing enrolment of any status is left alone and reported `skipped`; the current season is derived from the enrolment) and writes no other field. A soft-deleted or staff address is always skipped. " +
        "Every enrolment runs the check in `POST /seasons/{id}/enrollments`, one row at a time: a refused row is `skipped` with the reason in its `message` and the others still go ahead. A new row in a season with a required program is refused the same way, as someone who never finished it, and no account is created. " +
        "Created accounts have no credential and no invite is sent. Outcomes are `created` / `skipped` / `enrolled`; there is no `failed`. " +
        "404 `not_found` for a soft-deleted season; 409 `season_finished` for a COMPLETED or ARCHIVED season; 409 `import_conflict` for a concurrent create (nothing was written; re-running is safe); 429.",
      requestBody: { required: true, content: { "application/json": { schema: studentImportCommitBodyDoc } } },
      responses: {
        200: ok(studentImportResultDoc, "Per-row outcomes."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict("`import_conflict` or `season_finished`."),
        413: conflict("`payload_too_large`."),
        422: conflict("`import_rows_invalid`."),
        429: errRef("TooManyRequests"),
      },
    },
  },
  "/api/v1/seasons/{id}/imports/groups/preview": {
    post: {
      tags: ["Imports"],
      summary: "Preview a pasted group-assignment sheet (season admin or SUPER)",
      description:
        "Gate is `isAdminOfSeason` on the **path** id (SUPER short-circuits), so preview and commit cannot target different seasons. Body `{ text, delimiter? }`, pasted text. Needs `email` and `group` columns; `name` is display only. " +
        "Statuses: `assign`, `unchanged`, `no_student`, `no_group`, `invalid`. A **blank** group cell is `no_group`, not an unassign - there is no bulk unassign. " +
        "The roster is resolved through a participant's `SeasonEnrollment` (ACTIVE; in a finished season also COMPLETED; ruling C9), not a stored pointer, which is why a previewed `assign` is always written. " +
        "The file is **refused** (`400 bad_request`) when two groups in the season share a case-insensitive name, rather than one silently winning.",
      parameters: [idParam],
      requestBody: { required: true, content: { "application/json": { schema: pastedSheetBodyDoc } } },
      responses: {
        200: ok(groupImportPreviewDoc, "Row-by-row classification."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        413: conflict("`payload_too_large`."),
        429: errRef("TooManyRequests"),
      },
    },
  },
  "/api/v1/seasons/{id}/imports/groups/commit": {
    post: {
      tags: ["Imports"],
      summary: "Commit resolved group assignments (season admin or SUPER)",
      description:
        "Body `{ assignments: [{ studentUserId, groupId }] }` (ids resolved by the preview; the write independently re-derives scope, so fabricated ids achieve nothing). One transaction through the same write as `PUT /seasons/{id}/group-assignments`. " +
        "`assigned` is the number **written** and `skippedStudentIds` names the rest (not actively enrolled in this season) - a deliberate correction of v1 reporting the requested count. " +
        "`400 group_outside_season` refuses the whole batch when any group is not in this season.",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["assignments"],
              properties: {
                assignments: {
                  type: "array",
                  minItems: 1,
                  maxItems: 2000,
                  items: {
                    type: "object",
                    required: ["studentUserId", "groupId"],
                    properties: { studentUserId: { type: "integer" }, groupId: { type: "integer" } },
                  },
                },
              },
            },
          },
        },
      },
      responses: {
        200: ok(groupImportResultDoc, "What was written."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        413: conflict("`payload_too_large`."),
        429: errRef("TooManyRequests"),
      },
    },
  },
} as const;
