import { db } from "../db/client";
import type { Prisma } from "../generated/prisma/client";

import type { SessionUser } from "./auth/tokens";
import { groupIdInSeason, studentCanSeeAssignment } from "./queries/assignments";
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

/**
 * May this caller write a note about this student?
 *
 * Two deliberate divergences from v1's canWriteNote
 * (jpc-space/src/lib/auth/permissions.ts:405-427):
 *
 * 1. ADMIN resolves through SeasonEnrollment, not StudentProfile.activeSeasonId
 *    (spec D12, R47/R48). v1's gate meant an admin lost the ability to write
 *    about a student the moment that student's active-season pointer moved,
 *    while canViewStudent — which checks enrolments — still let them open the
 *    page. "Why can't I write a note about this student I can clearly see" is
 *    a support question with a code answer.
 * 2. LEADER resolves through SeasonEnrollment.groupId, not GroupStudent
 *    (ruling C9, R49/R50). GroupStudent.studentUserId is @unique across the
 *    whole database, so it holds one group per student for all time; asking it
 *    here follows a student's CURRENT group across every season and refuses
 *    any student who has no GroupStudent row at all.
 *
 * SUPER and MENTOR write about any student with no scope check — v1's R46,
 * kept. It matches canReadAllStudents, and spec §4 item 7 records the
 * consequence plainly: one compromised mentor account reaches every pastoral
 * record in the product.
 */
export async function canWriteNote(user: SessionUser, studentUserId: number): Promise<boolean> {
  if (isSuper(user) || isMentor(user)) return true;

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

  // STUDENT can never write a note, including about themselves (R51).
  return false;
}

/**
 * Authoring interactive video questions on a session.
 *
 * Season-scoped ADMIN + SUPER only — not a group LEADER, not a MENTOR. Ported
 * from v1's `canManageSessionVideo`, which is one of the gates v1 got right;
 * what v1 lacked was any gate on the *reads*, one of which carries the answer
 * key for every question (spec 13 R68/R73).
 */
export async function canManageSessionVideo(
  user: SessionUser,
  sessionId: number,
): Promise<boolean> {
  if (isSuper(user)) return true;
  const session = await db.session.findUnique({
    where: { id: sessionId },
    select: { seasonId: true },
  });
  if (!session) return false;
  return isAdminOfSeason(user, session.seasonId);
}

/**
 * A student with a live place in this season.
 *
 * Deliberately stricter than `canAccessSeason`, whose student branch accepts
 * any `SeasonEnrollment` row whatever its status. v1 gated the video answer and
 * progress actions on that looser predicate while the page that rendered the
 * player required `status: "ACTIVE"` — so a dropped or completed student could
 * not open the page and could still answer (spec 13 R51, §10 D9). This is the
 * rule v1 intended, made real.
 *
 * If alumni are ever meant to keep access to a past season's material, that is
 * a separate named rule, not a side effect of a permissive gate.
 */
export async function hasActiveEnrollment(user: SessionUser, seasonId: number): Promise<boolean> {
  if (user.role !== "STUDENT") return false;
  const enrollment = await db.seasonEnrollment.findUnique({
    where: { studentUserId_seasonId: { studentUserId: user.userId, seasonId } },
    select: { status: true },
  });
  return enrollment?.status === "ACTIVE";
}

/**
 * Who may comment on a forum post.
 *
 * v1's `canCommentOnForumSubmission` is the one gate in domain 14 that would
 * have survived an API — it re-reads the target, re-checks the type and the
 * flag, and compares live group membership. Two changes:
 *
 *  1. Membership resolves through `SeasonEnrollment`, not `GroupStudent`
 *     (ruling C9). `GroupStudent.studentUserId` is `@unique` across the whole
 *     database, so it answers "what group is this student in now" — the wrong
 *     question for an assignment in a season they may since have left.
 *  2. LEADER is admitted for groups they lead (spec 14 §10 D3). In v1 both
 *     LEADER and MENTOR fall through to `return false`, so a leader cannot
 *     participate in — or moderate — the discussion of their own group. That is
 *     an omission by missing `if`, not a policy. MENTOR stays read-only.
 *
 * Also new: a DRAFT target is refused. v1 read only `assignmentId` from the
 * target row, so a group-mate's unposted draft was a valid comment target for
 * anyone who could name its sequential id (spec 14 R43).
 */
export async function canCommentOnForumSubmission(
  user: SessionUser,
  submissionId: number,
): Promise<boolean> {
  const sub = await db.submission.findUnique({
    where: { id: submissionId },
    select: {
      studentUserId: true,
      status: true,
      assignment: { select: { seasonId: true, type: true, forumAllowComments: true } },
    },
  });
  if (!sub) return false;
  if (sub.assignment.type !== "FORUM" || !sub.assignment.forumAllowComments) return false;
  if (sub.status === "DRAFT") return false;

  if (isSuper(user)) return true;
  if (isAdminOfSeason(user, sub.assignment.seasonId)) return true;

  const authorGroupId = await groupIdInSeason(sub.studentUserId, sub.assignment.seasonId);
  if (authorGroupId === null) return false;

  if (user.role === "LEADER") return isLeaderOfGroup(user, authorGroupId);
  if (user.role === "STUDENT") {
    const mine = await groupIdInSeason(user.userId, sub.assignment.seasonId);
    return mine !== null && mine === authorGroupId;
  }
  return false;
}

/**
 * Who may remove a comment.
 *
 * v1: the author, SUPER, or an ADMIN of the assignment's season — but the
 * delete control renders only for the viewer's own comments and no staff screen
 * shows a thread at all, so the staff half of that rule has never been
 * exercisable (spec 14 R49/R52/R53). LEADER is added for the same reason as
 * above. The post's own author is NOT admitted for someone else's comment:
 * owning a thread is not moderating it.
 */
export async function canDeleteForumComment(
  user: SessionUser,
  commentId: number,
): Promise<boolean> {
  const comment = await db.forumComment.findUnique({
    where: { id: commentId },
    select: {
      authorUserId: true,
      submission: {
        select: { studentUserId: true, assignment: { select: { seasonId: true } } },
      },
    },
  });
  if (!comment) return false;
  if (comment.authorUserId === user.userId) return true;
  if (isSuper(user)) return true;

  const seasonId = comment.submission.assignment.seasonId;
  if (isAdminOfSeason(user, seasonId)) return true;

  if (user.role === "LEADER") {
    const authorGroupId = await groupIdInSeason(comment.submission.studentUserId, seasonId);
    return authorGroupId !== null && isLeaderOfGroup(user, authorGroupId);
  }
  return false;
}

/**
 * Whose posts this caller may read on a forum assignment.
 *
 * `groupIds: null` means every group in the season. The staff arm is new
 * capability — v1 has no staff forum screen whatsoever, so nobody could see a
 * thread to moderate it (spec 14 §10 D2/D3).
 */
export type ForumAudience =
  | { kind: "student"; groupId: number | null }
  | { kind: "staff"; groupIds: number[] | null };

export async function forumAudienceFor(
  user: SessionUser,
  assignmentId: number,
): Promise<ForumAudience | null> {
  const assignment = await db.assignment.findFirst({
    where: { id: assignmentId, deletedAt: null, type: "FORUM" },
    select: { seasonId: true, isAllGroups: true, targets: { select: { groupId: true } } },
  });
  if (!assignment) return null;

  if (isSuper(user) || isMentor(user) || isAdminOfSeason(user, assignment.seasonId)) {
    return { kind: "staff", groupIds: null };
  }

  if (user.role === "LEADER") {
    const scope = await staffScopeForSeason(user, assignment.seasonId);
    if (scope === null || scope.kind !== "groups") return null;
    return { kind: "staff", groupIds: scope.groupIds };
  }

  if (user.role !== "STUDENT") return null;
  if (!(await hasActiveEnrollment(user, assignment.seasonId))) return null;
  // The targeting rule v1 enforced only by refusing to render the page (R15),
  // from the same helper the assignment reads use.
  const targeted = await studentCanSeeAssignment(
    user.userId,
    assignment.seasonId,
    assignment.isAllGroups,
    assignment.targets.map((t) => t.groupId),
  );
  if (!targeted) return null;
  return { kind: "student", groupId: await groupIdInSeason(user.userId, assignment.seasonId) };
}

/**
 * Which seasons a caller may see report data for.
 *
 * `null` means "this surface is not theirs at all" — the caller gets 403
 * before any query runs. That is deliberate for LEADER: v1 excluded leaders
 * from this domain by not having a leader route (R109), and the v2 route tree
 * is flat and role-driven, so `/reports` exists as a file regardless of role
 * and is hidden only by navFor. Domain 4 already found one ported endpoint
 * that trusted groupLeaderIds without checking the target; a leader-scoped
 * report is a reasonable future feature and must not arrive by accident as
 * "the whole season, filtered on the client" (spec D6 #4).
 *
 * An ADMIN with no seasons returns an EMPTY permitted list, not null: they may
 * open the screen, it is simply empty (R2). Distinguishing the two matters —
 * 403 would tell an admin their account is broken.
 */
export type ReportScope = { kind: "all" } | { kind: "seasons"; seasonIds: number[] };

export function reportScopeFor(user: SessionUser): ReportScope | null {
  // MENTOR's remit is read-all-students (rbac.ts:41-43) and v1 gives them an
  // unscoped engagement CSV (R45), so "all" here is a port, not a widening.
  // SUPER gains the engagement view that v1's per-role page tree denied them
  // while its export route handed them the same data (spec D17) — a deliberate
  // divergence, recorded in this plan's ledger row 10.
  if (isSuper(user) || isMentor(user)) return { kind: "all" };
  if (user.role === "ADMIN") return { kind: "seasons", seasonIds: user.seasonAdminIds };
  return null;
}

/**
 * Who may download a season's full workbook.
 *
 * MENTOR is refused. v1's endpoint allows MENTOR any season id (R85) and the
 * only thing preventing it is that /mentor/reports never renders the button
 * (R86) — the domain's clearest example of authorization by absence of a
 * control. A mentor's remit is read-all-STUDENTS; a season workbook is also
 * every quiz score and every assignment status, which is nearer a leader's
 * remit than a mentor's (spec D6 #3).
 *
 * isAdminOfSeason short-circuits for SUPER and pairs the ADMIN role with the
 * seasonAdminIds claim (ruling C7), so a stray SeasonAdmin row naming a
 * student grants nothing.
 */
export function canExportSeasonWorkbook(user: SessionUser, seasonId: number): boolean {
  return isAdminOfSeason(user, seasonId);
}
