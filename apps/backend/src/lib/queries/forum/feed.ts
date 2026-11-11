import { countWords, htmlToPlainText } from "../../../../../../packages/shared/src/index";
import { db } from "../../../db/client";
import type { SubmissionStatus } from "../../../generated/prisma/client";
import type { SessionUser } from "../../auth/tokens";
import { canDeleteLoadedComment, commentDeleteCtx, type ForumAudience } from "../../permissions";
import { seasonParticipant } from "../season-participants";
import { displayNameFor, ownForumWork, type ForumPartRow } from "./shared";
import { FORUM_COMMENT_SELECT, toForumComment, type ForumCommentData } from "./comments";

interface ForumPostData {
  publicId: string;
  studentUserId: number;
  authorDisplayName: string;
  text: string;
  submittedAt: Date | null;
  commentCount: number;
  comments: ForumCommentData[];
  canComment: boolean;
}

interface ForumOwnData {
  publicId: string | null;
  text: string;
  status: SubmissionStatus;
  wordCount: number;
  posted: boolean;
}

interface ForumViewData {
  assignmentId: number;
  partId: number;
  prompt: string;
  dueAt: Date | null;
  own: ForumOwnData | null;
  locked: boolean;
  minWords: number | null;
  allowComments: boolean;
  groupId: number | null;
  posts: ForumPostData[];
  nextCursor: string | null;
}

const NOT_POSTED: ForumOwnData = { publicId: null, text: "", status: "DRAFT", wordCount: 0, posted: false };

/** The student's own post on this part, or the empty compose state. */
async function ownPost(partId: number, studentUserId: number): Promise<ForumOwnData> {
  const row = await ownForumWork(partId, studentUserId);
  if (row === null) return NOT_POSTED;
  const plain = htmlToPlainText(row.text ?? "");
  return {
    publicId: row.publicId,
    text: plain,
    status: row.status,
    wordCount: countWords(plain),
    posted: row.status !== "DRAFT",
  };
}

/** The forum view of one FORUM part (the route has loaded it, so it exists). */
export async function loadForumView(
  part: ForumPartRow,
  user: SessionUser,
  audience: ForumAudience,
  query: { cursor?: string; limit: number },
): Promise<ForumViewData> {
  const own = audience.kind === "student" ? await ownPost(part.id, user.userId) : null;

  const base = {
    assignmentId: part.assignmentId,
    partId: part.id,
    prompt: part.prompt,
    dueAt: part.dueAt,
    own,
    minWords: part.minWords,
    allowComments: part.allowComments,
    groupId: audience.kind === "student" ? audience.groupId : null,
  };

  // Only a forum set to "post before reading others" holds a student back.
  const locked = audience.kind === "student" && part.postToRead && !(own?.posted ?? false);
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
      seasonId: part.seasonId,
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
    const c = await db.assignmentPartWork.findFirst({
      where: { publicId: query.cursor, partId: part.id },
      select: { id: true },
    });
    cursorId = c?.id ?? null;
  }

  const rows = await db.assignmentPartWork.findMany({
    where: {
      partId: part.id,
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
    part.allowComments &&
    (audience.kind === "student" ? !part.postToRead || (own?.posted ?? false) : user.role !== "MENTOR");

  const posts: ForumPostData[] = await Promise.all(
    page.map(async (p) => {
      // One context per post: every comment under it shares the season and the post's author (BE-071).
      const ctx = await commentDeleteCtx(user, part.seasonId, p.studentUserId);
      return {
        publicId: p.publicId,
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
