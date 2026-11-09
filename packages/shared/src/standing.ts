import { z } from "zod";

// Standing: whether someone may join a season, from the results of the seasons
// they finished. Pure, so the picker and every write share one rule.

export type StandingHistoryRow = {
  program: string;
  seasonTitle: string;
  /** When the enrolment finished; null while it hasn't. */
  finishedAt: Date | null;
  enrollmentStatus: "ACTIVE" | "COMPLETED" | "WITHDRAWN";
  result: "PASSED" | "NOT_PASSED" | null;
};

export const standingSchema = z.object({
  kind: z.enum(["ok", "blocked", "already_passed"]),
  reason: z.enum(["did_not_pass", "never_finished"]).nullable(),
  /** did_not_pass: the failed season; already_passed: the season passed. Otherwise null. */
  programSeasonTitle: z.string().nullable(),
});
export type Standing = z.infer<typeof standingSchema>;

/** Finished is a completed enrolment with a finish date. A drop never counts. */
function latestFinished(history: StandingHistoryRow[], program: string): StandingHistoryRow | null {
  let latest: StandingHistoryRow | null = null;
  for (const row of history) {
    if (row.program !== program || row.enrollmentStatus !== "COMPLETED" || !row.finishedAt) continue;
    if (!latest || row.finishedAt.getTime() > latest.finishedAt!.getTime()) latest = row;
  }
  return latest;
}

/**
 * `history` is the person's enrolments in finished seasons (the caller keeps
 * only COMPLETED or ARCHIVED seasons). A finished row with no result is ok:
 * nothing was recorded, so nothing blocks.
 */
export function standingFor(
  season: { requiredProgram: string | null; targetProgram: string },
  history: StandingHistoryRow[],
): Standing {
  if (season.requiredProgram !== null) {
    const required = latestFinished(history, season.requiredProgram);
    if (!required) return { kind: "blocked", reason: "never_finished", programSeasonTitle: null };
    if (required.result === "NOT_PASSED") {
      return { kind: "blocked", reason: "did_not_pass", programSeasonTitle: required.seasonTitle };
    }
  }
  const target = latestFinished(history, season.targetProgram);
  if (target?.result === "PASSED") {
    return { kind: "already_passed", reason: null, programSeasonTitle: target.seasonTitle };
  }
  return { kind: "ok", reason: null, programSeasonTitle: null };
}

const peopleCandidateSchema = z.object({
  id: z.number(),
  name: z.string(),
  /** `alumni` when `graduationYear` is set. */
  pool: z.enum(["student", "alumni"]),
  last: z
    .object({
      seasonTitle: z.string(),
      outcome: z.enum(["PASSED", "NOT_PASSED", "DROPPED", "COMPLETED"]),
      attendancePct: z.number().int().min(0).max(100).nullable(),
    })
    .nullable(),
  availability: z.enum(["available", "already_passed", "did_not_pass", "never_finished", "in_role", "in_season"]),
  reason: z.string().nullable(),
  selectable: z.boolean(),
  overridable: z.boolean(),
  /**
   * How each of their places in a finished season ended, for "add the people
   * who passed <season>": `passed`, `not_passed` (completed without a pass) or
   * `dropped`. One entry per finished season they were in.
   */
  places: z.array(z.object({ seasonId: z.number(), outcome: z.enum(["passed", "not_passed", "dropped"]) })),
});
export type PeopleCandidate = z.infer<typeof peopleCandidateSchema>;

/** `GET /seasons/:id/people-candidates` */
export const peopleCandidatesResponseSchema = z.object({
  season: z.object({
    id: z.number(),
    title: z.string(),
    requiredProgram: z.string().nullable(),
    isCommunityWide: z.boolean(),
    /**
     * The season this one normally follows, preselected in the picker: the last
     * finished season of `requiredProgram`, else of its own `program`. Null for a
     * community-wide season or when none has finished.
     */
    suggestedSourceId: z.number().nullable(),
    /**
     * Finished seasons whose passers can be brought in, newest end first:
     * `passed` that this list holds, `graduated` passers who are alumni now and
     * so not listed by a regular season. Seasons with neither are left out.
     */
    sources: z.array(
      z.object({
        id: z.number(),
        code: z.string(),
        title: z.string(),
        passed: z.number().int().min(0),
        graduated: z.number().int().min(0),
      }),
    ),
  }),
  people: z.array(peopleCandidateSchema),
});
export type PeopleCandidatesResponse = z.infer<typeof peopleCandidatesResponseSchema>;

const seatUserIds = z.array(z.number().int().positive());

/**
 * `POST /seasons/:id/enrollments`: all or nothing. `overrideUserIds` is who the
 * season's admin or a SUPER lets in past a block, so each must be among those being added.
 */
export const addSeasonEnrollmentsRequestSchema = z
  .object({
    userIds: seatUserIds.min(1).max(500),
    overrideUserIds: seatUserIds.max(500).optional(),
  })
  .refine((b) => new Set(b.userIds).size === b.userIds.length, { path: ["userIds"], message: "Repeated person." })
  .refine((b) => (b.overrideUserIds ?? []).every((id) => b.userIds.includes(id)), {
    path: ["overrideUserIds"],
    message: "An override must name someone being added.",
  });
export type AddSeasonEnrollmentsBody = z.infer<typeof addSeasonEnrollmentsRequestSchema>;

/** `POST /seasons/:id/enrollments` response. */
export const addSeasonEnrollmentsResponseSchema = z.object({ added: z.number().int().min(0) });
