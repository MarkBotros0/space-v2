import { Router } from "express";
import rateLimit from "express-rate-limit";

import { db } from "../db/client";
import { apiOk, apiError } from "../lib/api-response";
import { parseId } from "../lib/parse-id";
import { canViewStudent } from "../lib/permissions";
import { listAuthoredNotes, listNotesForStudent } from "../lib/queries/notes";
import { rateLimitHandler } from "../lib/rate-limit";
import { requireAuth, requireUser } from "../middleware/require-auth";
import { noteListQuerySchema } from "../../../../packages/shared/src/index";

/**
 * Notes are mounted as three routers from one file rather than as routes added
 * to routes/students.ts and routes/me.ts.
 *
 * The specced URLs are nested under other domains (GET /students/:id/notes,
 * GET /me/notes), but spec D5 #3 requires notes never to ride inside another
 * domain's payload or handler — the student-detail response is only as safe as
 * its most careless consumer. Three mounts of one router keeps every specced
 * URL and keeps the whole pastoral surface in one file that can be reviewed as
 * a unit. Express falls through an unmatched path to the next router on the
 * same prefix, so mounting after studentsRouter shadows nothing.
 */
export const notesRouter = Router();
export const studentNotesRouter = Router();
export const myNotesRouter = Router();

/**
 * Spec D15: once notes are an API, a compromised staff token can enumerate
 * /students/:id/notes across every student id and exfiltrate the entire
 * pastoral record set at machine speed, and nothing in v1 or in this backend
 * would record it. Generous enough for a person paging through a caseload,
 * far below a scripted sweep.
 */
const noteReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  handler: rateLimitHandler,
});

// requireAuth is attached to each route below, never with router.use()
// (ruling X5). studentNotesRouter and myNotesRouter share /api/v1/students
// and /api/v1/me with other routers; a router-wide use() would run auth on
// their requests too and turn an unknown path under those prefixes into a 401
// instead of the not_found 404 CLAUDE.md promises.

/**
 * Spec D15 again: "who looked at what" is a question someone may one day have
 * to answer about records concerning named young people. Ids and a count only
 * — never a body, never a name.
 */
function auditNoteRead(viewerId: number, studentUserId: number, noteCount: number): void {
  console.info(
    JSON.stringify({
      event: "note_read",
      viewerId,
      studentUserId,
      noteCount,
      at: new Date().toISOString(),
    }),
  );
}

studentNotesRouter.get("/:id/notes", requireAuth, noteReadLimiter, async (req, res) => {
  const user = requireUser(req);
  const studentUserId = parseId(req.params.id);
  if (studentUserId === null) return apiError(res, "bad_request", "Invalid student id.", 400);

  // Explicit, and first. v1 excluded students by the absence of a screen
  // (R40) — in v2 the student opens the same app over the same API, so the
  // refusal has to be a rule. 403 rather than an empty array, which would be
  // indistinguishable from "this student has no notes" (D5 #2, D6).
  if (user.role === "STUDENT") {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const student = await db.user.findFirst({
    where: { id: studentUserId, role: "STUDENT" },
    select: { id: true },
  });
  if (!student) return apiError(res, "not_found", "Student not found.", 404);

  // Gate one: may this caller see the student at all. Gate two is inside the
  // query. v1 had both as page-level conventions that did not know about each
  // other (R39).
  if (!(await canViewStudent(user, studentUserId))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const parsed = noteListQuerySchema.safeParse(req.query);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid query.", 400);

  const page = await listNotesForStudent(user, studentUserId, parsed.data);
  if (page === null) return apiError(res, "forbidden", "You don't have access to this.", 403);

  auditNoteRead(user.userId, studentUserId, page.notes.length);
  return apiOk(res, page);
});

myNotesRouter.get("/notes", requireAuth, noteReadLimiter, async (req, res) => {
  const user = requireUser(req);
  // Only the four roles that can author have anything to list (R46–R49, R51).
  if (user.role === "STUDENT") {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const parsed = noteListQuerySchema.safeParse(req.query);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid query.", 400);

  return apiOk(res, await listAuthoredNotes(user, parsed.data));
});
