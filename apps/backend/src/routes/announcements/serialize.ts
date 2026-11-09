import type {
  AnnouncementDetail,
  AnnouncementPoll,
  AnnouncementListItem,
} from "../../../../../packages/shared/src/index";
import { ANNOUNCEMENT_EXCERPT_LENGTH } from "../../../../../packages/shared/src/index";
import { isPollClosed, type AnnouncementFlags } from "../../lib/permissions";

export const ANNOUNCEMENT_SELECT = {
  id: true,
  audience: true,
  seasonId: true,
  body: true,
  authorId: true,
  createdAt: true,
  editedAt: true,
  season: { select: { title: true, status: true } },
  author: { select: { name: true, deletedAt: true } },
  poll: { select: { closedAt: true } },
} as const;

export interface AnnouncementRow {
  id: number;
  audience: "COMMUNITY" | "SEASON";
  seasonId: number | null;
  body: string;
  authorId: number | null;
  createdAt: Date;
  editedAt: Date | null;
  season: { title: string; status: string } | null;
  author: { name: string; deletedAt: Date | null } | null;
  poll: { closedAt: Date | null } | null;
}

/** Cut by code point, so an emoji (a surrogate pair) is never split at the limit. */
function excerptOf(body: string): string {
  const chars = Array.from(body.trim());
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
