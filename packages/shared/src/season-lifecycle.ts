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

export const enrollmentResultSchema = z.enum(["PASSED", "NOT_PASSED"]);

/** What stops a season from ending, and the students it would end for. */
export const seasonEndCheckSchema = z.object({
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
    }),
  ),
});
export type SeasonEndCheck = z.infer<typeof seasonEndCheckSchema>;

export const endSeasonRequestSchema = z
  .object({
    notPassed: z.array(z.object({ userId: z.number().int(), reason: z.string().nullable() })),
  })
  .strict();
export type EndSeasonRequest = z.infer<typeof endSeasonRequestSchema>;

export const seasonResultRowSchema = z.object({
  userId: z.number(),
  name: z.string(),
  groupName: z.string().nullable(),
  attendancePct: z.number(),
  result: enrollmentResultSchema.nullable(),
  reason: z.string().nullable(),
});
export type SeasonResultRow = z.infer<typeof seasonResultRowSchema>;

export const updateSeasonResultRequestSchema = z
  .object({ result: enrollmentResultSchema, reason: z.string().nullable() })
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
