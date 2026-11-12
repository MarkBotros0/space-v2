import { conflict, errRef, ok } from "../helpers";
import { idParam } from "../shared/params";

const studentUserIdParam = { name: "studentUserId", in: "path", required: true, schema: { type: "integer" } } as const;

/**
 * `/api/v1/assignments/{id}/submitted-marks/{studentUserId}`: staff mark an assignment submitted,
 * with the schemas only these paths and the progress row use. Assembled by `../openapi.ts`.
 */
export const assignmentStaffMarkSchemas = {
  StaffMarkSummary: {
    type: ["object", "null"],
    required: ["markedAt", "markedByName"],
    description: 'Staff marked it submitted ("Marked submitted by {name}"); null when not marked.',
    properties: {
      markedAt: { type: "string", format: "date-time" },
      markedByName: { type: ["string", "null"], description: "Null when the account that marked it is gone." },
    },
  },
  AssignmentStaffMark: {
    type: "object",
    required: ["studentUserId", "markedAt", "markedBy"],
    properties: {
      studentUserId: { type: "integer" },
      markedAt: { type: "string", format: "date-time" },
      markedBy: {
        type: ["object", "null"],
        description: "Null when the account that marked it is gone.",
        required: ["id", "name"],
        properties: { id: { type: "integer" }, name: { type: ["string", "null"] } },
      },
    },
  },
} as const;

const REFUSALS =
  '404 for a deleted assignment or season, and for a student who is not an ACTIVE live participant of the season ("Student not found in this season."). 409 `season_draft` before Start and 409 `season_finished` ("This season has ended; its work can\'t change.") after End, read under the Season lock (FOR SHARE, then the student, then the rows), so a mark lands wholly before End\'s check or not at all.';

export const assignmentStaffMarkPaths = {
  "/api/v1/assignments/{id}/submitted-marks/{studentUserId}": {
    put: {
      tags: ["Assignments"],
      summary: "Mark an assignment submitted for a student",
      description: `The season's admin, a SUPER, or the student's own leader in that season (403 otherwise: a leader of another group, a mentor, a student). For a student who did the work outside the app. It counts as submitted in every count (progress, the season list, engagement, reports, the workbook, reminders skip them, My work reads REVIEWED with \`staffMarked\`). The Submission is made if there is none. No essay is handed in, nothing enters the review queue, nobody is notified. Marking again keeps the first mark (who and when). A later Submit in the app stands beside the mark. Returning one of the student's essays takes the mark away (staff asked for the work again). ${REFUSALS}`,
      parameters: [idParam, studentUserIdParam],
      responses: {
        200: ok({ $ref: "#/components/schemas/AssignmentStaffMark" }, "The mark as stored."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict("`season_draft` or `season_finished`."),
      },
    },
    delete: {
      tags: ["Assignments"],
      summary: "Undo a staff mark",
      description: `Anyone who may mark may undo, whoever marked. Deletes the mark, and the Submission too when it holds nothing else (no Submit in the app, no work on any part). 204 also when there was no mark. Nobody is notified. ${REFUSALS}`,
      parameters: [idParam, studentUserIdParam],
      responses: {
        204: { description: "Undone." },
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict("`season_draft` or `season_finished`."),
      },
    },
  },
} as const;
