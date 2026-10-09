import { Router } from "express";
import rateLimit from "express-rate-limit";

import { db } from "../db/client";
import { apiOk, apiError } from "../lib/api-response";
import { parseId } from "../lib/parse-id";
import { createNotificationsBulk } from "../lib/notifications";
import { bestEffort } from "../lib/best-effort";
import { canEditNote, canViewStudent, canWriteNote } from "../lib/permissions";
import {
  listAuthoredNotes,
  listNoteStudentOptions,
  listNotesForStudent,
  NOTE_SELECT,
  toNoteSummary,
} from "../lib/queries/notes";
import { rateLimitHandler } from "../lib/rate-limit";
import { requireAuth, requireUser } from "../middleware/require-auth";
import {
  createNoteRequestSchema,
  noteListQuerySchema,
  plainTextToHtml,
  updateNoteRequestSchema,
} from "../../../../packages/shared/src/index";

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
  // v1 parity (jpc-space src/app/mentor/notes/page.tsx:21 requireRole MENTOR;
  // 09-notes R44): only MENTOR has a "my notes" page.
  if (user.role !== "MENTOR") {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const parsed = noteListQuerySchema.safeParse(req.query);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid query.", 400);

  return apiOk(res, await listAuthoredNotes(user, parsed.data));
});

/**
 * The mentor composer's student picker (v1 src/app/mentor/notes/page.tsx:27-31;
 * 09-notes R45): every non-deleted STUDENT, alumni included, ordered by name,
 * as `{ id, name, email }` only. MENTOR only, like the page it serves — and a
 * MENTOR may already read and write about any student (canReadAllStudents,
 * canWriteNote R46), so the list discloses nothing beyond that.
 */
myNotesRouter.get("/notes/students", requireAuth, noteReadLimiter, async (req, res) => {
  const user = requireUser(req);
  if (user.role !== "MENTOR") {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }
  return apiOk(res, { students: await listNoteStudentOptions() });
});

studentNotesRouter.post("/:id/notes", requireAuth, async (req, res) => {
  const user = requireUser(req);
  const studentUserId = parseId(req.params.id);
  if (studentUserId === null) return apiError(res, "bad_request", "Invalid student id.", 400);

  const student = await db.user.findFirst({
    where: { id: studentUserId, role: "STUDENT" },
    select: { id: true },
  });
  if (!student) return apiError(res, "not_found", "Student not found.", 404);

  // Gated independently of the read path (ruling C8 #1): narrowing a list only
  // hides rows, it does not stop a caller who already knows an id.
  if (!(await canWriteNote(user, studentUserId))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const parsed = createNoteRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid note body.", 400);

  // R4: default the season from the student's active season. R5 records that v1
  // never maintains this afterwards — a note keeps pointing at the season it
  // was written in, which is the right behaviour for a dated record and is
  // kept. When the caller names a season it must be one this student is
  // actually enrolled in, or the note files itself under a season nobody can
  // reach it from.
  let seasonId: number | null = null;
  if (parsed.data.seasonId !== undefined) {
    const enrollment = await db.seasonEnrollment.findUnique({
      where: {
        studentUserId_seasonId: { studentUserId, seasonId: parsed.data.seasonId },
      },
      select: { seasonId: true },
    });
    if (!enrollment) {
      return apiError(res, "season_not_enrolled", "That student is not enrolled in that season.", 400);
    }
    seasonId = enrollment.seasonId;
  } else {
    // v1 (note-actions.ts:46-54, R4): the student's StudentProfile.activeSeasonId.
    const profile = await db.studentProfile.findUnique({
      where: { userId: studentUserId },
      select: { activeSeasonId: true },
    });
    seasonId = profile?.activeSeasonId ?? null;
  }

  const created = await db.engagementNote.create({
    data: {
      studentUserId,
      // From the session, never from input (R9).
      authorUserId: user.userId,
      seasonId,
      body: plainTextToHtml(parsed.data.body),
      visibility: parsed.data.visibility,
      followUpFlagged: parsed.data.followUpFlagged,
    },
    select: NOTE_SELECT,
  });

  // R13: flagged AND seasoned. A flagged note about a student with no season
  // notifies nobody, exactly as in v1 — there is no season whose admins to
  // notify. R14: recipients are that season's admins only.
  if (parsed.data.followUpFlagged && seasonId !== null) {
    const [admins, subject] = await Promise.all([
      db.seasonAdmin.findMany({ where: { seasonId }, select: { userId: true } }),
      db.user.findUnique({ where: { id: studentUserId }, select: { name: true } }),
    ]);
    if (admins.length > 0) {
      await bestEffort("notify:MENTOR_FOLLOWUP", () =>
        createNotificationsBulk(
          admins.map((a) => a.userId),
          {
            type: "MENTOR_FOLLOWUP",
            title: `Follow-up flagged for ${subject?.name ?? "a student"}`,
            // NO EXCERPT. v1 put body.slice(0, 140) here — raw HTML, possibly
            // cut mid-tag — and createNotificationsBulk mails it onward, so
            // confidential content about a named young person left the system
            // to every season admin's inbox, including admins who cannot open
            // the note in the app at all (spec D2, R16/R17, R36). The
            // notification says a follow-up exists and links to it.
            body: "A member of staff flagged a note for follow-up. Open the student to read it.",
            // v1's link, verbatim. Rewriting notification links to v2's route
            // tree is one change across every notification type and is a
            // cutover item, not this plan's.
            link: `/admin/students/${studentUserId}`,
          },
        ),
      );
    }
  }

  return apiOk(res, { note: toNoteSummary(created, user) }, 201);
});

notesRouter.patch("/:id", requireAuth, async (req, res) => {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid note id.", 400);

  const existing = await db.engagementNote.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return apiError(res, "not_found", "Note not found.", 404);
  // Author equality, SUPER not exempt (R23).
  if (!(await canEditNote(user, id))) {
    return apiError(res, "forbidden", "Only the note's author can edit it.", 403);
  }

  const parsed = updateNoteRequestSchema.safeParse(req.body);
  // v1's update validated nothing at all, so an edit could blank a note
  // entirely (R25). Same bound as create.
  if (!parsed.success) return apiError(res, "bad_request", "Invalid note body.", 400);

  const updated = await db.engagementNote.update({
    where: { id },
    // body only. visibility, followUpFlagged and seasonId are immutable after
    // creation (R24) — a note written to the wrong audience is corrected by
    // writing a new one, not by silently re-aiming the old one.
    data: { body: plainTextToHtml(parsed.data.body) },
    select: NOTE_SELECT,
  });

  return apiOk(res, { note: toNoteSummary(updated, user) });
});

/**
 * Delete is declared and refused, rather than absent.
 *
 * Spec D4 #2: v1's delete is a HARD delete with no tombstone, and it has no UI
 * caller anywhere — in practice v1 notes are permanent. Shipping a hard delete
 * that v1's users never had, and adding soft delete later, destroys every note
 * removed in between, irrecoverably, about named young people. Soft delete
 * needs a deletedAt column; C1 forbids the migration while v1 writes to this
 * table. So the capability waits for cutover.
 *
 * 501 rather than 404 so a client can tell "this note does not exist" from
 * "this system cannot delete notes yet" and say the right thing.
 */
notesRouter.delete("/:id", requireAuth, (_req, res) =>
  apiError(
    res,
    "delete_unavailable",
    "Notes cannot be deleted yet. Correct a note by editing it.",
    501,
  ),
);
