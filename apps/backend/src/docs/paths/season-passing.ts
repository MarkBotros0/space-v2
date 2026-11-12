import { conflict, errRef, ok } from "../helpers";
import { idParam } from "../shared/params";

/**
 * Season passing by weighted score: the season's pass criteria, the passing outlook and a student's
 * progress, with the schemas only these paths use. Assembled by `../openapi.ts`.
 */

const count = { type: "integer", minimum: 0 } as const;
const numberKey = { type: "string", enum: ["attendance", "assignments", "quizzes"] } as const;
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
export const seasonPassingSchemas = {
  PassCriteria: {
    type: "object",
    required: ["weights", "passMark"],
    additionalProperties: false,
    properties: {
      weights: {
        type: "object",
        required: ["attendance", "assignments", "quizzes"],
        additionalProperties: false,
        description: 'Whole percentages, 0 to 100, adding up to exactly 100 ("The weights must add up to 100%.").',
        properties: {
          attendance: { type: "integer", minimum: 0, maximum: 100 },
          assignments: { type: "integer", minimum: 0, maximum: 100 },
          quizzes: { type: "integer", minimum: 0, maximum: 100 },
        },
      },
      passMark: {
        type: "integer",
        minimum: 0,
        maximum: 100,
        description: "The score that passes, compared with the score rounded to one decimal.",
      },
    },
  },
  PassingNumbers: {
    type: "object",
    required: ["attendance", "assignments", "quizzes"],
    description:
      "One student's three raw numbers in a season. A zero denominator means nothing to count. Attendance: PRESENT or LATE over the sessions that have started since the student's enrolment. Assignments: submitted in the app or marked by staff, over the season's live assignments. Quizzes: the counting scores over the max of every PAPER and published ONLINE quiz; nothing taken or graded is 0.",
    properties: {
      attendance: { type: "object", required: ["attended", "total"], properties: { attended: count, total: count } },
      assignments: {
        type: "object",
        required: ["submitted", "total"],
        properties: { submitted: count, total: count },
      },
      quizzes: {
        type: "object",
        required: ["scored", "max"],
        properties: { scored: { type: "number", minimum: 0 }, max: count },
      },
    },
  },
  SeasonAvailability: {
    type: "object",
    required: ["attendance", "assignments", "quizzes"],
    description: "Whether the season has anything for each number: any session, any live assignment, any counted quiz.",
    properties: {
      attendance: { type: "boolean" },
      assignments: { type: "boolean" },
      quizzes: { type: "boolean" },
    },
  },
  PassingOutlook: {
    type: "object",
    required: ["criteria", "isDefault", "available", "weightsIgnored", "canEditCriteria", "onTrack", "below", "rows"],
    properties: {
      criteria: ref("PassCriteria"),
      isDefault: {
        type: "boolean",
        description: "The season saved no criteria: these are the newest saved on any season, else 40/30/30 and 60.",
      },
      available: ref("SeasonAvailability"),
      weightsIgnored: {
        type: "array",
        items: numberKey,
        description:
          "Numbers the criteria weight but the season has nothing for (a default can carry weight from another season). They count as weight 0 for every score here.",
      },
      canEditCriteria: { type: "boolean", description: "The season's admin or a SUPER, on an ACTIVE season." },
      onTrack: { type: "integer", description: "Rows whose score reaches the pass mark." },
      below: { type: "integer", description: "Rows whose score is under the pass mark." },
      rows: {
        type: "array",
        description: "Below the mark (most points short first), then no score, then on track; by name within each.",
        items: {
          type: "object",
          required: ["userId", "name", "groupName", "numbers", "score", "rescaled", "pointsShort", "weakest"],
          properties: {
            userId: { type: "integer" },
            name: { type: "string" },
            groupName: { type: ["string", "null"] },
            numbers: ref("PassingNumbers"),
            score: {
              type: ["number", "null"],
              description: "The weighted score, one decimal; null when no weighted number has anything to count.",
            },
            rescaled: {
              type: "boolean",
              description: "A weighted number had nothing to count for this student; the others were re-scaled.",
            },
            pointsShort: { type: ["number", "null"], description: "Below the mark only: how far, one decimal." },
            weakest: { oneOf: [numberKey, { type: "null" }], description: "The lowest weighted number." },
          },
        },
      },
    },
  },
  StudentProgress: {
    type: "object",
    required: ["seasonId", "seasonTitle", "seasonActive", "canMark", "available", "numbers", "assignments", "quizzes"],
    properties: {
      seasonId: { type: "integer" },
      seasonTitle: { type: "string" },
      seasonActive: { type: "boolean" },
      canMark: {
        type: "boolean",
        description:
          "The caller may mark this student's assignments as submitted, and undo: the season's admin, a SUPER or the student's own leader, on an ACTIVE season.",
      },
      available: ref("SeasonAvailability"),
      numbers: ref("PassingNumbers"),
      assignments: {
        type: "array",
        description: "The season's live assignments, not submitted first, by due date within each.",
        items: {
          type: "object",
          required: ["id", "title", "dueAt", "submitted", "staffMark"],
          properties: {
            id: { type: "integer" },
            title: { type: "string" },
            dueAt: { type: ["string", "null"], format: "date-time" },
            submitted: { type: ["string", "null"], enum: ["app", "staff", null] },
            staffMark: {
              oneOf: [
                {
                  type: "object",
                  required: ["markedAt", "markedByName"],
                  properties: {
                    markedAt: { type: "string", format: "date-time" },
                    markedByName: { type: ["string", "null"] },
                  },
                },
                { type: "null" },
              ],
            },
          },
        },
      },
      quizzes: {
        type: "array",
        description:
          "Every PAPER and published ONLINE quiz of the season with the student's counting score (null: none yet), lowest share of the max first.",
        items: {
          type: "object",
          required: ["id", "title", "kind", "score", "maxScore"],
          properties: {
            id: { type: "integer" },
            title: { type: "string" },
            kind: { type: "string", enum: ["PAPER", "ONLINE"] },
            score: { type: ["number", "null"] },
            maxScore: { type: "number" },
          },
        },
      },
    },
  },
} as const;

export const seasonPassingPaths = {
  "/api/v1/seasons/{id}/passing": {
    get: {
      tags: ["Seasons"],
      summary: "The season's passing outlook",
      description:
        "Every student on the caller's roster (live participants) with their three numbers and weighted score against the pass mark. The season's admin or a SUPER see the season; a leader sees their own groups' students and can't edit the criteria. A mentor, a student or another season's admin gets 403. The score is a helper: it pre-selects at End and shows who is below the mark and which number pulls them down.",
      parameters: [idParam],
      responses: {
        200: ok(ref("PassingOutlook"), "The outlook."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
  },
  "/api/v1/students/{id}/progress": {
    get: {
      tags: ["Students"],
      summary: "A student's season progress (staff)",
      description:
        "The three passing numbers with the assignments and quizzes behind them. The season is the one `seasonId` names, else the student's newest ACTIVE enrolment the caller may score (as `GET /students/{id}/engagement`): a SUPER any, the season's admin theirs, a leader their own groups' students. A student gets 403, their own record included, and so does a MENTOR (a mentor sees nothing season-shaped). A WITHDRAWN enrolment, named or not, is 404 `no_season`. Ids, titles and scores only: no answers and no question text.",
      parameters: [
        idParam,
        { name: "seasonId", in: "query", required: false, schema: { type: "integer", minimum: 1 } },
      ],
      responses: {
        200: ok(ref("StudentProgress"), "The student's progress."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: conflict("`no_season` (no season to score) or `not_found` (no such student)."),
      },
    },
  },
  "/api/v1/seasons/{id}/pass-criteria": {
    put: {
      tags: ["Seasons"],
      summary: "Set the season's pass criteria",
      description:
        "The season's admin or a SUPER (403 otherwise; a leader reads the criteria but can't set them). The weights and pass mark that pre-select who passes at End and show who is below the mark during the season; the score itself is never edited. Saved criteria become every other season's default until another season saves its own. 400 `weight_on_empty` (\"{Number} has nothing to count this season, so its weight must be 0.\") for a weight above 0 on a number the season has nothing for: no session, no live assignment, or no PAPER or published ONLINE quiz.",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/PassCriteria" } } },
      },
      responses: {
        200: ok(
          {
            type: "object",
            required: ["criteria"],
            properties: { criteria: { $ref: "#/components/schemas/PassCriteria" } },
          },
          "The criteria as saved.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict("`season_not_active`: only an ACTIVE season's criteria can be set."),
      },
    },
  },
} as const;
