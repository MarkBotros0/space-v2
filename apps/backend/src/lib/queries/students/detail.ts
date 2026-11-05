import type {
  EnrollmentHistoryItem,
  StudentDetailInternal,
  StudentDetailPrivate,
  StudentDetailPublic,
} from "@space/shared";

import { db } from "../../../db/client";
import type { SessionUser } from "../../auth/tokens";
import { currentMembershipSelect } from "./current-group";
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
      studentProfile: {
        select: {
          university: true,
          year: true,
          phone: true,
          dateOfBirth: true,
          spiritualBackground: true,
          gifts: true,
          activeSeasonId: true,
          activeSeason: { select: { title: true, code: true } },
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
        select: { title: true, code: true, status: true, startDate: true, endDate: true },
      },
      group: { select: { name: true } },
    },
  });

  // LEADER sees only the rows naming one of their groups (§7's "scoped
  // season rows"); every other admitted role sees the full history.
  const scoped =
    user.role === "LEADER"
      ? enrollments.filter((e) => e.groupId !== null && user.groupLeaderIds.includes(e.groupId))
      : enrollments;

  // REG-83: the percentage is a staff figure. The subject's own view carries
  // null, and so does any season outside the caller's attendance scope.
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
    // Free-text personal data: withheld from the narrow roles.
    dropReason: view === "public" ? null : e.dropReason,
    attendancePct: pctByEnrollment.get(e.id) ?? null,
  }));

  const p = row.studentProfile;
  const base = {
    id: row.id,
    name: row.name,
    email: row.email,
    avatarPath: row.avatarPath,
    graduationYear: row.graduationYear,
    currentGroup: row.groupStudentMemberships[0]?.group ?? null,
    enrollments: history,
  };
  const publicProfile = {
    university: p?.university ?? null,
    year: p?.year ?? null,
    gifts: p?.gifts ?? null,
    activeSeasonId: p?.activeSeasonId ?? null,
    activeSeasonTitle: p?.activeSeason?.title ?? null,
    activeSeasonCode: p?.activeSeason?.code ?? null,
  };
  if (view === "public") return { ...base, profile: publicProfile };

  const privateProfile = {
    ...publicProfile,
    phone: p?.phone ?? null,
    dateOfBirth: p?.dateOfBirth?.toISOString() ?? null,
    spiritualBackground: p?.spiritualBackground ?? null,
  };
  if (view === "private") return { ...base, profile: privateProfile };

  return { ...base, profile: { ...privateProfile, notes: internalNotes } };
}
