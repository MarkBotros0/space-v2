import type { SeasonStatus } from "@space/shared";

import { db } from "../../db/client";
import type { SessionUser } from "../auth/tokens";
import { isAdminOfSeason } from "../rbac";

export interface SeasonDetailRow {
  id: number;
  code: string;
  title: string;
  program: string;
  year: number;
  description: string | null;
  status: SeasonStatus;
  startDate: Date;
  endDate: Date;
  absenceBudgetMinutes: number;
  absenceWeightMinutes: number;
  sessionCount: number;
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
    where: { id, deletedAt: null },
    select: {
      id: true,
      code: true,
      title: true,
      program: true,
      year: true,
      description: true,
      status: true,
      startDate: true,
      endDate: true,
      absenceBudgetMinutes: true,
      absenceWeightMinutes: true,
      _count: { select: { sessions: true, enrollments: true } },
      groups: {
        // Students may only see their own group.
        where: user.role === "STUDENT" ? { students: { some: { studentUserId: user.userId } } } : {},
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          _count: { select: { students: true } },
          leaders: { select: { user: { select: { name: true } } } },
        },
      },
    },
  });
  if (!season) return null;

  return {
    id: season.id,
    code: season.code,
    title: season.title,
    program: season.program,
    year: season.year,
    description: season.description,
    status: season.status,
    startDate: season.startDate,
    endDate: season.endDate,
    absenceBudgetMinutes: season.absenceBudgetMinutes,
    absenceWeightMinutes: season.absenceWeightMinutes,
    sessionCount: season._count.sessions,
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
