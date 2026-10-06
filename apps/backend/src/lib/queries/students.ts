import type {
  EnrollmentHistoryItem,
  StudentDetailInternal,
  StudentDetailPrivate,
  StudentDetailPublic,
  StudentListItem,
  StudentListQuery,
} from "@space/shared";

import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import type { SessionUser } from "../auth/tokens";
import { canReadAllStudents, isMentor, isSuper } from "../rbac";

export interface StudentListResult {
  students: StudentListItem[];
  nextCursor: number | null;
  total: number;
}

type StudentScope = { kind: "all" } | { kind: "ids"; ids: number[] };

/**
 * D6's single implementation of "which students may this caller see".
 *
 * SUPER and MENTOR read all (canReadAllStudents). ADMIN gets the distinct
 * students EVER enrolled in their seasons, regardless of enrollment status —
 * v1's semantics (R30/R31), kept: the list answers "ever mine", not
 * "currently mine". LEADER gets the distinct students whose ENROLLMENT names
 * one of their groups — ruling C9; v1's (unreachable — no leader list page
 * ever existed, R28) branch read GroupStudent instead, which forgets a
 * leader's students the moment a later season reassigns them.
 *
 * null = this caller has no student-list surface at all (STUDENT) → 403.
 */
async function studentListScope(user: SessionUser): Promise<StudentScope | null> {
  if (canReadAllStudents(user)) return { kind: "all" };
  if (user.role === "ADMIN") {
    if (user.seasonAdminIds.length === 0) return { kind: "ids", ids: [] };
    const enrollments = await db.seasonEnrollment.findMany({
      where: { seasonId: { in: user.seasonAdminIds } },
      select: { studentUserId: true },
      distinct: ["studentUserId"],
    });
    return { kind: "ids", ids: enrollments.map((e) => e.studentUserId) };
  }
  if (user.role === "LEADER") {
    if (user.groupLeaderIds.length === 0) return { kind: "ids", ids: [] };
    const enrollments = await db.seasonEnrollment.findMany({
      where: { groupId: { in: user.groupLeaderIds } },
      select: { studentUserId: true },
      distinct: ["studentUserId"],
    });
    return { kind: "ids", ids: enrollments.map((e) => e.studentUserId) };
  }
  return null;
}

function searchFilter(q: string | undefined): Prisma.UserWhereInput {
  if (!q) return {};
  return {
    OR: [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { studentProfile: { university: { contains: q, mode: "insensitive" } } },
    ],
  };
}

const LIST_SELECT = {
  id: true,
  name: true,
  email: true,
  avatarPath: true,
  graduationYear: true,
  studentProfile: {
    select: {
      university: true,
      year: true,
      activeSeason: { select: { title: true } },
    },
  },
  // Advisory current group — the one question GroupStudent may answer (C9).
  groupStudentMembership: { select: { group: { select: { name: true } } } },
} as const;

type ListRow = Prisma.UserGetPayload<{ select: typeof LIST_SELECT }>;

function toListItem(u: ListRow): StudentListItem {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    avatarPath: u.avatarPath,
    university: u.studentProfile?.university ?? null,
    year: u.studentProfile?.year ?? null,
    graduationYear: u.graduationYear,
    activeSeasonTitle: u.studentProfile?.activeSeason?.title ?? null,
    currentGroupName: u.groupStudentMembership?.group.name ?? null,
    droppedEnrollment: null,
  };
}

/** Returns null when the caller may not read this surface at all → 403. */
export async function listStudents(
  user: SessionUser,
  query: StudentListQuery,
): Promise<StudentListResult | null> {
  if (query.status === "dropped") return listDroppedEnrollments(user, query);

  // Alumni surface: SUPER, ADMIN, MENTOR (spec 06 §4.1/§7). LEADER never had
  // one; as an endpoint the empty-scope convention would leak "you exist but
  // see nothing" — refuse instead (C8).
  if (query.status === "alumni" && !(isSuper(user) || isMentor(user) || user.role === "ADMIN")) {
    return null;
  }

  const scope = await studentListScope(user);
  if (scope === null) return null;
  if (scope.kind === "ids" && scope.ids.length === 0) {
    return { students: [], nextCursor: null, total: 0 };
  }

  // AND-composed so the scope clause can never be overwritten by a filter —
  // the same discipline as the submissions queue (a disappearing scope clause
  // is a data leak, not a lost filter).
  const where: Prisma.UserWhereInput = {
    AND: [
      { role: "STUDENT", deletedAt: null },
      // R29/R38: graduationYear is the whole alumnus marker; the two lists
      // are the same table filtered on the same column.
      { graduationYear: query.status === "alumni" ? { not: null } : null },
      ...(scope.kind === "ids" ? [{ id: { in: scope.ids } }] : []),
      // Season filter through enrollments, any status (C9; matches the ADMIN
      // scope's "ever enrolled" meaning).
      ...(query.seasonId ? [{ seasonEnrollments: { some: { seasonId: query.seasonId } } }] : []),
      searchFilter(query.q),
    ],
  };

  const orderBy: Prisma.UserOrderByWithRelationInput[] =
    query.status === "alumni"
      ? [{ graduationYear: "desc" }, { name: "asc" }, { id: "asc" }] // R40
      : [{ name: "asc" }, { id: "asc" }]; // R34's order, without its cap

  const [rows, total] = await Promise.all([
    db.user.findMany({
      where,
      orderBy,
      take: query.limit + 1, // one extra row answers "is there another page"
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: LIST_SELECT,
    }),
    db.user.count({ where }),
  ]);

  const page = rows.slice(0, query.limit);
  return {
    students: page.map(toListItem),
    nextCursor: rows.length > query.limit ? (page[page.length - 1]?.id ?? null) : null,
    total,
  };
}

/**
 * The dropped list is a list of ENROLLMENTS, not students (R43): its row key
 * is the enrollment id and a student dropped from three seasons appears three
 * times. SUPER and ADMIN only — v1's gate also admitted MENTOR but no mentor
 * page ever called it; as an endpoint that would hand every drop reason in
 * the database to read-all (spec 06 §4.3), so the surface narrows (§7).
 */
async function listDroppedEnrollments(
  user: SessionUser,
  query: StudentListQuery,
): Promise<StudentListResult | null> {
  if (!isSuper(user) && user.role !== "ADMIN") return null;
  if (user.role === "ADMIN" && user.seasonAdminIds.length === 0) {
    return { students: [], nextCursor: null, total: 0 };
  }

  const where: Prisma.SeasonEnrollmentWhereInput = {
    AND: [
      { status: "WITHDRAWN" },
      // D12: v1 filtered neither deletedAt nor role here, so a soft-deleted
      // student's name, email and drop reason stayed listed forever, with a
      // click-through that 404s.
      { studentUser: { role: "STUDENT", deletedAt: null, ...searchFilter(query.q) } },
      ...(user.role === "ADMIN" ? [{ seasonId: { in: user.seasonAdminIds } }] : []),
      ...(query.seasonId ? [{ seasonId: query.seasonId }] : []),
    ],
  };

  const [rows, total] = await Promise.all([
    db.seasonEnrollment.findMany({
      where,
      orderBy: [{ droppedAt: "desc" }, { id: "desc" }], // R46
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        seasonId: true,
        droppedAt: true,
        dropReason: true,
        season: { select: { title: true } },
        studentUser: { select: LIST_SELECT },
      },
    }),
    db.seasonEnrollment.count({ where }),
  ]);

  const page = rows.slice(0, query.limit);
  return {
    students: page.map((r) => ({
      ...toListItem(r.studentUser),
      droppedEnrollment: {
        enrollmentId: r.id,
        seasonId: r.seasonId,
        seasonTitle: r.season.title,
        // Nullable on the contract: only dropEnrollment sets it today, but
        // nothing in the schema guarantees that (spec 06 §2's warning about
        // v1's non-null assertion at students-query.ts:196).
        droppedAt: r.droppedAt?.toISOString() ?? null,
        dropReason: r.dropReason,
      },
    })),
    nextCursor: rows.length > query.limit ? (page[page.length - 1]?.id ?? null) : null,
    total,
  };
}

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
          notes: true,
          activeSeasonId: true,
          activeSeason: { select: { title: true, code: true } },
        },
      },
      groupStudentMembership: { select: { group: { select: { id: true, name: true } } } },
    },
  });
  if (!row) return null;

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
  }));

  const p = row.studentProfile;
  const base = {
    id: row.id,
    name: row.name,
    email: row.email,
    avatarPath: row.avatarPath,
    graduationYear: row.graduationYear,
    currentGroup: row.groupStudentMembership?.group
      ? { id: row.groupStudentMembership.group.id, name: row.groupStudentMembership.group.name }
      : null,
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

  return { ...base, profile: { ...privateProfile, notes: p?.notes ?? null } };
}
