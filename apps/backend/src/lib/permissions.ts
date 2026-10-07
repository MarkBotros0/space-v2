import { db } from "../db/client";
import type { Prisma } from "../generated/prisma/client";

import type { SessionUser } from "./auth/tokens";
import { isAdminOfSeason, isLeaderOfGroup, isMentor, isSuper } from "./rbac";

export async function canAccessSeason(user: SessionUser, seasonId: number): Promise<boolean> {
  if (isSuper(user) || isMentor(user)) return true;
  if (isAdminOfSeason(user, seasonId)) return true;

  if (user.role === "LEADER") {
    if (user.groupLeaderIds.length === 0) return false;
    const groupInSeason = await db.group.findFirst({
      where: { seasonId, id: { in: user.groupLeaderIds } },
      select: { id: true },
    });
    return groupInSeason !== null;
  }

  if (user.role === "STUDENT") {
    if (user.activeSeasonId === seasonId) return true;
    const enrollment = await db.seasonEnrollment.findUnique({
      where: { studentUserId_seasonId: { studentUserId: user.userId, seasonId } },
      select: { id: true },
    });
    return enrollment !== null;
  }

  return false;
}

export async function canAccessGroup(user: SessionUser, groupId: number): Promise<boolean> {
  if (isSuper(user) || isMentor(user)) return true;
  if (isLeaderOfGroup(user, groupId)) return true;

  const group = await db.group.findUnique({
    where: { id: groupId },
    select: { seasonId: true },
  });
  if (!group) return false;
  if (isAdminOfSeason(user, group.seasonId)) return true;

  if (user.role === "STUDENT") {
    // The student's group *in this group's season*, from the enrolment.
    // GroupStudent is keyed by studentUserId alone, so it holds one row per
    // student across every season — asking it here denies a student their own
    // group in any season but the current one (ruling C9).
    const enrollment = await db.seasonEnrollment.findUnique({
      where: {
        studentUserId_seasonId: { studentUserId: user.userId, seasonId: group.seasonId },
      },
      select: { groupId: true },
    });
    return enrollment?.groupId === groupId;
  }

  return false;
}

/**
 * Which students a caller may see and mark on a session.
 *
 * "Who may touch attendance at all" and "whose attendance may they touch" are
 * different questions, and v1 only ever answered the first one in code. Its
 * leader restriction lived entirely in the page: the leader's attendance page
 * passed `user.groupLeaderIds` into the roster query
 * (`src/app/leader/sessions/[id]/attendance/page.tsx:23`) while the action
 * underneath accepted any student in the season
 * (`src/lib/attendance-actions.ts:35-71`). v1's own `/api/v1` roster route had
 * already dropped the argument, and this backend ported that route — so the
 * restriction vanished at exactly the point an API made the other students
 * reachable.
 *
 * Returns null when the caller may not mark this session at all.
 */
export type AttendanceScope =
  | { kind: "season" }
  | { kind: "groups"; seasonId: number; groupIds: number[] };

/**
 * The same question at season granularity: may this caller act on staff-only
 * data in this season, and if so over which students?
 *
 * Extracted so every roster-shaped read — attendance, the assignment tracker,
 * anything later that lists students by name and email — narrows identically.
 * Two hand-written copies of this would drift, and the first one already
 * shipped a leak by being written once and then not applied.
 */
export async function staffScopeForSeason(
  user: SessionUser,
  seasonId: number,
): Promise<AttendanceScope | null> {
  if (isSuper(user)) return { kind: "season" };
  if (isAdminOfSeason(user, seasonId)) return { kind: "season" };
  if (user.role !== "LEADER") return null;
  if (user.groupLeaderIds.length === 0) return null;
  const groupsInSeason = await db.group.findMany({
    where: { seasonId, id: { in: user.groupLeaderIds } },
    select: { id: true },
  });
  if (groupsInSeason.length === 0) return null;
  return { kind: "groups", seasonId, groupIds: groupsInSeason.map((g) => g.id) };
}

export async function attendanceScopeFor(
  user: SessionUser,
  sessionId: number,
): Promise<AttendanceScope | null> {
  if (isSuper(user)) return { kind: "season" };
  const session = await db.session.findUnique({
    where: { id: sessionId },
    select: { seasonId: true },
  });
  if (!session) return null;
  return staffScopeForSeason(user, session.seasonId);
}

/** Editing an assignment is a season-admin power; leading a group is not enough. */
export function canManageAssignment(user: SessionUser, seasonId: number): boolean {
  return isAdminOfSeason(user, seasonId);
}

export async function canMarkAttendance(user: SessionUser, sessionId: number): Promise<boolean> {
  return (await attendanceScopeFor(user, sessionId)) !== null;
}

export async function canViewSubmission(user: SessionUser, submissionId: number): Promise<boolean> {
  if (isSuper(user) || isMentor(user)) return true;

  const submission = await db.submission.findUnique({
    where: { id: submissionId },
    select: {
      studentUserId: true,
      assignment: { select: { seasonId: true } },
    },
  });
  if (!submission) return false;

  if (submission.studentUserId === user.userId) return true;
  if (isAdminOfSeason(user, submission.assignment.seasonId)) return true;

  if (user.role === "LEADER") {
    // Ruling C9: the student's group *for this assignment's season*.
    // GroupStudent is unique on studentUserId across the whole database, so it
    // holds one row per student regardless of season — asking it here answers
    // "what group are they in now", which is the wrong question and gives a
    // leader access to old submissions from students who have since joined
    // their group, while denying access to their own students' past work.
    const enrollment = await db.seasonEnrollment.findUnique({
      where: {
        studentUserId_seasonId: {
          studentUserId: submission.studentUserId,
          seasonId: submission.assignment.seasonId,
        },
      },
      select: { groupId: true },
    });
    if (enrollment?.groupId == null) return false;
    return isLeaderOfGroup(user, enrollment.groupId);
  }

  return false;
}

/**
 * Who may record a verdict on a submission.
 *
 * Strictly narrower than canViewSubmission, and deliberately not derived from
 * it: a MENTOR reads every submission in the system but reviews none, and the
 * author reads their own but must never review it. Deriving one from the other
 * is exactly how a read gate becomes a write gate by accident.
 */
export async function canReviewSubmission(
  user: SessionUser,
  submissionId: number,
): Promise<boolean> {
  if (isSuper(user)) return true;

  const submission = await db.submission.findUnique({
    where: { id: submissionId },
    select: {
      studentUserId: true,
      assignment: { select: { seasonId: true } },
    },
  });
  if (!submission) return false;

  // The author never reviews their own work, whatever else they are.
  if (submission.studentUserId === user.userId) return false;
  if (isAdminOfSeason(user, submission.assignment.seasonId)) return true;
  if (user.role !== "LEADER") return false;

  const enrollment = await db.seasonEnrollment.findUnique({
    where: {
      studentUserId_seasonId: {
        studentUserId: submission.studentUserId,
        seasonId: submission.assignment.seasonId,
      },
    },
    select: { groupId: true },
  });
  if (enrollment?.groupId == null) return false;
  return isLeaderOfGroup(user, enrollment.groupId);
}

/** Which seasons a calendar request may read (Plan 6 D-16.7). */
export type CalendarScope = { kind: "active" } | { kind: "seasons"; seasonIds: number[] };

/**
 * The season set behind GET /api/v1/sessions, derived from the role — never
 * from the query. `seasonId` NARROWS within the caller's set; outside it the
 * answer is "forbidden", never a widened read (C8).
 */
export async function calendarScopeFor(
  user: SessionUser,
  seasonId: number | null,
): Promise<CalendarScope | "forbidden" | "not_found"> {
  if (seasonId !== null) {
    const live = await db.season.findFirst({ where: { id: seasonId, deletedAt: null }, select: { id: true } });
    if (!live) return "not_found";
  }

  if (isSuper(user)) {
    return seasonId !== null ? { kind: "seasons", seasonIds: [seasonId] } : { kind: "active" };
  }

  if (user.role === "ADMIN") {
    if (seasonId !== null) {
      return isAdminOfSeason(user, seasonId) ? { kind: "seasons", seasonIds: [seasonId] } : "forbidden";
    }
    const live = await db.season.findMany({
      where: { id: { in: user.seasonAdminIds }, deletedAt: null },
      select: { id: true },
    });
    return { kind: "seasons", seasonIds: live.map((s) => s.id) };
  }

  if (user.role === "LEADER") {
    // One query instead of v1's per-season N+1 (spec 03 R85).
    const groups = await db.group.findMany({
      where: { id: { in: user.groupLeaderIds }, season: { deletedAt: null } },
      select: { seasonId: true },
    });
    const led = [...new Set(groups.map((g) => g.seasonId))];
    if (seasonId !== null) {
      return led.includes(seasonId) ? { kind: "seasons", seasonIds: [seasonId] } : "forbidden";
    }
    return { kind: "seasons", seasonIds: led };
  }

  // STUDENT keeps the pinned-season route; MENTOR has no calendar (spec 03 §9).
  return "forbidden";
}

/**
 * The authoring gate: SUPER, or an admin of the quiz's own season.
 *
 * Same rule as v1's canManageQuiz (permissions.ts:135-146). What changes is that
 * here it is the ONLY thing between a caller and a question write — there is no
 * longer a page that simply does not render the builder.
 */
export async function canManageQuiz(user: SessionUser, quizId: number): Promise<boolean> {
  if (isSuper(user)) return true;
  const quiz = await db.quiz.findUnique({ where: { id: quizId }, select: { seasonId: true } });
  if (!quiz) return false;
  return isAdminOfSeason(user, quiz.seasonId);
}

/**
 * The grading gate: anyone with a staff scope in the quiz's season — SUPER, the
 * season's admin, or a leader with a group in it.
 *
 * Expressed through staffScopeForSeason rather than a hand-written copy of v1's
 * isLeaderInSeason, deliberately: the same call that answers "may they grade"
 * also produces the student set they may grade over (lib/quiz-scope.ts), so the
 * gate and the scope cannot drift apart. v1 kept them in different files and the
 * write side never consulted the scope at all (R93).
 */
export async function canGradeQuiz(user: SessionUser, quizId: number): Promise<boolean> {
  const quiz = await db.quiz.findUnique({ where: { id: quizId }, select: { seasonId: true } });
  if (!quiz) return false;
  return (await staffScopeForSeason(user, quiz.seasonId)) !== null;
}

/**
 * May this caller read this student at all? (spec 06 §4.1 "Read student detail")
 *
 * v1's loadStudentDetail performed no authorization — four pages each called
 * canViewStudent by convention before it (R70). Here the gate lives in the
 * handler. One deliberate divergence from v1's gate: the LEADER branch
 * resolves through SeasonEnrollment.groupId, not GroupStudent (ruling C9) —
 * GroupStudent holds one row per student across the whole database, so it
 * answers "are they in my group NOW", denying a leader their own students'
 * history the moment a new season reassigns them. canViewSubmission already
 * made this exact call; the two must not disagree.
 */
export async function canViewStudent(user: SessionUser, studentUserId: number): Promise<boolean> {
  if (isSuper(user) || isMentor(user)) return true;
  if (user.userId === studentUserId) return true;
  if (user.role === "ADMIN") {
    if (user.seasonAdminIds.length === 0) return false;
    const enrollment = await db.seasonEnrollment.findFirst({
      where: { studentUserId, seasonId: { in: user.seasonAdminIds } },
      select: { id: true },
    });
    return enrollment !== null;
  }
  if (user.role === "LEADER") {
    if (user.groupLeaderIds.length === 0) return false;
    const enrollment = await db.seasonEnrollment.findFirst({
      where: { studentUserId, groupId: { in: user.groupLeaderIds } },
      select: { id: true },
    });
    return enrollment !== null;
  }
  return false;
}

/**
 * May this caller edit this student's profile?
 *
 * Divergence from v1, per spec 06 D4: v1's canEditStudent tested the
 * activeSeasonId pointer while canViewStudent tested enrollments, so an ADMIN
 * could edit a student their list never showed them and not edit one it did.
 * Both gates are enrollment-based here, and edit additionally requires the
 * enrollment to be ACTIVE — an admin's write power over a person ends when
 * that person's season with them does.
 */
export async function canEditStudent(user: SessionUser, studentUserId: number): Promise<boolean> {
  if (isSuper(user)) return true;
  if (user.userId === studentUserId) return true;
  if (user.role !== "ADMIN" || user.seasonAdminIds.length === 0) return false;
  const enrollment = await db.seasonEnrollment.findFirst({
    where: { studentUserId, seasonId: { in: user.seasonAdminIds }, status: "ACTIVE" },
    select: { id: true },
  });
  return enrollment !== null;
}

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
