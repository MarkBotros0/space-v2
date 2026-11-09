import { z } from "zod";

import { studentAssignmentListItemSchema } from "./assignment";
import { attendanceStatusSchema, quizKindSchema } from "./enums";

// Season end, pass results and the per-season record. Timestamps are ISO strings
// on the wire, like the rest of this package.

export const seasonOutcomeSchema = z.enum(["PASSED", "NOT_PASSED", "COMPLETED", "DROPPED"]);
export type SeasonOutcome = z.infer<typeof seasonOutcomeSchema>;

const OUTCOME_LABELS: Record<SeasonOutcome, string> = {
  PASSED: "Passed",
  NOT_PASSED: "Did not pass",
  COMPLETED: "Completed",
  DROPPED: "Did not finish",
};

export function seasonOutcomeLabel(outcome: SeasonOutcome): string {
  return OUTCOME_LABELS[outcome];
}

const enrollmentResultSchema = z.enum(["PASSED", "NOT_PASSED"]);

/** One reason a season can't start yet. A person can have several, or one per seat. */
const startIssueSchema = z.object({
  userId: z.number(),
  name: z.string(),
  seat: z.enum(["admin", "leader", "student"]),
  reason: z.enum([
    "already_in_role",
    "not_alumnus",
    "is_alumnus",
    "permanent_role",
    "user_inactive",
    "leader_has_group",
    "did_not_pass",
    "never_finished",
  ]),
  message: z.string(),
  /** already_in_role: the season they hold that role in. Otherwise null. */
  otherSeasonCode: z.string().nullable(),
});
export type StartIssue = z.infer<typeof startIssueSchema>;

/** `GET /seasons/:id/start-check` */
export const seasonStartCheckSchema = z.object({
  ready: z.boolean(),
  items: z.array(startIssueSchema),
  /** Other ACTIVE seasons that must end first: any, for a community-wide draft; a community-wide one, for a regular draft. */
  seasonsInTheWay: z.array(
    z.object({ id: z.number(), code: z.string(), title: z.string(), message: z.string() }),
  ),
});
export type SeasonStartCheck = z.infer<typeof seasonStartCheckSchema>;

/** What stops a season from ending, and the students it would end for. */
export const seasonEndCheckSchema = z.object({
  /** Everyone who passes becomes an alumnus when the season ends. */
  graduatesOnPass: z.boolean(),
  blockers: z.object({
    submissions: z.array(
      z.object({ publicId: z.string(), assignmentTitle: z.string(), studentName: z.string() }),
    ),
    quizAttempts: z.array(
      z.object({
        quizId: z.number(),
        attemptId: z.number(),
        quizTitle: z.string(),
        studentName: z.string(),
      }),
    ),
    attendance: z.array(
      z.object({
        sessionId: z.number(),
        title: z.string(),
        startsAt: z.string(),
        missing: z.number(),
      }),
    ),
  }),
  students: z.array(
    z.object({
      userId: z.number(),
      name: z.string(),
      groupName: z.string().nullable(),
      attendancePct: z.number(),
      /** Their class (School of N); null for a non-alumnus. */
      graduationYear: z.number().int().nullable(),
    }),
  ),
});
export type SeasonEndCheck = z.infer<typeof seasonEndCheckSchema>;

/** A staff-only reason a student did not pass. */
export const SEASON_RESULT_REASON_MAX = 1000;
const resultReasonSchema = z.string().max(SEASON_RESULT_REASON_MAX).nullable();

export const endSeasonRequestSchema = z
  .object({
    notPassed: z
      .array(z.object({ userId: z.number().int(), reason: resultReasonSchema }))
      .refine((rows) => new Set(rows.map((r) => r.userId)).size === rows.length, {
        message: "A student is listed twice.",
      }),
    /** What the staff member was shown. The server refuses to end on anything else. */
    reviewed: z.object({
      graduatesOnPass: z.boolean(),
      userIds: z.array(z.number().int()),
    }),
  })
  .strict();
export type EndSeasonRequest = z.infer<typeof endSeasonRequestSchema>;

export const endSeasonResponseSchema = z.object({
  season: z.object({ id: z.number(), code: z.string(), status: z.string() }),
  /** How many became alumni just now; anyone who already was doesn't count. */
  graduated: z.number().int().nonnegative(),
});

export const seasonResultRowSchema = z.object({
  userId: z.number(),
  name: z.string(),
  isAlumnus: z.boolean(),
  groupName: z.string().nullable(),
  attendancePct: z.number(),
  result: enrollmentResultSchema.nullable(),
  reason: z.string().nullable(),
});
export type SeasonResultRow = z.infer<typeof seasonResultRowSchema>;

export const updateSeasonResultRequestSchema = z
  .object({ result: enrollmentResultSchema, reason: resultReasonSchema })
  .strict();
export type UpdateSeasonResultRequest = z.infer<typeof updateSeasonResultRequestSchema>;

export const overdueSeasonsResponseSchema = z.object({
  seasons: z.array(
    z.object({ id: z.number(), code: z.string(), title: z.string(), endDate: z.string() }),
  ),
});
export type OverdueSeasonsResponse = z.infer<typeof overdueSeasonsResponseSchema>;

/** One past season in full: what the student did, read-only. */
export const seasonRecordSchema = z
  .object({
    season: z.object({
      id: z.number(),
      code: z.string(),
      title: z.string(),
      startDate: z.string(),
      endDate: z.string(),
    }),
    outcome: seasonOutcomeSchema,
    groupName: z.string().nullable(),
    attendancePct: z.number(),
    assignments: z.array(studentAssignmentListItemSchema),
    quizzes: z.array(
      z.object({
        id: z.number(),
        title: z.string(),
        kind: quizKindSchema,
        status: z.enum(["NOT_TAKEN", "IN_PROGRESS", "SUBMITTED", "GRADED"]),
        score: z.number().nullable(),
      }),
    ),
    attendance: z.array(
      z.object({
        sessionId: z.number(),
        title: z.string(),
        startsAt: z.string(),
        status: attendanceStatusSchema.nullable(),
      }),
    ),
  })
  .strict();
export type SeasonRecord = z.infer<typeof seasonRecordSchema>;
