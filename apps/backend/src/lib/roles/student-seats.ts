import type { Standing } from "../../../../../packages/shared/src/index";
import type { Prisma } from "../../generated/prisma/client";
import type { SeasonStatus } from "../../generated/prisma/enums";
import { markSessionsStale } from "../auth/session-validity";
import { enrollStudentsInSeason, type NewEnrollment } from "../queries/students/writes";
import { activeRolesFor, lockPeople, lockSeason, type ActiveRole, type SeasonLockMode } from "./active-role";
import { seatRefusal, type SeatPerson, type SeatRefusal } from "./seat-rules";
import { describeBlock, loadStandings, standingsFrom, type StandingSeason } from "./standing";

export type StudentSeatSeason = StandingSeason & { status: SeasonStatus; isCommunityWide: boolean };

export type StudentSeatOptions = { overridden: boolean; actorIsSuper: boolean };

const NOT_OVERRIDDEN: StudentSeatOptions = { overridden: false, actorIsSuper: false };

/**
 * The season a seat is being written against, locked and then read. Every such
 * write reads it through here, first thing in its transaction, so the status it
 * goes on is the one it holds the lock over. Only Start asks for "update".
 */
export async function readSeatSeason(
  tx: Prisma.TransactionClient,
  seasonId: number,
  mode: SeasonLockMode = "share",
): Promise<StudentSeatSeason | null> {
  await lockSeason(tx, seasonId, mode);
  return tx.season.findFirst({
    where: { id: seasonId, deletedAt: null },
    select: { id: true, status: true, program: true, requiredProgram: true, isCommunityWide: true },
  });
}

export function isSeasonFinished(season: { status: SeasonStatus }): boolean {
  return season.status === "COMPLETED" || season.status === "ARCHIVED";
}

/**
 * `seatRefusal` plus standing. Blocked and in a role reads as the picker does,
 * block first; an override lifts only the block, so the role still refuses. A
 * stored ADMIN or LEADER isn't in the picker's pool either.
 */
async function decide(
  tx: Prisma.TransactionClient,
  person: SeatPerson,
  season: StudentSeatSeason,
  active: ActiveRole | undefined,
  standing: Standing,
  { overridden, actorIsSuper }: StudentSeatOptions,
): Promise<SeatRefusal | null> {
  const refusal = await seatRefusal(tx, person, { kind: "student", season }, active);
  if (refusal && refusal.code !== "already_in_role") return refusal;
  if (standing.kind === "blocked" && !(overridden && actorIsSuper)) {
    const block = `${person.name} ${describeBlock(standing, season.requiredProgram)}`;
    return { code: "not_eligible", message: refusal ? `${block}. ${refusal.message}` : block };
  }
  if (refusal) return refusal;
  if (person.role !== "STUDENT") {
    return { code: "not_student", message: `${person.name} can't join as a student.` };
  }
  return null;
}

/**
 * Why this person can't be newly seated as a student here, or null. Call it
 * after `lockPeople`, with a person row read after the lock. It doesn't look at
 * a row they already hold in this season; `seatStudents` does.
 */
export async function checkStudentSeat(
  tx: Prisma.TransactionClient,
  person: SeatPerson,
  season: StudentSeatSeason,
  options: StudentSeatOptions,
): Promise<SeatRefusal | null> {
  const active = await activeRolesFor(tx, [person.id]);
  const standings = await loadStandings(tx, [person.id], season);
  return decide(tx, person, season, active.get(person.id), standings.get(person.id)!, options);
}

/** The same check for an account that doesn't exist yet: no history and no role. */
export async function newPersonRefusal(
  tx: Prisma.TransactionClient,
  name: string,
  season: StudentSeatSeason,
): Promise<SeatRefusal | null> {
  const person: SeatPerson = { id: 0, name, role: "STUDENT", graduationYear: null, deletedAt: null };
  const standing = standingsFrom([0], new Map(), season).get(0)!;
  return decide(tx, person, season, undefined, standing, NOT_OVERRIDDEN);
}

export type StudentSeatOverride = { userIds: number[]; actorId: number; actorIsSuper: boolean };

export type SeatStudentsResult = {
  seated: number[];
  /** Those seated past a block, whose row records the override. */
  overridden: number[];
  /** In the order asked for. */
  refused: { userId: number; refusal: SeatRefusal }[];
};

/**
 * The one check-and-write for student seats: locks the people, reads them,
 * refuses whoever can't join, then writes. A refusal writes nothing for anyone
 * unless `partial`, where each person stands alone (a sheet's rows report one
 * by one). The statement count doesn't grow with the batch. `season` comes from
 * `readSeatSeason`, so its lock is taken before the people's.
 *
 * An override is recorded only on someone actually blocked: left on anyone else
 * it would quietly excuse a block they pick up before the season starts.
 */
export async function seatStudents(
  tx: Prisma.TransactionClient,
  season: StudentSeatSeason,
  userIds: number[],
  options: { partial?: boolean; override?: StudentSeatOverride } = {},
): Promise<SeatStudentsResult> {
  await lockPeople(tx, userIds);
  const people = await tx.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, role: true, graduationYear: true, deletedAt: true },
  });
  const here = await tx.seasonEnrollment.findMany({
    where: { seasonId: season.id, studentUserId: { in: userIds } },
    select: { studentUserId: true, status: true },
  });
  const active = await activeRolesFor(tx, userIds);
  const standings = await loadStandings(tx, userIds, season);
  const peopleById = new Map(people.map((p) => [p.id, p]));
  const hereById = new Map(here.map((e) => [e.studentUserId, e.status]));
  const overrideIds = new Set(options.override?.userIds ?? []);

  const refused: SeatStudentsResult["refused"] = [];
  const toSeat: number[] = [];
  for (const userId of userIds) {
    const person = peopleById.get(userId);
    const refusal: SeatRefusal | null = !person
      ? { code: "not_found", message: "User not found." }
      : await refusalFor(tx, person, season, hereById.get(userId), active.get(userId), standings.get(userId)!, {
          overridden: overrideIds.has(userId),
          actorIsSuper: options.override?.actorIsSuper ?? false,
        });
    if (refusal) refused.push({ userId, refusal });
    else toSeat.push(userId);
  }
  if (refused.length > 0 && !options.partial) return { seated: [], overridden: [], refused };

  const overridden: number[] = [];
  const at = new Date();
  const rows = toSeat.map((studentUserId): NewEnrollment => {
    if (standings.get(studentUserId)!.kind !== "blocked" || !options.override) return { studentUserId };
    overridden.push(studentUserId);
    return { studentUserId, override: { byId: options.override.actorId, at } };
  });
  await enrollStudentsInSeason(tx, season.id, rows);
  return { seated: toSeat, overridden, refused };
}

/** A row here comes first, as in the picker. */
async function refusalFor(
  tx: Prisma.TransactionClient,
  person: SeatPerson,
  season: StudentSeatSeason,
  hereStatus: string | undefined,
  active: ActiveRole | undefined,
  standing: Standing,
  options: StudentSeatOptions,
): Promise<SeatRefusal | null> {
  if (hereStatus === "WITHDRAWN") {
    return {
      code: "in_season",
      message: `${person.name} was dropped from this season - only a super admin can bring them back`,
    };
  }
  if (hereStatus) return { code: "in_season", message: `${person.name} is already in this season` };
  return decide(tx, person, season, active, standing, options);
}

export type RestoredSeat = { id: number; status: "ACTIVE" };

/**
 * A dropped student back into the row they already have: WITHDRAWN to ACTIVE,
 * `droppedAt` cleared, their group kept. `dropReason` stays on the row, as staff's
 * record, and reads return it only while the row is WITHDRAWN; a later drop
 * overwrites it. The rule is checked again as if adding. As with
 * a new seat, an override is recorded only on someone actually blocked, and one
 * from before the drop doesn't count: it says nothing about who they are now.
 * `season` comes from `readSeatSeason`; a finished one is `seatRefusal`'s refusal.
 */
export async function restoreStudentSeat(
  tx: Prisma.TransactionClient,
  season: StudentSeatSeason,
  userId: number,
  actor: { id: number; override: boolean },
): Promise<SeatRefusal | RestoredSeat> {
  await lockPeople(tx, [userId]);
  const row = await tx.seasonEnrollment.findUnique({
    where: { studentUserId_seasonId: { studentUserId: userId, seasonId: season.id } },
    select: { id: true, status: true },
  });
  if (!row) return { code: "not_found", message: "Enrollment not found." };
  if (row.status !== "WITHDRAWN") {
    return { code: "not_dropped", message: "Only a dropped student can be brought back." };
  }

  const person = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, name: true, role: true, graduationYear: true, deletedAt: true },
  });
  const active = await activeRolesFor(tx, [userId]);
  const standing = (await loadStandings(tx, [userId], season)).get(userId)!;
  const refusal = await decide(tx, person, season, active.get(userId), standing, {
    overridden: actor.override,
    actorIsSuper: true,
  });
  if (refusal) return refusal;

  const overridden = standing.kind === "blocked";
  await tx.seasonEnrollment.update({
    where: { id: row.id },
    data: {
      status: "ACTIVE",
      droppedAt: null,
      overrideById: overridden ? actor.id : null,
      overrideAt: overridden ? new Date() : null,
    },
  });
  await markSessionsStale(tx, [userId]);
  return { id: row.id, status: "ACTIVE" };
}
