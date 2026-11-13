import type { SeasonStatus } from "@space/shared";

import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import { liveAssignment, liveSeason } from "../db/live";
import type { SessionUser } from "../auth/tokens";
import { isAdminOfSeason } from "../rbac";

interface SeasonDetailRow {
  id: number;
  code: string;
  title: string;
  program: string;
  /** Only for super and this season's staff; left out for everyone else. */
  requiredProgram?: string | null;
  graduatesOnPass?: boolean;
  isCommunityWide: boolean;
  year: number;
  description: string | null;
  status: SeasonStatus;
  startDate: Date;
  endDate: Date;
  absenceBudgetMinutes: number;
  absenceWeightMinutes: number;
  sessionCount: number;
  /** Live assignments and every quiz (drafts too), for the season page's tiles (owner, 2026-11-13). */
  assignmentCount: number;
  quizCount: number;
  studentCount: number;
  canAdminister: boolean;
  groups: { id: number; name: string; studentCount: number; leaderNames: string[] }[];
}

/**
 * The season detail every season screen renders. Null when no live season
 * has this id. Authorization is the CALLER's job (canAccessSeason) — this is
 * shared by GET /:id and GET /by-code/:code so the two can never drift.
 */
export async function loadSeasonDetail(user: SessionUser, id: number): Promise<SeasonDetailRow | null> {
  const season = await db.season.findFirst({
    where: { id, ...liveSeason },
    select: {
      id: true,
      code: true,
      title: true,
      program: true,
      requiredProgram: true,
      graduatesOnPass: true,
      isCommunityWide: true,
      year: true,
      description: true,
      status: true,
      startDate: true,
      endDate: true,
      absenceBudgetMinutes: true,
      absenceWeightMinutes: true,
      _count: {
        select: {
          sessions: true,
          assignments: { where: liveAssignment },
          quizzes: true,
          enrollments: { where: { status: { not: "WITHDRAWN" } } },
        },
      },
      groups: {
        // Students may only see their own group.
        where: user.role === "STUDENT" ? { students: { some: { studentUserId: user.userId } } } : {},
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          // A drop leaves the GroupStudent row, so leave those students out to agree with the season's count.
          _count: {
            select: {
              students: {
                where: { NOT: { studentUser: { seasonEnrollments: { some: { seasonId: id, status: "WITHDRAWN" } } } } },
              },
            },
          },
          leaders: { select: { user: { select: { name: true } } } },
        },
      },
    },
  });
  if (!season) return null;

  const staff =
    user.role === "SUPER" ||
    isAdminOfSeason(user, season.id) ||
    (user.role === "LEADER" && season.groups.some((g) => user.groupLeaderIds.includes(g.id)));

  return {
    id: season.id,
    code: season.code,
    title: season.title,
    program: season.program,
    ...(staff ? { requiredProgram: season.requiredProgram, graduatesOnPass: season.graduatesOnPass } : {}),
    isCommunityWide: season.isCommunityWide,
    year: season.year,
    description: season.description,
    status: season.status,
    startDate: season.startDate,
    endDate: season.endDate,
    absenceBudgetMinutes: season.absenceBudgetMinutes,
    absenceWeightMinutes: season.absenceWeightMinutes,
    sessionCount: season._count.sessions,
    assignmentCount: season._count.assignments,
    quizCount: season._count.quizzes,
    studentCount: season._count.enrollments,
    canAdminister: isAdminOfSeason(user, season.id),
    groups: season.groups.map((g) => ({
      id: g.id,
      name: g.name,
      studentCount: g._count.students,
      leaderNames: g.leaders.map((l) => l.user.name).filter((n): n is string => Boolean(n)),
    })),
  };
}

/**
 * A season that hasn't been deleted, read with the caller's own `select`
 * (each route needs different columns, on purpose), or null.
 */
export function findLiveSeason<S extends Prisma.SeasonSelect>(id: number, select: S) {
  return db.season.findFirst({ where: { id, ...liveSeason }, select });
}
