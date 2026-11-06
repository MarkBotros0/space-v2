import type { Prisma } from "../../generated/prisma/client";
import type { SeasonStatus, UserRole } from "../../generated/prisma/enums";
import { describeActiveRole, type ActiveRole } from "./active-role";

export type Seat = {
  kind: "admin" | "leader" | "student";
  season: { id: number; status: SeasonStatus };
};

/** `role` is the stored `User.role`, not the derived one. */
export type SeatPerson = {
  id: number;
  name: string;
  role: UserRole;
  graduationYear: number | null;
  deletedAt: Date | null;
};

export type SeatRefusal = { code: string; message: string };

const PERMANENT_ROLES: Partial<Record<UserRole, string>> = {
  SUPER: "a super admin",
  MENTOR: "a mentor",
};

/**
 * Whether a regular season refuses this person a student seat. Every season is
 * regular until Build 3 adds community-wide seasons, which change only this.
 */
function isBarredFromStudentSeat(person: SeatPerson): boolean {
  return person.graduationYear !== null;
}

/** Only an ACTIVE seat can clash: a draft's roles don't count until it starts. */
function clashesWithActiveRole(seat: Seat, active: ActiveRole | undefined): active is ActiveRole {
  if (seat.season.status !== "ACTIVE" || !active) return false;
  if (active.seasonId !== seat.season.id) return true;
  return active.kind === "student" && seat.kind !== "student";
}

/**
 * Why this person can't take this seat, or null if they can. The first match
 * wins. Pass `active` from `activeRolesFor`, read after `lockPeople`.
 *
 * Call it only for someone being newly seated: a seat has no group, so any
 * group the person already leads in the season counts as a second one.
 */
export async function seatRefusal(
  tx: Prisma.TransactionClient,
  person: SeatPerson,
  seat: Seat,
  active: ActiveRole | undefined,
): Promise<SeatRefusal | null> {
  if (person.deletedAt) {
    return { code: "user_inactive", message: "That account is deactivated." };
  }

  const permanentRole = PERMANENT_ROLES[person.role];
  if (permanentRole) {
    return {
      code: "permanent_role",
      message: `${person.name} is ${permanentRole} and can't take a season role.`,
    };
  }

  if (seat.kind !== "student" && person.graduationYear === null) {
    return { code: "not_alumnus", message: `Only alumni can serve. ${person.name} hasn't graduated.` };
  }

  if (seat.kind === "student" && isBarredFromStudentSeat(person)) {
    return { code: "is_alumnus", message: `${person.name} is an alumnus and can't join as a student.` };
  }

  if (seat.season.status === "COMPLETED" || seat.season.status === "ARCHIVED") {
    return { code: "season_finished", message: "This season has finished." };
  }

  if (clashesWithActiveRole(seat, active)) {
    return { code: "already_in_role", message: describeActiveRole(person.name, active) };
  }

  if (seat.kind === "leader") {
    const leadsGroup = await tx.groupLeader.findFirst({
      where: { userId: person.id, group: { seasonId: seat.season.id } },
      select: { groupId: true },
    });
    if (leadsGroup) {
      return { code: "leader_has_group", message: `${person.name} already leads a group in this season.` };
    }
  }

  return null;
}
