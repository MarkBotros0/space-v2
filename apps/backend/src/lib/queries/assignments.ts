import { db } from "../../db/client";
import type { SubmissionStatus } from "../../generated/prisma/enums";

export interface AssignmentListRow {
  id: number;
  title: string;
  dueAt: Date | null;
  isAllGroups: boolean;
  submissionCount: number;
  expectedCount: number;
  seasonCode: string;
}

export async function listAssignmentsForSeason(seasonId: number): Promise<AssignmentListRow[]> {
  const rows = await db.assignment.findMany({
    where: { seasonId, deletedAt: null },
    orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      dueAt: true,
      isAllGroups: true,
      _count: { select: { submissions: { where: { status: { not: "DRAFT" } } } } },
      targets: { select: { groupId: true } },
      season: { select: { code: true, id: true } },
    },
  });

  // Expected count: students in targeted groups (or all season-enrolled if isAllGroups).
  return Promise.all(
    rows.map(async (a) => {
      const expected = a.isAllGroups
        ? await db.seasonEnrollment.count({
            where: { seasonId: a.season.id, status: "ACTIVE" },
          })
        : await db.groupStudent.count({
            where: { groupId: { in: a.targets.map((t) => t.groupId) } },
          });
      return {
        id: a.id,
        title: a.title,
        dueAt: a.dueAt,
        isAllGroups: a.isAllGroups,
        submissionCount: a._count.submissions,
        expectedCount: expected,
        seasonCode: a.season.code,
      };
    }),
  );
}

export interface AssignmentDetailData {
  id: number;
  seasonId: number;
  seasonCode: string;
  seasonTitle: string;
  sessionId: number | null;
  sessionTitle: string | null;
  title: string;
  description: string | null;
  dueAt: Date | null;
  isAllGroups: boolean;
  type: "STANDARD" | "FORUM";
  forumMinWords: number | null;
  forumAllowComments: boolean;
  maxFileSizeMb: number | null;
  allowedMimeCategories: string[];
  groupIds: number[];
}

/** Returns null when the assignment does not exist or is soft-deleted. */
export async function loadAssignmentById(id: number): Promise<AssignmentDetailData | null> {
  const a = await db.assignment.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      seasonId: true,
      season: { select: { code: true, title: true } },
      sessionId: true,
      session: { select: { title: true } },
      title: true,
      description: true,
      dueAt: true,
      isAllGroups: true,
      type: true,
      forumMinWords: true,
      forumAllowComments: true,
      maxFileSizeMb: true,
      allowedMimeCategories: true,
      targets: { select: { groupId: true } },
    },
  });
  if (!a) return null;
  return {
    id: a.id,
    seasonId: a.seasonId,
    seasonCode: a.season.code,
    seasonTitle: a.season.title,
    sessionId: a.sessionId,
    sessionTitle: a.session?.title ?? null,
    title: a.title,
    description: a.description,
    dueAt: a.dueAt,
    isAllGroups: a.isAllGroups,
    type: a.type,
    forumMinWords: a.forumMinWords,
    forumAllowComments: a.forumAllowComments,
    maxFileSizeMb: a.maxFileSizeMb,
    allowedMimeCategories: a.allowedMimeCategories,
    groupIds: a.targets.map((t) => t.groupId),
  };
}

export interface StudentAssignmentRow {
  id: number;
  title: string;
  dueAt: Date | null;
  status: SubmissionStatus | "PENDING";
  reviewedAt: Date | null;
}

export async function listAssignmentsForStudent(
  studentUserId: number,
  seasonId: number | null,
): Promise<StudentAssignmentRow[]> {
  if (!seasonId) return [];

  const groupMembership = await db.groupStudent.findUnique({
    where: { studentUserId },
    select: { groupId: true },
  });

  const assignments = await db.assignment.findMany({
    where: {
      seasonId,
      deletedAt: null,
      OR: [
        { isAllGroups: true },
        ...(groupMembership ? [{ targets: { some: { groupId: groupMembership.groupId } } }] : []),
      ],
    },
    orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      dueAt: true,
      submissions: {
        where: { studentUserId },
        select: { status: true, reviewedAt: true },
      },
    },
  });

  return assignments.map((a) => {
    const sub = a.submissions[0];
    return {
      id: a.id,
      title: a.title,
      dueAt: a.dueAt,
      status: sub?.status ?? "PENDING",
      reviewedAt: sub?.reviewedAt ?? null,
    };
  });
}
