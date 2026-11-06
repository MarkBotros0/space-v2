import type { Prisma } from "../../generated/prisma/client";

/** Everyone whose derived current season depends on this one: enrolled students, admins, leaders. */
export async function seasonPeopleIds(tx: Prisma.TransactionClient, seasonId: number): Promise<number[]> {
  const [students, admins, leaders] = await Promise.all([
    tx.seasonEnrollment.findMany({ where: { seasonId }, select: { studentUserId: true } }),
    tx.seasonAdmin.findMany({ where: { seasonId }, select: { userId: true } }),
    tx.groupLeader.findMany({ where: { group: { seasonId } }, select: { userId: true } }),
  ]);
  return [
    ...new Set([
      ...students.map((s) => s.studentUserId),
      ...admins.map((a) => a.userId),
      ...leaders.map((l) => l.userId),
    ]),
  ];
}
