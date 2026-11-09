import type { ApiErrorCode } from "@space/shared";
import type { Prisma } from "../../generated/prisma/client";
import type { SeasonStatus, UserRole } from "../../generated/prisma/enums";
import { describeActiveRole, type ActiveRole } from "./active-role";
import { isSeasonFinished } from "../seasons/status";

export type Seat = {
  kind: "admin" | "leader" | "student";
  season: { id: number; status: SeasonStatus; isCommunityWide: boolean };
};

/** `role` is the stored `User.role`, not the derived one. */
export type SeatPerson = {
  id: number;
  name: string;
  role: UserRole;
  graduationYear: number | null;
  deletedAt: Date | null;
};

export type SeatRefusal = { code: ApiErrorCode; message: string };

const PERMANENT_ROLES: Partial<Record<UserRole, string>> = {
  SUPER: "a super admin",
  MENTOR: "a mentor",
};

/**
 * Whether this season refuses this person a student seat. A regular season bars
 * an alumnus; a community-wide one doesn't, and that is the one place the rule
 * lives: `clashesWithActiveRole` already refuses an alumnus serving in the same
 * season, and a Super or Mentor is refused as permanent whatever the season.
 */
function isBarredFromStudentSeat(person: SeatPerson, season: { isCommunityWide: boolean }): boolean {
  return !season.isCommunityWide && person.graduationYear !== null;
}

/**
 * Only an ACTIVE seat can clash: a draft's roles don't count until it starts.
 * In one season, serving and studying clash in either direction, while admin
 * and leader together are one serving role. Goes beyond the plan's table, which
 * only named a staff seat for a student; the spec refuses both.
 */
function clashesWithActiveRole(seat: Seat, active: ActiveRole | undefined): active is ActiveRole {
  if (seat.season.status !== "ACTIVE" || !active) return false;
  if (active.seasonId !== seat.season.id) return true;
  return (active.kind === "student") !== (seat.kind === "student");
}

/** Why this account can't hold this kind of seat in any season. Start asks this of seats already held. */
export function eligibilityRefusal(
  person: SeatPerson,
  kind: Seat["kind"],
  season: { isCommunityWide: boolean },
): (SeatRefusal & { code: "user_inactive" | "permanent_role" | "not_alumnus" | "is_alumnus" }) | null {
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

  if (kind !== "student" && person.graduationYear === null) {
    return { code: "not_alumnus", message: `Only alumni can serve. ${person.name} hasn't graduated.` };
  }

  if (kind === "student" && isBarredFromStudentSeat(person, season)) {
    return { code: "is_alumnus", message: `${person.name} is an alumnus and can't join as a student.` };
  }

  return null;
}

/** Their other active role, if it clashes with this seat. Start asks it as though the season were already ACTIVE. */
export function inRoleRefusal(
  person: SeatPerson,
  seat: Seat,
  active: ActiveRole | undefined,
): (SeatRefusal & { code: "already_in_role" }) | null {
  if (!clashesWithActiveRole(seat, active)) return null;
  return { code: "already_in_role", message: describeActiveRole(person.name, active) };
}

/**
 * Why this person can't take this seat, or null if they can. The first match
 * wins. Read both `person` and `active` (from `activeRolesFor`) after
 * `lockPeople`, in the same transaction: a row read earlier can be stale.
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
  const ineligible = eligibilityRefusal(person, seat.kind, seat.season);
  if (ineligible) return ineligible;

  if (isSeasonFinished(seat.season.status)) {
    return { code: "season_finished", message: "This season has finished." };
  }

  const inRole = inRoleRefusal(person, seat, active);
  if (inRole) return inRole;

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
