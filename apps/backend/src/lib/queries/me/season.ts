import { db } from "../../../db/client";
import type { SeasonStatus } from "../../../generated/prisma/enums";
import type { SessionUser } from "../../auth/tokens";
import { orgDayKey } from "../../org-time";
import { loadSeasonProgress } from "../sessions";

/*
 * The student's own reads. Every function takes the SessionUser and reads
 * `user.userId` — the subject is the token's, never a parameter (spec 02 D13:
 * v1's loadSeasonHistory took any studentUserId and was safe only because
 * both call sites happened to pass their own).
 */

// ---------------------------------------------------------------------------
// Current season — v1 app/student/season/page.tsx:40-89
// ---------------------------------------------------------------------------

const UPCOMING_LIMIT = 3;

export interface MySeason {
  id: number;
  code: string;
  title: string;
  description: string | null;
  status: SeasonStatus;
  startDate: Date;
  endDate: Date;
  progress: { completedSessions: number; totalSessions: number; pct: number };
  group: {
    id: number;
    name: string;
    description: string | null;
    leaders: { id: number; name: string; email: string }[];
    members: { id: number; name: string; isYou: boolean }[];
  } | null;
  upcoming: { id: number; title: string; startsAt: Date; dayKey: string; location: string | null }[];
}

export async function loadMySeason(user: SessionUser, now: Date = new Date()): Promise<MySeason | null> {
  const seasonId = user.activeSeasonId;
  if (seasonId === null) return null; // R28

  const season = await db.season.findFirst({
    // Spec 02 D2: v1 R27 showed a soft-deleted season to its students.
    where: { id: seasonId, deletedAt: null },
    select: { id: true, code: true, title: true, description: true, status: true, startDate: true, endDate: true },
  });
  if (!season) return null;

  const [enrollment, upcoming, progress] = await Promise.all([
    // Ruling C9: the group for THIS season comes from the enrollment. v1 read
    // GroupStudent with no season filter (R31/R88) and could show last
    // season's group beside this season's progress.
    db.seasonEnrollment.findUnique({
      where: { studentUserId_seasonId: { studentUserId: user.userId, seasonId } },
      select: {
        group: {
          select: {
            id: true,
            name: true,
            description: true,
            leaders: {
              orderBy: { user: { name: "asc" } },
              select: { user: { select: { id: true, name: true, email: true } } },
            },
          },
        },
      },
    }),
    db.session.findMany({
      where: { seasonId, startsAt: { gte: now } }, // R30
      orderBy: { startsAt: "asc" },
      take: UPCOMING_LIMIT,
      select: { id: true, title: true, startsAt: true, location: true },
    }),
    loadSeasonProgress(seasonId, now),
  ]);

  const group = enrollment?.group ?? null;
  // Members = ACTIVE enrollments in this group for this season — the same rule
  // groupListItemSchema.studentCount uses (C9), so the two never disagree.
  const members = group
    ? await db.seasonEnrollment.findMany({
        where: { seasonId, groupId: group.id, status: "ACTIVE", studentUser: { deletedAt: null } },
        orderBy: { studentUser: { name: "asc" } },
        select: { studentUser: { select: { id: true, name: true } } },
      })
    : [];

  return {
    ...season,
    // Plan 11's contract keeps its names and its 0 for an empty season; the
    // count itself is the shared definition (spec 19 §7).
    progress: {
      completedSessions: progress.sessionsHeld,
      totalSessions: progress.sessionsTotal,
      pct: progress.pct ?? 0,
    },
    group: group
      ? {
          id: group.id,
          name: group.name,
          description: group.description,
          leaders: group.leaders.map((l) => l.user),
          // R89: peers by name only — never an email.
          members: members.map((m) => ({
            id: m.studentUser.id,
            name: m.studentUser.name,
            isYou: m.studentUser.id === user.userId,
          })),
        }
      : null,
    upcoming: upcoming.map((s) => ({ ...s, dayKey: orgDayKey(s.startsAt) })),
  };
}
