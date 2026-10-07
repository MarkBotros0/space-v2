import {
  countWords,
  htmlToPlainText,
} from "../../../../../packages/shared/src/index";
import { db } from "../../db/client";
import type { SubmissionStatus } from "../../generated/prisma/client";
import type { SessionUser } from "../auth/tokens";
import { canDeleteForumComment, type ForumAudience } from "../permissions";

/**
 * The one place a forum author's name is produced.
 *
 * v1 falls back to the author's email address when `name` is blank (spec 14
 * R30), so every student in a group sees the address of any group-mate who has
 * not set a name. These are young people's addresses, and `email` is not
 * selected anywhere in this module precisely so the fallback cannot come back.
 */
export function displayNameFor(name: string | null): string {
  const trimmed = name?.trim();
  return trimmed ? trimmed : "Group member";
}

export interface ForumAssignmentRow {
  id: number;
  seasonId: number;
  dueAt: Date | null;
  forumMinWords: number | null;
  forumAllowComments: boolean;
}

/**
 * The one existence check for the forum surface. `type: "FORUM"` in the where
 * is what makes every forum endpoint refuse a standard assignment (404) rather
 * than serve an empty thread — and because routes call this before
 * `forumAudienceFor`, the answer is 404 for every caller, never a 403 that
 * depends on who is asking.
 */
export async function loadForumAssignment(
  assignmentId: number,
): Promise<ForumAssignmentRow | null> {
  return db.assignment.findFirst({
    where: { id: assignmentId, deletedAt: null, type: "FORUM" },
    select: { id: true, seasonId: true, dueAt: true, forumMinWords: true, forumAllowComments: true },
  });
}

export interface ForumCommentData {
  id: number;
  authorUserId: number;
  authorDisplayName: string;
  body: string;
  createdAt: Date;
  canDelete: boolean;
}

export interface ForumPostData {
  submissionPublicId: string;
  studentUserId: number;
  authorDisplayName: string;
  text: string;
  submittedAt: Date | null;
  commentCount: number;
  comments: ForumCommentData[];
  canComment: boolean;
}

export interface ForumOwnData {
  submissionPublicId: string | null;
  text: string;
  status: SubmissionStatus;
  wordCount: number;
  posted: boolean;
  feedback: string | null;
  reviewedAt: Date | null;
}

export interface ForumViewData {
  assignmentId: number;
  dueAt: Date | null;
  own: ForumOwnData | null;
  locked: boolean;
  minWords: number | null;
  allowComments: boolean;
  groupId: number | null;
  posts: ForumPostData[];
  nextCursor: string | null;
}

export async function loadForumView(
  assignmentId: number,
  user: SessionUser,
  audience: ForumAudience,
  query: { cursor?: string; limit: number },
): Promise<ForumViewData | null> {
  const assignment = await loadForumAssignment(assignmentId);
  if (assignment === null) return null;

  // Own response: looked up by (assignment, caller), never by a client id (R3).
  let own: ForumOwnData | null = null;
  if (audience.kind === "student") {
    const row = await db.submission.findUnique({
      where: { assignmentId_studentUserId: { assignmentId, studentUserId: user.userId } },
      select: { publicId: true, text: true, status: true, feedback: true, reviewedAt: true },
    });
    if (row === null) {
      own = {
        submissionPublicId: null,
        text: "",
        status: "DRAFT",
        wordCount: 0,
        posted: false,
        feedback: null,
        reviewedAt: null,
      };
    } else {
      const plain = htmlToPlainText(row.text ?? "");
      own = {
        submissionPublicId: row.publicId,
        text: plain,
        status: row.status,
        wordCount: countWords(plain),
        posted: row.status !== "DRAFT",
        feedback: row.feedback ? htmlToPlainText(row.feedback) : null,
        reviewedAt: row.reviewedAt,
      };
    }
  }

  const base = {
    assignmentId,
    dueAt: assignment.dueAt,
    own,
    minWords: assignment.forumMinWords,
    allowComments: assignment.forumAllowComments,
    groupId: audience.kind === "student" ? audience.groupId : null,
  };

  const locked = audience.kind === "student" && !(own?.posted ?? false);
  if (locked) return { ...base, locked: true, posts: [], nextCursor: null };

  // Peer scope — from SeasonEnrollment, not GroupStudent (ruling C9, D-14.3).
  let groupFilter: { groupId?: number | { in: number[] } };
  if (audience.kind === "student") {
    if (audience.groupId === null) return { ...base, locked: false, posts: [], nextCursor: null };
    groupFilter = { groupId: audience.groupId };
  } else if (audience.groupIds === null) {
    groupFilter = {};
  } else {
    groupFilter = { groupId: { in: audience.groupIds } };
  }
  const enrolments = await db.seasonEnrollment.findMany({
    where: {
      seasonId: assignment.seasonId,
      status: "ACTIVE",
      ...groupFilter,
      ...(audience.kind === "student" ? { studentUserId: { not: user.userId } } : {}),
    },
    select: { studentUserId: true },
  });
  const peerIds = enrolments.map((e) => e.studentUserId);

  let cursorId: number | null = null;
  if (query.cursor) {
    const c = await db.submission.findFirst({
      where: { publicId: query.cursor, assignmentId },
      select: { id: true },
    });
    cursorId = c?.id ?? null;
  }

  const rows = await db.submission.findMany({
    where: {
      assignmentId,
      studentUserId: { in: peerIds },
      // Both are the privacy rule (R23): an unposted draft is never served.
      status: { not: "DRAFT" },
      NOT: { text: null },
    },
    orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
    ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    select: {
      id: true,
      publicId: true,
      studentUserId: true,
      text: true,
      submittedAt: true,
      studentUser: { select: { name: true } },
      _count: { select: { forumComments: true } },
      forumComments: {
        orderBy: { createdAt: "asc" },
        // Three inline, the rest from the comments endpoint (R27).
        take: 3,
        select: {
          id: true,
          authorUserId: true,
          body: true,
          createdAt: true,
          authorUser: { select: { name: true } },
        },
      },
    },
  });

  const page = rows.slice(0, query.limit);
  const canComment =
    assignment.forumAllowComments &&
    (audience.kind === "student" ? (own?.posted ?? false) : user.role !== "MENTOR");

  const posts: ForumPostData[] = await Promise.all(
    page.map(async (p) => ({
      submissionPublicId: p.publicId,
      studentUserId: p.studentUserId,
      authorDisplayName: displayNameFor(p.studentUser.name),
      text: htmlToPlainText(p.text ?? ""),
      submittedAt: p.submittedAt,
      commentCount: p._count.forumComments,
      comments: await Promise.all(
        p.forumComments.map(async (c) => ({
          id: c.id,
          authorUserId: c.authorUserId,
          authorDisplayName: displayNameFor(c.authorUser.name),
          body: c.body,
          createdAt: c.createdAt,
          // The gate itself, not a client-side lookalike (R52).
          canDelete: await canDeleteForumComment(user, c.id),
        })),
      ),
      canComment,
    })),
  );

  return {
    ...base,
    locked: false,
    posts,
    nextCursor: rows.length > query.limit ? (page[page.length - 1]?.publicId ?? null) : null,
  };
}
