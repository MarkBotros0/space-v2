// Reports (Plan 15). Hand-authored like every response in this document.
const intField = { type: "integer" } as const;
const reportScopeDoc = {
  type: "object",
  required: ["seasonIds", "seasons", "truncated", "label"],
  properties: {
    seasonIds: { type: "array", items: intField },
    seasons: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "code", "title", "status", "endDate"],
        properties: {
          id: intField,
          code: { type: "string" },
          title: { type: "string" },
          status: { type: "string", enum: ["DRAFT", "ACTIVE", "COMPLETED", "ARCHIVED"] },
          endDate: { type: "string", format: "date-time", description: "The season's last day, UTC midnight." },
        },
      },
    },
    truncated: { type: "boolean" },
    label: { type: "string" },
  },
} as const;
const engagementReportRowDoc = {
  type: "object",
  required: [
    "score",
    "attendancePct",
    "submissionPct",
    "attendanceTotal",
    "attendancePresent",
    "submissionsExpected",
    "submissionsCompleted",
    "studentUserId",
    "name",
    "email",
    "seasonId",
    "seasonTitle",
    "band",
  ],
  properties: {
    score: intField,
    attendancePct: intField,
    submissionPct: intField,
    attendanceTotal: intField,
    attendancePresent: intField,
    submissionsExpected: intField,
    submissionsCompleted: intField,
    studentUserId: intField,
    name: { type: "string" },
    email: { type: "string" },
    seasonId: intField,
    seasonTitle: { type: "string" },
    band: { type: "string", enum: ["HIGH", "MEDIUM", "LOW", "AT_RISK"] },
  },
} as const;
export const engagementSummarySchemaDoc = {
  type: "object",
  required: [
    "scope",
    "attendanceTrend",
    "completion",
    "bands",
    "atRisk",
    "atRiskTotal",
    "cohortSize",
    "enrollmentCount",
    "generatedAt",
    "exportDay",
  ],
  properties: {
    scope: reportScopeDoc,
    attendanceTrend: {
      type: "array",
      items: {
        type: "object",
        required: [
          "sessionId",
          "seasonId",
          "seasonTitle",
          "title",
          "startsAt",
          "dayKey",
          "presentCount",
          "expectedCount",
          "pct",
        ],
        properties: {
          sessionId: intField,
          seasonId: intField,
          seasonTitle: { type: "string" },
          title: { type: "string" },
          startsAt: { type: "string", format: "date-time" },
          dayKey: { type: "string", example: "2026-08-24" },
          presentCount: intField,
          expectedCount: intField,
          pct: { type: ["integer", "null"], minimum: 0, maximum: 100 },
        },
      },
    },
    completion: {
      type: "array",
      items: {
        type: "object",
        required: ["assignmentId", "seasonId", "title", "completed", "expected", "completionRate"],
        properties: {
          assignmentId: intField,
          seasonId: intField,
          title: { type: "string" },
          completed: intField,
          expected: intField,
          completionRate: { type: ["integer", "null"], minimum: 0, maximum: 100 },
        },
      },
    },
    bands: {
      type: "array",
      items: {
        type: "object",
        required: ["band", "count"],
        properties: { band: { type: "string", enum: ["HIGH", "MEDIUM", "LOW", "AT_RISK"] }, count: intField },
      },
    },
    atRisk: { type: "array", maxItems: 10, items: engagementReportRowDoc },
    atRiskTotal: intField,
    cohortSize: intField,
    enrollmentCount: intField,
    generatedAt: { type: "string", format: "date-time" },
    exportDay: { type: "string", example: "2026-08-24" },
  },
} as const;
export const engagementStudentPageSchemaDoc = {
  type: "object",
  required: ["scope", "rows", "nextCursor", "total"],
  properties: {
    scope: reportScopeDoc,
    rows: { type: "array", items: engagementReportRowDoc },
    nextCursor: { type: ["string", "null"] },
    total: intField,
  },
} as const;
export const organisationReportSchemaDoc = {
  type: "object",
  required: ["totalStudentsNotGraduated", "totalAlumni", "activeSeasonCount", "seasons", "alumniByYear", "generatedAt"],
  properties: {
    totalStudentsNotGraduated: intField,
    totalAlumni: intField,
    activeSeasonCount: intField,
    seasons: {
      type: "array",
      items: {
        type: "object",
        required: [
          "seasonId",
          "code",
          "program",
          "year",
          "title",
          "status",
          "activeCount",
          "completedCount",
          "withdrawnCount",
          "leaderCount",
        ],
        properties: {
          seasonId: intField,
          code: { type: "string" },
          program: { type: "string" },
          year: intField,
          title: { type: "string" },
          status: { type: "string" },
          activeCount: intField,
          completedCount: intField,
          withdrawnCount: intField,
          leaderCount: intField,
        },
      },
    },
    alumniByYear: {
      type: "array",
      items: { type: "object", required: ["year", "count"], properties: { year: intField, count: intField } },
    },
    generatedAt: { type: "string", format: "date-time" },
  },
} as const;

export const xlsxResponse = {
  description: "XLSX workbook (bytes). Every non-200 on this path is the JSON error envelope.",
  headers: {
    "Content-Disposition": {
      schema: { type: "string" },
      description:
        "attachment; filename=\"<ascii fallback>\"; filename*=UTF-8''<percent-encoded>. " +
        "The filename is built by exportFilename() in packages/shared and carries the " +
        "organisation-timezone day.",
    },
  },
  content: {
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
      schema: { type: "string", format: "binary" },
    },
  },
} as const;

export const EXPORT_COMMON =
  "Success is bytes plus Content-Disposition; every error is the JSON envelope, so a " +
  "client can tell a 403 from a file. ENABLE_UPLOADS does NOT gate this endpoint — it " +
  "reads database rows and touches no Storage driver. Rate-limited to 10 per 15 " +
  "minutes per user; the 429 is `too_many_requests` in the envelope.";

export const exportManifestSchemaDoc = {
  type: "object",
  required: ["filename", "mimeType", "sheets", "estimatedBytes", "generatedAt", "scopeDescription"],
  properties: {
    filename: { type: "string" },
    mimeType: { type: "string" },
    sheets: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "columnCount", "rowCount"],
        properties: { name: { type: "string" }, columnCount: { type: "integer" }, rowCount: { type: "integer" } },
      },
    },
    estimatedBytes: { type: "integer", description: "A heuristic, not a promise." },
    generatedAt: { type: "string", format: "date-time" },
    scopeDescription: { type: "string" },
  },
} as const;
