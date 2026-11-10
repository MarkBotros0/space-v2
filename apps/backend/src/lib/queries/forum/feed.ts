import { countWords, htmlToPlainText } from "../../../../../../packages/shared/src/index";
import { db } from "../../../db/client";
import type { SubmissionStatus } from "../../../generated/prisma/client";
import type { SessionUser } from "../../auth/tokens";
import { canDeleteLoadedComment, commentDeleteCtx, type ForumAudience } from "../../permissions";
import { seasonParticipant } from "../season-participants";
import { displayNameFor, loadForumAssignment } from "./shared";
import { FORUM_COMMENT_SELECT, toForumComment, type ForumCommentData } from "./comments";

interface ForumPostData {
  submissionPublicId: string;
  studentUserId: number;
  authorDisplayName: string;
  text: string;
  submittedAt: Date | null;
  commentCount: number;
  comments: ForumCommentData[];
  canComment: boolean;
}

interface ForumOwnData {
  submissionPublicId: string | null;
  text: string;
  status: SubmissionStatus;
  wordCount: number;
  posted: boolean;
  feedback: string | null;
  reviewedAt: Date | null;
}

interface ForumViewData {
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

  // Only a forum set to "post before reading others" holds a student back.
  const locked = audience.kind === "student" && assignment.forumPostToRead && !(own?.posted ?? false);
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
      // A student only reaches this while live (forumAudienceFor), so in a
      // finished season this is staff reading the posts.
      ...seasonParticipant,
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
        select: FORUM_COMMENT_SELECT,
      },
    },
  });

  const page = rows.slice(0, query.limit);
  const canComment =
    assignment.forumAllowComments &&
    (audience.kind === "student" ? !assignment.forumPostToRead || (own?.posted ?? false) : user.role !== "MENTOR");

  const posts: ForumPostData[] = await Promise.all(
    page.map(async (p) => {
      // One context per post: every comment under it shares the season and the post's author (BE-071).
      const ctx = await commentDeleteCtx(user, assignment.seasonId, p.studentUserId);
      return {
        submissionPublicId: p.publicId,
        studentUserId: p.studentUserId,
        authorDisplayName: displayNameFor(p.studentUser.name),
        text: htmlToPlainText(p.text ?? ""),
        submittedAt: p.submittedAt,
        commentCount: p._count.forumComments,
        // The gate's own rule, not a client-side lookalike (R52).
        comments: p.forumComments.map((c) => toForumComment(c, canDeleteLoadedComment(user, c, ctx))),
        canComment,
      };
    }),
  );

  return {
    ...base,
    locked: false,
    posts,
    nextCursor: rows.length > query.limit ? (page[page.length - 1]?.publicId ?? null) : null,
  };
}
