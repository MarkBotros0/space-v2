import { db } from "../../db/client";

export interface GroupListRow {
  id: number;
  name: string;
  description: string | null;
  studentCount: number;
  leaderNames: string[];
  seasonCode: string;
  seasonTitle: string;
}

/**
 * `onlyStudentUserId` narrows the list to that student's own group. Students may
 * only see their own group and its leaders, so the scope is applied in the query
 * rather than filtered out of the response.
 */
export async function listGroupsForSeason(
  seasonId: number,
  { onlyStudentUserId }: { onlyStudentUserId?: number } = {},
): Promise<GroupListRow[]> {
  const rows = await db.group.findMany({
    where: {
      seasonId,
      ...(onlyStudentUserId ? { students: { some: { studentUserId: onlyStudentUserId } } } : {}),
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      _count: { select: { students: true } },
      leaders: { select: { user: { select: { name: true } } } },
      season: { select: { code: true, title: true } },
    },
  });
  return rows.map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description,
    studentCount: g._count.students,
    leaderNames: g.leaders.map((l) => l.user.name).filter((n): n is string => Boolean(n)),
    seasonCode: g.season.code,
    seasonTitle: g.season.title,
  }));
}
