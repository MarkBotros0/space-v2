import type { AuthoredNote, NoteListQuery, NoteSummary } from "@space/shared";
// A VALUE import, so relative — five levels up from src/lib/queries/ (ruling
// X12; the rootDir emit trap in CLAUDE.md). `import type` above is erased.
import { htmlToPlainText } from "../../../../../packages/shared/src/index";

import { db } from "../../db/client";
import type { SessionUser } from "../auth/tokens";
import { noteVisibilityWhere } from "../permissions";

/**
 * The row shape both list functions select. Kept in one place so the two
 * projections cannot drift into disagreeing about which columns travel.
 */
const NOTE_SELECT = {
  id: true,
  body: true,
  visibility: true,
  followUpFlagged: true,
  createdAt: true,
  updatedAt: true,
  authorUserId: true,
  seasonId: true,
  authorUser: { select: { name: true, role: true } },
  season: { select: { title: true } },
} as const;

type NoteRow = {
  id: number;
  body: string;
  visibility: "LEADERS" | "MENTORS" | "ADMINS";
  followUpFlagged: boolean;
  createdAt: Date;
  updatedAt: Date;
  authorUserId: number;
  seasonId: number | null;
  authorUser: { name: string; role: "SUPER" | "ADMIN" | "LEADER" | "STUDENT" | "MENTOR" };
  season: { title: string } | null;
};

/**
 * `@updatedAt` fires on create as well as update, so the two timestamps are
 * within a few milliseconds of each other on an unedited row. A second of
 * tolerance separates "written" from "amended" without a new column (C1).
 * v1 wrote updatedAt and never read it (R24, R26); D4 #3 says surface it.
 */
function wasEdited(row: { createdAt: Date; updatedAt: Date }): boolean {
  return row.updatedAt.getTime() - row.createdAt.getTime() > 1000;
}

export function toNoteSummary(row: NoteRow, user: SessionUser): NoteSummary {
  return {
    id: row.id,
    // Plain text on the wire, always. The stored column holds v1's TipTap HTML
    // for every pre-migration row (ruling C11 — sanitise on read for what is
    // already stored).
    body: htmlToPlainText(row.body),
    visibility: row.visibility,
    followUpFlagged: row.followUpFlagged,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    edited: wasEdited(row),
    authorId: row.authorUserId,
    authorName: row.authorUser.name,
    authorRole: row.authorUser.role,
    seasonId: row.seasonId,
    seasonTitle: row.season?.title ?? null,
    // Server-derived (ruling C4): the client must not compare author ids to
    // decide whether to render an edit control.
    canEdit: row.authorUserId === user.userId,
  };
}

export interface NotePage<T> {
  notes: T[];
  nextCursor: string | null;
}

function cursorClause(cursor: string | undefined): { cursor?: { id: number }; skip?: number } {
  const id = Number(cursor);
  return cursor !== undefined && Number.isInteger(id) && id > 0
    ? { cursor: { id }, skip: 1 }
    : {};
}

/**
 * Notes about one student, narrowed to what THIS viewer may read.
 *
 * There is deliberately no variant of this function without a `user`. That is
 * the whole lesson of spec D5: the unfiltered variant is what every future
 * caller forgets to wrap.
 *
 * Returns null when the caller may read no notes at all — the route must turn
 * that into a 403, not an empty page.
 */
export async function listNotesForStudent(
  user: SessionUser,
  studentUserId: number,
  query: NoteListQuery,
): Promise<NotePage<NoteSummary> | null> {
  const scope = noteVisibilityWhere(user);
  if (scope === null) return null;

  const rows = await db.engagementNote.findMany({
    where: { AND: [{ studentUserId }, scope] },
    // createdAt is the domain's ordering key (R39) and the head of the
    // [studentUserId, createdAt] index; id breaks ties so the cursor is stable.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
    ...cursorClause(query.cursor),
    select: NOTE_SELECT,
  });

  const page = rows.slice(0, query.limit);
  return {
    notes: page.map((r) => toNoteSummary(r, user)),
    nextCursor: rows.length > query.limit ? String(page[page.length - 1]?.id ?? "") || null : null,
  };
}

/**
 * Notes THIS caller wrote, across students.
 *
 * v1 offered this to MENTOR only (R44) even though four roles can author. The
 * author-equality narrowing is the whole protection here — R33 makes the
 * visibility filter a no-op over one's own notes — so it is a `where` clause,
 * not a post-filter.
 */
export async function listAuthoredNotes(
  user: SessionUser,
  query: NoteListQuery,
): Promise<NotePage<AuthoredNote>> {
  const rows = await db.engagementNote.findMany({
    where: {
      authorUserId: user.userId,
      ...(query.studentId ? { studentUserId: query.studentId } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
    ...cursorClause(query.cursor),
    select: {
      ...NOTE_SELECT,
      studentUserId: true,
      studentUser: { select: { name: true, email: true } },
    },
  });

  const page = rows.slice(0, query.limit);
  return {
    notes: page.map((r) => ({
      ...toNoteSummary(r, user),
      student: { id: r.studentUserId, name: r.studentUser.name, email: r.studentUser.email },
    })),
    nextCursor: rows.length > query.limit ? String(page[page.length - 1]?.id ?? "") || null : null,
  };
}
