import { Router } from "express";

import { db } from "../db/client";
import { apiOk, apiError, forbidden } from "../lib/api-response";
import { parseId } from "../lib/parse-id";
import { canEditNote, canViewStudent, canWriteNote, staffRosterWhere } from "../lib/permissions";
import {
  listAuthoredNotes,
  listNotesForStudent,
  listVisibleNotes,
  NOTE_SELECT,
  toNoteSummary,
} from "../lib/queries/notes";
import { canReadEnrollmentHistory } from "../lib/queries/students";
import type { SessionUser } from "../lib/auth/tokens";
import { makeLimiter } from "../lib/rate-limit";
import { requireAuth, requireUser, requireRole } from "../middleware/require-auth";
import {
  createNoteRequestSchema,
  noteListQuerySchema,
  plainTextToHtml,
  updateNoteRequestSchema,
} from "../../../../packages/shared/src/index";
import { isMentor } from "../lib/rbac";

/**
 * Notes are mounted as three routers from one file rather than as routes added
 * to routes/students/ and routes/me.ts.
 *
 * The specced URLs are nested under other domains (GET /students/:id/notes,
 * GET /me/notes), but spec D5 #3 requires notes never to ride inside another
 * domain's payload or handler — the student-detail response is only as safe as
 * its most careless consumer. Three mounts of one router keeps every specced
 * URL and keeps the whole pastoral surface in one file that can be reviewed as
 * a unit. Express falls through an unmatched path to the next router on the
 * same prefix, so mounting after studentsRouter shadows nothing.
 */
/** The caller wrote this row, so the token already holds the author's derived role. */
function authoredByCaller<T extends { authorUser: { name: string } }>(row: T, user: SessionUser) {
  return { ...row, authorUser: { ...row.authorUser, role: user.role } };
}

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
const noteReadLimiter = makeLimiter({ name: "note-read", limit: 300 });

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
  if (user.role === "STUDENT") return forbidden(res);

  const student = await db.user.findFirst({
    where: { id: studentUserId, role: "STUDENT", deletedAt: null },
    select: { id: true },
  });
  if (!student) return apiError(res, "not_found", "Student not found.", 404);

  // Gate one: may this caller see the student at all. Gate two is inside the
  // query. v1 had both as page-level conventions that did not know about each
  // other (R39).
  if (!(await canViewStudent(user, studentUserId))) return forbidden(res);

  const parsed = noteListQuerySchema.safeParse(req.query);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid query.", 400);

  const page = await listNotesForStudent(user, studentUserId, parsed.data);
  if (page === null) return forbidden(res);

  auditNoteRead(user.userId, studentUserId, page.notes.length);
  return apiOk(res, page);
});

myNotesRouter.get("/notes", requireAuth, noteReadLimiter, async (req, res) => {
  // Only the four roles that can author have anything to list (R46–R49, R51).
  const user = requireRole(req, res, (u) => u.role !== "STUDENT");
  if (!user) return;

  const parsed = noteListQuerySchema.safeParse(req.query);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid query.", 400);

  return apiOk(res, await listAuthoredNotes(user, parsed.data));
});

/**
 * The newest notes a mentor may read across students (read-only). MENTOR only:
 * the spec names mentors and no other role has a caller. canViewStudent is
 * true for every student for a mentor, so the visibility clause in the query
 * is the only gate needed. Audit: ids and a count, never a body or a name.
 */
myNotesRouter.get("/visible-notes", requireAuth, noteReadLimiter, async (req, res) => {
  const user = requireRole(req, res, isMentor);
  if (!user) return;

  const parsed = noteListQuerySchema.safeParse(req.query);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid query.", 400);

  const page = await listVisibleNotes(user, parsed.data);
  if (page === null) return forbidden(res);

  console.info(
    JSON.stringify({
      event: "note_feed_read",
      viewerId: user.userId,
      noteCount: page.notes.length,
      at: new Date().toISOString(),
    }),
  );
  return apiOk(res, page);
});

studentNotesRouter.post("/:id/notes", requireAuth, async (req, res) => {
  const user = requireUser(req);
  const studentUserId = parseId(req.params.id);
  if (studentUserId === null) return apiError(res, "bad_request", "Invalid student id.", 400);

  const student = await db.user.findFirst({
    where: { id: studentUserId, role: "STUDENT", deletedAt: null },
    select: { id: true },
  });
  if (!student) return apiError(res, "not_found", "Student not found.", 404);

  // Gated independently of the read path (ruling C8 #1): narrowing a list only
  // hides rows, it does not stop a caller who already knows an id.
  if (!(await canWriteNote(user, studentUserId))) return forbidden(res);

  const parsed = createNoteRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid note body.", 400);

  // R4: default the season from the student's enrolment. R5 records that v1
  // never maintains this afterwards — a note keeps pointing at the season it
  // was written in, which is the right behaviour for a dated record and is
  // kept. When the caller names a season it must be one this student is
  // actually enrolled in, or the note files itself under a season nobody can
  // reach it from.
  //
  // An ADMIN or LEADER files notes only under seasons they may read, explicit or
  // defaulted: they couldn't read a note filed anywhere else, and a follow-up flag
  // notifies the note's season's admins, so it would alert people who never saw
  // it. canWriteNote already admits them only through such an enrolment, so there
  // is always one to default to. MENTOR and SUPER keep v1's rule (canWriteNote,
  // permissions.ts:405-427).
  const adminSeasons = user.role === "ADMIN" ? user.seasonAdminIds : null;
  const roster = staffRosterWhere(user);
  let seasonId: number | null = null;
  if (parsed.data.seasonId !== undefined) {
    if (adminSeasons && !adminSeasons.includes(parsed.data.seasonId)) return forbidden(res);
    const enrollment = await db.seasonEnrollment.findUnique({
      where: {
        studentUserId_seasonId: { studentUserId, seasonId: parsed.data.seasonId },
      },
      select: { seasonId: true, groupId: true },
    });
    if (!enrollment) {
      return apiError(res, "season_not_enrolled", "That student is not enrolled in that season.", 400);
    }
    if (!canReadEnrollmentHistory(user, enrollment)) return forbidden(res);
    seasonId = enrollment.seasonId;
  } else if (roster) {
    // Newest enrolment on this caller's roster, an ACTIVE one first.
    const enrolments = await db.seasonEnrollment.findMany({
      where: { studentUserId, ...roster },
      orderBy: { enrolledAt: "desc" },
      select: { seasonId: true, status: true },
    });
    seasonId = (enrolments.find((e) => e.status === "ACTIVE") ?? enrolments[0])?.seasonId ?? null;
  } else {
    const active = await db.seasonEnrollment.findFirst({
      where: { studentUserId, status: "ACTIVE" },
      orderBy: { enrolledAt: "desc" },
      select: { seasonId: true },
    });
    seasonId = active?.seasonId ?? null;
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

  // A flagged note notifies nobody (owner, 2026-11-07: the mentor follow-up
  // notification is gone). The flag stays on the note for staff to read.
  return apiOk(res, { note: toNoteSummary(authoredByCaller(created, user), user) }, 201);
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

  return apiOk(res, { note: toNoteSummary(authoredByCaller(updated, user), user) });
});

/**
 * Delete is declared and refused, rather than absent.
 *
 * Spec D4 #2: v1's delete is a HARD delete with no tombstone, and it has no UI
 * caller anywhere — in practice v1 notes are permanent. Shipping a hard delete
 * that v1's users never had, and adding soft delete later, destroys every note
 * removed in between, irrecoverably, about named young people. Soft delete
 * needs a deletedAt column, which Note does not have. So the capability is
 * refused until it does.
 *
 * 501 rather than 404 so a client can tell "this note does not exist" from
 * "this system cannot delete notes yet" and say the right thing.
 */
notesRouter.delete("/:id", requireAuth, (_req, res) =>
  apiError(res, "delete_unavailable", "Notes cannot be deleted yet. Correct a note by editing it.", 501),
);
