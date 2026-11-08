import { db } from "../../../db/client";
import type { SubmissionStatus } from "../../../generated/prisma/enums";
import { orgDayKey, orgWallTime } from "../../org-time";
import { isOverdue } from "./rules";

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
  forumPostToRead: boolean;
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
      forumPostToRead: true,
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
    forumPostToRead: a.forumPostToRead,
    maxFileSizeMb: a.maxFileSizeMb,
    allowedMimeCategories: a.allowedMimeCategories,
    groupIds: a.targets.map((t) => t.groupId),
  };
}

export interface MySubmissionData {
  publicId: string;
  status: SubmissionStatus;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  feedback: string | null;
  isLate: boolean;
}

/**
 * The detail response, built in one place for GET, POST and PATCH so the three
 * cannot drift. Everything derived is derived here, server-side (ruling C4):
 * `isOverdue`, and the organisation-clock day/time of the deadline that every
 * screen labels with and the edit form pre-fills from (C2/X13). Students get
 * `groupIds: null` (ruling C8 — narrow the payload, not just the access).
 */
export function assignmentDetailPayload(
  detail: AssignmentDetailData,
  opts: {
    isStudent: boolean;
    canManage: boolean;
    mySubmission: MySubmissionData | null;
    /** A student whose place in the season has ended: they read, they cannot write. */
    readOnly?: boolean;
  },
) {
  return {
    ...detail,
    groupIds: opts.isStudent ? null : detail.groupIds,
    isOverdue: isOverdue(detail.dueAt, new Date()),
    dueOrgDay: detail.dueAt ? orgDayKey(detail.dueAt) : null,
    dueOrgTime: detail.dueAt ? orgWallTime(detail.dueAt) : null,
    mySubmission: opts.mySubmission,
    canManage: opts.canManage,
    readOnly: opts.readOnly ?? false,
  };
}
