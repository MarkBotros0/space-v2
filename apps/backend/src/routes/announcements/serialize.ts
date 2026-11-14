import type {
  AnnouncementDetail,
  AnnouncementPoll,
  AnnouncementListItem,
} from "../../../../../packages/shared/src/index";
import { ANNOUNCEMENT_EXCERPT_LENGTH, announcementPlainText } from "../../../../../packages/shared/src/index";
import { isPollClosed, type AnnouncementFlags } from "../../lib/permissions";
import type { AnnouncementRow } from "../../lib/queries/announcements";

/** The words without formatting, cut by code point so an emoji (a surrogate pair) is never split. */
function excerptOf(body: string): string {
  const chars = Array.from(announcementPlainText(body));
  return chars.length <= ANNOUNCEMENT_EXCERPT_LENGTH
    ? chars.join("")
    : `${chars
        .slice(0, ANNOUNCEMENT_EXCERPT_LENGTH - 1)
        .join("")
        .trimEnd()}…`;
}

function common(row: AnnouncementRow, isRead: boolean) {
  return {
    id: row.id,
    audience: row.audience,
    seasonId: row.seasonId,
    seasonTitle: row.season?.title ?? null,
    // A deleted account (DELETE /me) reads as no author: the app says "Former member".
    authorName: row.author && !row.author.deletedAt ? row.author.name : null,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt ? row.editedAt.toISOString() : null,
    isRead,
  };
}

export function toListItem(row: AnnouncementRow, isRead: boolean): AnnouncementListItem {
  return {
    ...common(row, isRead),
    excerpt: excerptOf(row.body),
    hasPoll: row.poll !== null,
    pollClosed: row.poll ? isPollClosed(row, row.poll) : null,
  };
}

export function toDetail(
  row: AnnouncementRow,
  isRead: boolean,
  flags: AnnouncementFlags,
  poll: AnnouncementPoll | null,
): AnnouncementDetail {
  return {
    ...common(row, isRead),
    body: row.body,
    ...flags,
    hasPoll: row.poll !== null,
    pollClosed: row.poll ? isPollClosed(row, row.poll) : null,
    poll,
  };
}
