import { z } from "zod";

import { studentAssignmentListItemSchema } from "./assignment";
import { attendanceStatusSchema, quizKindSchema, seasonStatusSchema } from "./enums";
import {
  passCriteriaSchema,
  passingNumbersSchema,
  passWeightsSchema,
  seasonAvailabilitySchema,
} from "./season-passing";

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
export type EnrollmentResult = z.infer<typeof enrollmentResultSchema>;

/** POST /seasons/:id/start: the season, now ACTIVE. */
export const startSeasonResponseSchema = z.object({
  season: z.object({ id: z.number(), code: z.string(), status: seasonStatusSchema }),
});
export type StartSeasonResponse = z.infer<typeof startSeasonResponseSchema>;

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
  seasonsInTheWay: z.array(z.object({ id: z.number(), code: z.string(), title: z.string(), message: z.string() })),
});
export type SeasonStartCheck = z.infer<typeof seasonStartCheckSchema>;

/** What stops a season from ending, and the students it would end for. */
export const seasonEndCheckSchema = z.object({
  /** Everyone who passes becomes an alumnus when the season ends. */
  graduatesOnPass: z.boolean(),
  /** The season's pass criteria, or the default (`isDefault`) when it has none of its own. */
  criteria: passCriteriaSchema,
  isDefault: z.boolean(),
  /** What the season has to count; a weight above 0 on a number it has nothing for is refused. */
  available: seasonAvailabilitySchema,
  blockers: z.object({
    submissions: z.array(z.object({ publicId: z.string(), assignmentTitle: z.string(), studentName: z.string() })),
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
      /** `numbers.attendance` as a whole percent; 0 with nothing to count. */
      attendancePct: z.number(),
      /** Their class (`classLabel`, e.g. JPCS-25); null for a non-alumnus. */
      graduationYear: z.number().int().nullable(),
      /** The three numbers the score comes from (`weightedScore(passingPcts(numbers), weights)`). */
      numbers: passingNumbersSchema,
    }),
  ),
});
export type SeasonEndCheck = z.infer<typeof seasonEndCheckSchema>;

/** A staff-only reason a student did not pass. */
export const SEASON_RESULT_REASON_MAX = 1000;
const resultReasonSchema = z.string().max(SEASON_RESULT_REASON_MAX).nullable();

const eachStudentOnce = <T extends { userId: number }>(rows: T[]) =>
  new Set(rows.map((r) => r.userId)).size === rows.length;

export const endSeasonRequestSchema = z
  .object({
    notPassed: z
      .array(z.object({ userId: z.number().int(), reason: resultReasonSchema }))
      .refine(eachStudentOnce, { message: "A student is listed twice." }),
    /** An optional note on a student who passes (e.g. why they pass below the mark), kept as the result's reason. */
    passedNotes: z
      .array(z.object({ userId: z.number().int(), note: resultReasonSchema }))
      .refine(eachStudentOnce, { message: "A student is listed twice." })
      .default([]),
    /** The criteria End uses and stores on the season. */
    weights: passWeightsSchema,
    passMark: z.number().int().min(0).max(100),
    /** What the staff member was shown. The server refuses to end on anything else. */
    reviewed: z.object({
      graduatesOnPass: z.boolean(),
      userIds: z.array(z.number().int()),
      /** Each student's score as shown, under these weights; End recomputes them and refuses a difference. */
      scores: z.array(z.object({ userId: z.number().int(), score: z.number().nullable() })),
    }),
  })
  .strict()
  .refine((b) => b.weights.attendance + b.weights.assignments + b.weights.quizzes === 100, {
    message: "The weights must add up to 100%.",
    path: ["weights"],
  });
export type EndSeasonRequest = z.infer<typeof endSeasonRequestSchema>;

export const endSeasonResponseSchema = z.object({
  season: z.object({ id: z.number(), code: z.string(), status: z.string() }),
  /** How many became alumni just now; anyone who already was doesn't count. */
  graduated: z.number().int().nonnegative(),
});

const seasonResultRowSchema = z.object({
  userId: z.number(),
  name: z.string(),
  isAlumnus: z.boolean(),
  groupName: z.string().nullable(),
  attendancePct: z.number(),
  result: enrollmentResultSchema.nullable(),
  reason: z.string().nullable(),
  // An app build talking to a backend from before season passing reads "none" for the five below.
  /** The score End stored; null with nothing to count, or for a season ended before weighted passing. */
  passScore: z.number().nullable().default(null),
  /** The numbers End stored; null for a season ended before weighted passing. */
  numbers: passingNumbersSchema.nullable().default(null),
  /** The result goes against the stored score (passed below the mark, or did not pass at or above it). */
  againstScore: z.boolean().default(false),
  /** Who set the result (End or a later correction), and when; null when not recorded. */
  setByName: z.string().nullable().default(null),
  setAt: z.string().nullable().default(null),
});
export type SeasonResultRow = z.infer<typeof seasonResultRowSchema>;

/** `GET /seasons/:id/results`: the season, the criteria End used (null before weighted passing), and each result. */
export const seasonResultsResponseSchema = z.object({
  season: z.object({
    id: z.number(),
    code: z.string(),
    title: z.string(),
    year: z.number().int(),
    graduatesOnPass: z.boolean(),
  }),
  criteria: passCriteriaSchema.nullable(),
  results: z.array(seasonResultRowSchema),
});
export type SeasonResultsResponse = z.infer<typeof seasonResultsResponseSchema>;

export const updateSeasonResultRequestSchema = z
  .object({ result: enrollmentResultSchema, reason: resultReasonSchema })
  .strict();
export type UpdateSeasonResultRequest = z.infer<typeof updateSeasonResultRequestSchema>;

export const overdueSeasonsResponseSchema = z.object({
  seasons: z.array(z.object({ id: z.number(), code: z.string(), title: z.string(), endDate: z.string() })),
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
        /**
         * ONLINE only: the season admin's score and note (plan 4), which `score` then carries;
         * labelled "Score entered by your admin". Null for PAPER and when none.
         */
        // An app build talking to a backend from before this field reads "none".
        adminScore: z.object({ score: z.number(), notes: z.string().nullable() }).nullable().default(null),
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

/** An alumnus's class as the community writes it: 2025 is "JPCS-25" (owner, 2026-11-10). */
export function classLabel(graduationYear: number): string {
  return `JPCS-${String(graduationYear % 100).padStart(2, "0")}`;
}
