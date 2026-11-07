import type {
  AnnouncementDetail,
  AnnouncementListItem,
} from "../../../../../packages/shared/src/index";
import { ANNOUNCEMENT_EXCERPT_LENGTH } from "../../../../../packages/shared/src/index";
import type { AnnouncementFlags } from "../../lib/permissions";

export const ANNOUNCEMENT_SELECT = {
  id: true,
  audience: true,
  seasonId: true,
  title: true,
  body: true,
  authorId: true,
  createdAt: true,
  editedAt: true,
  season: { select: { title: true, status: true } },
  author: { select: { name: true } },
} as const;

export interface AnnouncementRow {
  id: number;
  audience: "COMMUNITY" | "SEASON";
  seasonId: number | null;
  title: string;
  body: string;
  authorId: number | null;
  createdAt: Date;
  editedAt: Date | null;
  season: { title: string; status: string } | null;
  author: { name: string } | null;
}

function excerptOf(body: string): string {
  const text = body.trim();
  return text.length <= ANNOUNCEMENT_EXCERPT_LENGTH
    ? text
    : `${text.slice(0, ANNOUNCEMENT_EXCERPT_LENGTH - 1).trimEnd()}…`;
}

function common(row: AnnouncementRow, isRead: boolean) {
  return {
    id: row.id,
    audience: row.audience,
    seasonId: row.seasonId,
    seasonTitle: row.season?.title ?? null,
    title: row.title,
    authorName: row.author?.name ?? null,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt ? row.editedAt.toISOString() : null,
    isRead,
  };
}

export function toListItem(row: AnnouncementRow, isRead: boolean): AnnouncementListItem {
  return { ...common(row, isRead), excerpt: excerptOf(row.body) };
}

export function toDetail(
  row: AnnouncementRow,
  isRead: boolean,
  flags: AnnouncementFlags,
): AnnouncementDetail {
  return { ...common(row, isRead), body: row.body, ...flags };
}
