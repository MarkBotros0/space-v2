import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import type { SessionUser } from "../auth/tokens";
import { isMentor, isSuper } from "../rbac";
import { canViewStudent, staffRosterIncludes } from "./student";

/**
 * NoteVisibility literal → the single role that matches it.
 *
 * EQUALITY, not a hierarchy (spec R34, R37). An ADMIN does not read a LEADERS
 * note; a MENTOR does not read a LEADERS note either, despite reading every
 * student in the system. Only SUPER (R32) and the author (R33) cross the
 * boundary.
 *
 * This is v1's implemented behaviour, kept deliberately. v1's composer copy
 * promised something else ("in addition to you and admins"), and spec D3 rules
 * that reconciling them by widening access — retroactively letting admins read
 * notes written under a different promise — is a pastoral-policy decision, not
 * an engineer's. The COPY is what this migration fixes; see Task 6.
 */
const NOTE_VISIBILITY_FOR_ROLE: Partial<Record<SessionUser["role"], "LEADERS" | "MENTORS" | "ADMINS">> = {
  LEADER: "LEADERS",
  MENTOR: "MENTORS",
  ADMIN: "ADMINS",
};

/**
 * The note visibility rule, as a Prisma `where` fragment.
 *
 * This is THE most important function in this domain, and its shape is the
 * point. v1 had no read gate below the page: `loadStudentDetail` selected every
 * note for a student with no viewer argument and no visibility clause, and four
 * separate pages each had to remember to call `filterVisibleNotes` afterwards
 * and to pass the filtered array rather than the raw one (spec R38, D5). The
 * failure mode is silent — the wrong array renders perfectly, just with other
 * people's confidential notes in it — and the identical shape already shipped
 * as a live defect in this backend once (domain 4's D6).
 *
 * So: the viewer is a required argument, the rule is a `where`, and there is no
 * exported function in v2 that reads EngagementNote without one. Ruling C8.
 *
 * Returns **null** for a caller who may never read any note (STUDENT). Callers
 * must refuse on null — never substitute an empty filter, and never return an
 * empty array, which is indistinguishable from "no notes exist" (D5 #2).
 */
export function noteVisibilityWhere(user: SessionUser): Prisma.EngagementNoteWhereInput | null {
  if (user.role === "STUDENT") return null;
  if (isSuper(user)) return {};

  const visibility = NOTE_VISIBILITY_FOR_ROLE[user.role];
  const own: Prisma.EngagementNoteWhereInput = { authorUserId: user.userId };
  return visibility ? { OR: [own, { visibility }] } : own;
}

/**
 * May this caller read this specific note?
 *
 * Both gates, in order: the visibility rule on the note, then canViewStudent on
 * its subject. v1 had these as two independent implicit checks neither of which
 * knew about the other (R39), each called by hand in a page.
 */
export async function canViewNote(user: SessionUser, noteId: number): Promise<boolean> {
  const scope = noteVisibilityWhere(user);
  if (scope === null) return false;

  const note = await db.engagementNote.findFirst({
    where: { AND: [{ id: noteId }, scope] },
    select: { studentUserId: true },
  });
  if (!note) return false;
  return canViewStudent(user, note.studentUserId);
}

/**
 * May this caller edit this note? Author equality, and nothing else.
 *
 * SUPER is deliberately NOT exempt (spec R23, R28, §4 item 5). For a pastoral
 * record written by a named member of staff, "only the person who wrote it may
 * change what it says" is a defensible property and it is what v1 implements.
 * Note that this makes edit strictly narrower than view — do not derive one
 * from the other.
 */
export async function canEditNote(user: SessionUser, noteId: number): Promise<boolean> {
  const note = await db.engagementNote.findUnique({
    where: { id: noteId },
    select: { authorUserId: true },
  });
  if (!note) return false;
  return note.authorUserId === user.userId;
}

/**
 * May this caller write a note about this student?
 *
 * Two deliberate divergences from v1's canWriteNote
 * (jpc-space/src/lib/auth/permissions.ts:405-427), both inside
 * staffRosterIncludes:
 *
 * 1. ADMIN resolves through SeasonEnrollment, not StudentProfile.activeSeasonId
 *    (spec D12, R47/R48). v1's gate meant an admin lost the ability to write
 *    about a student the moment that student's active-season pointer moved,
 *    while canViewStudent — which checks enrolments — still let them open the
 *    page. "Why can't I write a note about this student I can clearly see" is
 *    a support question with a code answer.
 * 2. LEADER resolves through SeasonEnrollment.groupId, not GroupStudent
 *    (ruling C9, R49/R50). v1 asked GroupStudent, which (while it was global,
 *    before Plan 18 M1) followed a student's CURRENT group across every
 *    season and refused any student who had no GroupStudent row at all.
 *
 * SUPER and MENTOR write about any student with no scope check — v1's R46,
 * kept. It matches canReadAllStudents, and spec §4 item 7 records the
 * consequence plainly: one compromised mentor account reaches every pastoral
 * record in the product.
 *
 * STUDENT can never write a note, including about themselves (R51) — unlike
 * canViewStudent, there is no self clause here.
 */
export async function canWriteNote(user: SessionUser, studentUserId: number): Promise<boolean> {
  if (isSuper(user) || isMentor(user)) return true;
  return staffRosterIncludes(user, studentUserId);
}
