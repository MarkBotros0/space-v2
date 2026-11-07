import type {
  EnrollmentHistoryItem,
  GraduatedByException,
  StudentDetailInternal,
  StudentDetailPrivate,
  StudentDetailPublic,
  StudentInviteState,
} from "@space/shared";

import { db } from "../../../db/client";
import type { SessionUser } from "../../auth/tokens";
import { canReadAllStudents, isSuper } from "../../rbac";
import { CURRENT_MEMBERSHIP_ORDER, currentMembershipSelect } from "./current-group";
import { attendancePctByEnrollment, canReadEnrollmentHistory } from "./history";

export type StudentDetailView = "public" | "private" | "internal";
export type StudentDetail = StudentDetailPublic | StudentDetailPrivate | StudentDetailInternal;

/**
 * The role-shaped detail (spec 06 §4.2). The profile arms are built FIELD BY
 * FIELD, never by spreading the Prisma row: a spread is how a newly selected
 * column leaks to the narrow roles without any diff touching this function,
 * and the absence tests only stay meaningful while construction is explicit.
 *
 * Sub-resources (attendance %, submissions, notes, documents, engagement) are
 * deliberately absent — they become their own endpoints in later plans (§7's
 * split), which also kills v1's 2-queries-per-enrollment N+1 (R76).
 */
export async function loadStudentDetail(
  studentUserId: number,
  view: StudentDetailView,
  user: SessionUser,
): Promise<StudentDetail | null> {
  const row = await db.user.findFirst({
    // R69: role and soft-delete are part of resolution, not decoration.
    where: { id: studentUserId, role: "STUDENT", deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      avatarPath: true,
      graduationYear: true,
      // Account-level since 2026-11-06; read only for the private/internal arms below.
      phone: true,
      dateOfBirth: true,
      studentProfile: {
        select: {
          university: true,
          faculty: true,
          universityGraduationYear: true,
        },
      },
      groupStudentMemberships: currentMembershipSelect({ id: true, name: true }),
    },
  });
  if (!row) return null;

  // REG-97: the staff-only note is read ONLY for the internal arm, in its own
  // query, so no other view ever holds the column in memory — a later edit that
  // spreads the profile row cannot leak what was never selected.
  const internalNotes =
    view === "internal"
      ? ((
          await db.studentProfile.findUnique({
            where: { userId: studentUserId },
            select: { notes: true },
          })
        )?.notes ?? null)
      : null;

  // Read for SUPER alone, in its own query, like the notes: nobody else's
  // view ever holds the reason in memory.
  const exception = isSuper(user) ? await loadGraduatedByException(studentUserId) : undefined;
  // Staff resend a stuck invite from the student's page (owner, 2026-11-07).
  const invite = view === "internal" ? await loadInviteState(studentUserId) : undefined;

  const enrollments = await db.seasonEnrollment.findMany({
    where: { studentUserId },
    orderBy: { enrolledAt: "desc" }, // R72
    select: {
      id: true,
      seasonId: true,
      groupId: true,
      status: true,
      enrolledAt: true,
      completedAt: true,
      droppedAt: true,
      dropReason: true,
      season: {
        select: { title: true, code: true, status: true, deletedAt: true, startDate: true, endDate: true },
      },
      group: { select: { name: true } },
    },
  });

  // Staff see only the seasons they serve in now (§7's "scoped season rows", and
  // the spec's "What people can see of earlier seasons"). A person's own view and
  // SUPER's and MENTOR's hold every season.
  const seesAll = user.userId === studentUserId || canReadAllStudents(user);
  const scoped = seesAll ? enrollments : enrollments.filter((e) => canReadEnrollmentHistory(user, e));

  // REG-83: the percentage is a staff figure, so the subject's own view carries null.
  const pctByEnrollment =
    view === "private"
      ? new Map<number, number>()
      : await attendancePctByEnrollment(
          studentUserId,
          scoped.filter((e) => canReadEnrollmentHistory(user, e)),
        );

  const history: EnrollmentHistoryItem[] = scoped.map((e) => ({
    enrollmentId: e.id,
    seasonId: e.seasonId,
    seasonCode: e.season.code,
    seasonTitle: e.season.title,
    seasonStatus: e.season.status,
    startDate: e.season.startDate.toISOString(),
    endDate: e.season.endDate.toISOString(),
    groupName: e.group?.name ?? null, // the historic group, from the enrollment (C9/R5)
    status: e.status,
    enrolledAt: e.enrolledAt.toISOString(),
    completedAt: e.completedAt?.toISOString() ?? null,
    droppedAt: e.droppedAt?.toISOString() ?? null,
    // Private to staff: not even the student reads why they were dropped. Once
    // brought back the row isn't dropped, though the old reason stays on it.
    dropReason: view === "internal" && e.status === "WITHDRAWN" ? e.dropReason : null,
    attendancePct: pctByEnrollment.get(e.id) ?? null,
  }));

  // The advisory current group has the same limit: staff get the newest one in
  // a season they may read, never a group from another season.
  const currentGroup = seesAll
    ? (row.groupStudentMemberships[0]?.group ?? null)
    : ((
        await db.groupStudent.findFirst({
          where: { studentUserId, seasonId: { in: scoped.map((e) => e.seasonId) } },
          orderBy: CURRENT_MEMBERSHIP_ORDER,
          select: { group: { select: { id: true, name: true } } },
        })
      )?.group ?? null);

  const p = row.studentProfile;
  // Derived, never stored: the newest ACTIVE enrolment in a live ACTIVE season
  // (the same rule as loadScopes), among the rows this caller may read.
  const current =
    scoped.find((e) => e.status === "ACTIVE" && e.season.status === "ACTIVE" && !e.season.deletedAt) ?? null;
  const base = {
    id: row.id,
    name: row.name,
    email: row.email,
    avatarPath: row.avatarPath,
    graduationYear: row.graduationYear,
    ...(exception === undefined ? {} : { graduatedByException: exception }),
    ...(invite === undefined ? {} : { invite }),
    currentGroup,
    enrollments: history,
  };
  const publicProfile = {
    university: p?.university ?? null,
    faculty: p?.faculty ?? null,
    universityGraduationYear: p?.universityGraduationYear ?? null,
    activeSeasonId: current?.seasonId ?? null,
    activeSeasonTitle: current?.season.title ?? null,
    activeSeasonCode: current?.season.code ?? null,
    // Leaders and mentors may call a student (owner, 2026-11-07).
    phone: row.phone,
  };
  if (view === "public") return { ...base, profile: publicProfile };

  const privateProfile = {
    ...publicProfile,
    dateOfBirth: row.dateOfBirth?.toISOString() ?? null,
  };
  if (view === "private") return { ...base, profile: privateProfile };

  return { ...base, profile: { ...privateProfile, notes: internalNotes } };
}

async function loadGraduatedByException(userId: number): Promise<GraduatedByException> {
  const row = await db.user.findUnique({
    where: { id: userId },
    select: {
      graduationOverrideAt: true,
      graduationOverrideReason: true,
      graduationOverrideBy: { select: { name: true } },
    },
  });
  if (!row?.graduationOverrideAt) return null;
  return {
    at: row.graduationOverrideAt.toISOString(),
    byName: row.graduationOverrideBy?.name ?? null,
    reason: row.graduationOverrideReason,
  };
}

/**
 * Whether the account is still waiting to be set up, for staff: null once the
 * person has a password or has signed in, else `invited` while their newest
 * invite is unused and unexpired, `pending` when there is none that works.
 * The same rule as the Community badges (routes/users/views.ts); the hash is
 * read here and never leaves.
 */
async function loadInviteState(userId: number): Promise<StudentInviteState> {
  const row = await db.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true, lastLoginAt: true },
  });
  if (!row || row.passwordHash !== null || row.lastLoginAt !== null) return null;
  const latest = await db.inviteToken.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { usedAt: true, expiresAt: true },
  });
  const live = latest !== null && latest.usedAt === null && latest.expiresAt > new Date();
  return {
    status: live ? "invited" : "pending",
    expiresAt: live ? latest.expiresAt.toISOString() : null,
  };
}
