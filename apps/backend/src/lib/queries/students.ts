import type {
  EnrollmentHistoryItem,
  StudentAttendanceHistoryItem,
  StudentDetailInternal,
  StudentDetailPrivate,
  StudentDetailPublic,
  StudentDocumentItem,
  StudentListItem,
  StudentListQuery,
  StudentSubmissionItem,
} from "@space/shared";

import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import type { SessionUser } from "../auth/tokens";
import { isLate } from "./assignments";
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
 * "currently mine".
 *
 * null = this caller has no student-list surface at all → 403. That is
 * STUDENT and LEADER: v1 had no leader students list (06-students R28, no
 * `src/app/leader/students/page.tsx`) — a leader reaches their students
 * through My groups and the detail page (v1 parity 2026-10-09).
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

/**
 * REG-82: v1's sort keys, server-side. `name` and the unsorted defaults are
 * plain column orders. The other three sort by a value on a related row, and
 * Prisma cannot place NULLs in a relation order — which matters, because v1
 * compared lowercased strings with a missing value as "" (first ascending,
 * last descending), the opposite of Postgres's default. Those keys are
 * therefore sorted in memory (below), exactly where v1 sorted them.
 */
function columnOrderBy(query: StudentListQuery): Prisma.UserOrderByWithRelationInput[] {
  if (query.sort === "name") return [{ name: query.dir }, { id: "asc" }];
  return query.status === "alumni"
    ? [{ graduationYear: "desc" }, { name: "asc" }, { id: "asc" }] // R40
    : [{ name: "asc" }, { id: "asc" }]; // R34's order, without its cap
}

type RelatedSort = "university" | "season" | "group";

const SORT_KEY_SELECT = {
  id: true,
  name: true,
  studentProfile: { select: { university: true, activeSeason: { select: { title: true } } } },
  groupStudentMembership: { select: { group: { select: { name: true } } } },
} as const;

/** Every matching id in v1's order for a related-row sort key, then paged by id. */
async function listByRelatedSort(
  where: Prisma.UserWhereInput,
  sort: RelatedSort,
  dir: "asc" | "desc",
  query: StudentListQuery,
): Promise<StudentListResult> {
  const keyed = await db.user.findMany({ where, select: SORT_KEY_SELECT });
  const keyOf = (u: (typeof keyed)[number]): string =>
    (sort === "university"
      ? u.studentProfile?.university
      : sort === "season"
        ? u.studentProfile?.activeSeason?.title
        : u.groupStudentMembership?.group.name
    )?.toLowerCase() ?? "";
  const sign = dir === "asc" ? 1 : -1;
  keyed.sort(
    (a, b) =>
      sign * keyOf(a).localeCompare(keyOf(b)) ||
      (a.name ?? "").localeCompare(b.name ?? "") ||
      a.id - b.id,
  );

  const start = query.cursor === undefined ? 0 : keyed.findIndex((u) => u.id === query.cursor) + 1;
  const pageIds = keyed.slice(start, start + query.limit).map((u) => u.id);
  const rows = await db.user.findMany({ where: { id: { in: pageIds } }, select: LIST_SELECT });
  const byId = new Map(rows.map((r) => [r.id, r] as const));
  const page = pageIds.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
  return {
    students: page.map(toListItem),
    nextCursor: start + query.limit < keyed.length ? (page[page.length - 1]?.id ?? null) : null,
    total: keyed.length,
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
      // v1's season select filtered on the season the row DISPLAYS — the
      // student's active season (06-students R35; v1 parity 2026-10-09).
      ...(query.seasonId ? [{ studentProfile: { activeSeasonId: query.seasonId } }] : []),
      // REG-82: v1's group select filtered on the group the row displays, i.e.
      // the advisory GroupStudent pointer; "none" is its "Unassigned".
      ...(query.groupId === undefined
        ? []
        : query.groupId === "none"
          ? [{ groupStudentMembership: { is: null } }]
          : [{ groupStudentMembership: { groupId: query.groupId } }]),
      // No search on the alumni list (06-students R41).
      ...(query.status === "alumni" ? [] : [searchFilter(query.q)]),
    ],
  };

  // v1's alumni list shows every alumnus at once, with no search and no
  // paging (06-students R41; v1 parity 2026-10-09): `q`, `limit` and `cursor`
  // are ignored for it.
  if (query.status === "alumni") {
    if (query.sort !== undefined && query.sort !== "name") {
      return listByRelatedSort(where, query.sort, query.dir, {
        ...query,
        cursor: undefined,
        limit: Number.MAX_SAFE_INTEGER,
      });
    }
    const rows = await db.user.findMany({
      where,
      orderBy: columnOrderBy(query),
      select: LIST_SELECT,
    });
    return { students: rows.map(toListItem), nextCursor: null, total: rows.length };
  }

  if (query.sort !== undefined && query.sort !== "name") {
    return listByRelatedSort(where, query.sort, query.dir, query);
  }
  const orderBy = columnOrderBy(query);

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

/**
 * Which of a student's enrolments a caller may read attendance and submissions
 * for (REG-83). v1 showed any staff viewer who passed canViewStudent the
 * student's whole record across EVERY enrolled season (06-students R73/R77,
 * `students-query.ts:323-385`; v1 parity 2026-10-09), so every staff role
 * reads every season here. The caller has already passed canViewStudent. A
 * STUDENT has no such surface, themselves included.
 */
function canReadEnrollmentHistory(user: SessionUser): boolean {
  return user.role !== "STUDENT";
}

/** The season ids of this student's enrolments the caller may read history for. */
async function readableSeasonIds(user: SessionUser, studentUserId: number): Promise<number[]> {
  if (!canReadEnrollmentHistory(user)) return [];
  const enrollments = await db.seasonEnrollment.findMany({
    where: { studentUserId },
    select: { seasonId: true },
  });
  return enrollments.map((e) => e.seasonId);
}

/**
 * Per-enrolment attendance % in two queries (v1 ran two per enrolment, R76).
 * v1's formula (students-query.ts:346-358; 06-students R74): PRESENT + LATE
 * over every started session of the season — no enrolment-date cut (that cut
 * belongs to the engagement score only, Plan 12 ledger row 13). The numerator
 * counts only those same started sessions, so it cannot exceed 100% (C5).
 */
async function attendancePctByEnrollment(
  studentUserId: number,
  enrollments: { id: number; seasonId: number }[],
): Promise<Map<number, number>> {
  const result = new Map<number, number>();
  if (enrollments.length === 0) return result;

  const sessions = await db.session.findMany({
    where: { seasonId: { in: enrollments.map((e) => e.seasonId) }, startsAt: { lte: new Date() } },
    select: { id: true, seasonId: true },
  });
  const present = new Set(
    (
      await db.attendance.findMany({
        where: {
          studentUserId,
          sessionId: { in: sessions.map((x) => x.id) },
          status: { in: ["PRESENT", "LATE"] },
        },
        select: { sessionId: true },
      })
    ).map((a) => a.sessionId),
  );

  for (const e of enrollments) {
    const eligible = sessions.filter((x) => x.seasonId === e.seasonId);
    const attended = eligible.filter((x) => present.has(x.id)).length;
    result.set(e.id, eligible.length > 0 ? Math.round((attended / eligible.length) * 100) : 0);
  }
  return result;
}

const HISTORY_LIMIT = 100; // v1's `take: 100` on both lists

/** `GET /students/:id/attendance` — newest sessions first, across readable seasons. */
export async function loadStudentAttendanceHistory(
  user: SessionUser,
  studentUserId: number,
): Promise<StudentAttendanceHistoryItem[]> {
  const seasonIds = await readableSeasonIds(user, studentUserId);
  if (seasonIds.length === 0) return [];
  const rows = await db.attendance.findMany({
    where: { studentUserId, session: { seasonId: { in: seasonIds } } },
    orderBy: [{ session: { startsAt: "desc" } }, { id: "desc" }],
    take: HISTORY_LIMIT,
    select: {
      status: true,
      session: {
        select: {
          id: true,
          title: true,
          startsAt: true,
          seasonId: true,
          season: { select: { title: true } },
        },
      },
    },
  });
  return rows.map((a) => ({
    sessionId: a.session.id,
    sessionTitle: a.session.title,
    startsAt: a.session.startsAt.toISOString(),
    seasonId: a.session.seasonId,
    seasonTitle: a.session.season.title,
    status: a.status,
  }));
}

/**
 * `GET /students/:id/submissions` — newest first across every enrolled season,
 * DRAFT rows included, as v1's student record listed them (06-students R77,
 * `students-query.ts:361-385`; v1 parity 2026-10-09). Only explicitly saved
 * drafts exist in v2 (view-created drafts are gone, 08 R58).
 */
export async function loadStudentSubmissions(
  user: SessionUser,
  studentUserId: number,
): Promise<StudentSubmissionItem[]> {
  const seasonIds = await readableSeasonIds(user, studentUserId);
  if (seasonIds.length === 0) return [];
  const rows = await db.submission.findMany({
    where: {
      studentUserId,
      assignment: { seasonId: { in: seasonIds }, deletedAt: null },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: HISTORY_LIMIT,
    select: {
      publicId: true,
      status: true,
      submittedAt: true,
      reviewedAt: true,
      assignment: {
        select: {
          id: true,
          title: true,
          dueAt: true,
          seasonId: true,
          season: { select: { title: true } },
        },
      },
    },
  });
  return rows.map((r) => ({
    publicId: r.publicId,
    assignmentId: r.assignment.id,
    assignmentTitle: r.assignment.title,
    status: r.status,
    isLate: isLate(r.submittedAt, r.assignment.dueAt),
    submittedAt: r.submittedAt?.toISOString() ?? null,
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    seasonId: r.assignment.seasonId,
    seasonTitle: r.assignment.season.title,
  }));
}

/**
 * `GET /students/:id/documents` — v1's read-only list (06-students R80):
 * name, size, MIME type, upload time, newest first. Never the storage path.
 */
export async function loadStudentDocuments(studentUserId: number): Promise<StudentDocumentItem[]> {
  const rows = await db.studentDocument.findMany({
    where: { studentUserId },
    orderBy: [{ uploadedAt: "desc" }, { id: "desc" }],
    select: { id: true, originalName: true, sizeBytes: true, mimeType: true, uploadedAt: true },
  });
  return rows.map((d) => ({
    id: d.id,
    originalName: d.originalName,
    sizeBytes: d.sizeBytes,
    mimeType: d.mimeType,
    uploadedAt: d.uploadedAt.toISOString(),
  }));
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
  _user: SessionUser,
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
      groupStudentMembership: { select: { group: { select: { id: true, name: true } } } },
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

  // Every admitted role sees every enrolment row, as v1's leader detail did
  // (06-students R71, `leader/students/[id]/page.tsx:35-42`; v1 parity
  // 2026-10-09).
  const scoped = enrollments;

  // v1 (students-query.ts:346-358,452; 06-students R74): every season row
  // the viewer sees carries its attendance %, the subject's own view included.
  const pctByEnrollment = await attendancePctByEnrollment(studentUserId, scoped);

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

  return { ...base, profile: { ...privateProfile, notes: internalNotes } };
}

export interface NewStudentInput {
  name: string;
  email: string;
  university: string | null;
  year: string | null;
  phone: string | null;
  dateOfBirth: Date | null;
  spiritualBackground: string | null;
  gifts: string | null;
  notes: string | null;
}

export type StudentCreateTarget =
  | { kind: "season"; seasonId: number }
  | { kind: "alumni"; graduationYear: number }
  | { kind: "none" };

/**
 * The ONE write path that creates students. `POST /api/v1/students` and the
 * bulk importer both call it, so a form-created student and an imported
 * student are the same kind of account (decision D-16.8).
 *
 * v1 has two paths that disagree: `createStudentAction` sets a temporary
 * password (`jpc-space/src/lib/student-actions.ts:59`, the hard-coded
 * `ChangeMe123!`) while `commitStudentImport` writes `passwordHash: null`
 * (`student-import.ts:260`) — the spec records this at R46 as "the two paths
 * produce differently-initialised accounts". v2 has one path and it issues no
 * credential of any kind. There is no shared default password in this
 * codebase; credentials arrive when an invite is accepted (Plan 9), and that
 * is the only place a hash is ever written — with bcryptjs. Nothing here
 * hashes anything, and nothing here may ever log one.
 *
 * `role` is forced, never taken from input: no importer and no form can
 * create anything but a STUDENT (spec R47).
 *
 * THREE STATEMENTS FOR THE WHOLE BATCH — createManyAndReturn, then one
 * createMany for profiles and one for enrolments. v1 issued two or three
 * statements per row, each in its own transaction (R45/R46), which is why its
 * commit could not be atomic. This shape is what makes D-16.5's
 * all-or-nothing 2000-row import affordable inside one transaction.
 *
 * The caller is responsible for having de-duplicated `inputs` by email: a
 * batch containing the same address twice violates `User.email @unique` and
 * takes the whole transaction down.
 */
export async function createStudentRows(
  tx: Prisma.TransactionClient,
  inputs: NewStudentInput[],
  target: StudentCreateTarget,
): Promise<{ id: number; email: string }[]> {
  if (inputs.length === 0) return [];

  const created = await tx.user.createManyAndReturn({
    data: inputs.map((i) => ({
      name: i.name,
      // Stored EXACTLY as given. Comparison is case-insensitive (D-16.6);
      // storage is not, because v1's login looks the address up verbatim.
      email: i.email,
      role: "STUDENT" as const,
      graduationYear: target.kind === "alumni" ? target.graduationYear : null,
      passwordHash: null,
    })),
    select: { id: true, email: true },
  });

  // Map back by email rather than by array position: createManyAndReturn's
  // ordering is not part of its contract, and a silent misalignment here
  // would attach one student's pastoral notes to another student's account.
  const idByEmail = new Map(created.map((c) => [c.email.toLowerCase(), c.id]));
  const idFor = (email: string): number => {
    const id = idByEmail.get(email.toLowerCase());
    if (id === undefined) {
      // Unreachable unless the insert silently dropped a row; failing here
      // aborts the transaction, which is the correct outcome.
      throw new Error("createStudentRows: no created row for an input email");
    }
    return id;
  };

  await tx.studentProfile.createMany({
    data: inputs.map((i) => ({
      userId: idFor(i.email),
      // The pointer and the enrolment below name the same season by
      // construction — the two definitions of "in this season" cannot drift.
      activeSeasonId: target.kind === "season" ? target.seasonId : null,
      university: i.university,
      year: i.year,
      phone: i.phone,
      dateOfBirth: i.dateOfBirth,
      spiritualBackground: i.spiritualBackground,
      gifts: i.gifts,
      notes: i.notes,
    })),
  });

  if (target.kind === "season") {
    await tx.seasonEnrollment.createMany({
      data: inputs.map((i) => ({
        studentUserId: idFor(i.email),
        seasonId: target.seasonId,
        status: "ACTIVE" as const,
      })),
    });
  }

  return created;
}

/**
 * Enrol one student in one season — Plan 7's `POST /students/:id/enrollments`
 * rules, in the one place both that route and the bulk importer call
 * (D-16.7/D-16.8; spec 06 D1/R2):
 *
 *  - one enrolment per student per season, EVER: an existing row of any
 *    status is "already_enrolled" and is not touched (a WITHDRAWN row is
 *    history, not an obstacle — re-admission is not invented here);
 *  - entry is always ACTIVE (R47);
 *  - the profile pointer is set only when UNSET — never stolen from a season
 *    that already holds it. updateMany so a student with no profile row is a
 *    no-op rather than a throw, exactly as Plan 7's guarded update behaved.
 *
 * A concurrent caller can still lose the unique-index race (P2002); the
 * caller's existing P2002 handling answers it (409 already_enrolled on the
 * route, 409 import_conflict on the importer, whose transaction rolls back).
 */
export async function enrollStudentInSeason(
  tx: Prisma.TransactionClient,
  studentUserId: number,
  seasonId: number,
): Promise<"enrolled" | "already_enrolled"> {
  const existing = await tx.seasonEnrollment.findUnique({
    where: { studentUserId_seasonId: { studentUserId, seasonId } },
    select: { id: true },
  });
  if (existing) return "already_enrolled";

  await tx.seasonEnrollment.create({
    data: { studentUserId, seasonId, status: "ACTIVE" },
  });
  await tx.studentProfile.updateMany({
    where: { userId: studentUserId, activeSeasonId: null },
    data: { activeSeasonId: seasonId },
  });
  return "enrolled";
}
