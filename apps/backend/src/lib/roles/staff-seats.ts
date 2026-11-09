import type { Prisma } from "../../generated/prisma/client";
import { ACTIVE_SEASON, activeRolesFor, lockPeople } from "./active-role";
import { seatRefusal, type Seat, type SeatRefusal } from "./seat-rules";
import { liveSeasonStatus } from "../seasons/status";

/** The HTTP status of a refusal: only "that person doesn't exist" isn't a 409. */
/**
 * The first reason any of these people can't be newly seated, or null. Runs the
 * whole check in its required order, so the caller only has to write the seat
 * in the same transaction. Pass only people being added: see `seatRefusal`.
 */
export async function refuseNewSeats(
  tx: Prisma.TransactionClient,
  userIds: number[],
  seat: Seat,
): Promise<SeatRefusal | null> {
  if (userIds.length === 0) return null;
  await lockPeople(tx, userIds);
  const people = await tx.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, role: true, graduationYear: true, deletedAt: true },
  });
  const active = await activeRolesFor(tx, userIds);
  for (const id of userIds) {
    const person = people.find((p) => p.id === id);
    if (!person) return { code: "not_found", message: "User not found." };
    const refusal = await seatRefusal(tx, person, seat, active.get(id));
    if (refusal) return refusal;
  }
  return null;
}

/** A season that hasn't finished: a draft's rows are held even though they don't clash yet. */
const UNFINISHED_SEASON = { status: liveSeasonStatus, deletedAt: null };
const SEASON_TITLE = { season: { select: { title: true } } } as const;

/** A season this person holds a row in, if any, whatever the row. For a change to the account's role. */
export async function liveSeasonRole(
  tx: Prisma.TransactionClient,
  userId: number,
): Promise<{ seasonTitle: string } | null> {
  const row =
    (await tx.seasonAdmin.findFirst({
      where: { userId, season: UNFINISHED_SEASON },
      select: SEASON_TITLE,
    })) ??
    (await tx.seasonEnrollment.findFirst({
      where: { studentUserId: userId, status: "ACTIVE", season: UNFINISHED_SEASON },
      select: SEASON_TITLE,
    }));
  if (row) return { seasonTitle: row.season.title };
  const led = await tx.groupLeader.findFirst({
    where: { userId, group: { season: UNFINISHED_SEASON } },
    select: { group: { select: SEASON_TITLE } },
  });
  return led ? { seasonTitle: led.group.season.title } : null;
}

/** Live alumni with no active role: who can be picked to serve. A draft's rows don't count. */
export const freeAlumni: Prisma.UserWhereInput = {
  deletedAt: null,
  graduationYear: { not: null },
  role: { notIn: ["SUPER", "MENTOR"] },
  seasonAdminAssignments: { none: { season: ACTIVE_SEASON } },
  groupLeaderAssignments: { none: { group: { season: ACTIVE_SEASON } } },
  seasonEnrollments: { none: { status: "ACTIVE", season: ACTIVE_SEASON } },
};
