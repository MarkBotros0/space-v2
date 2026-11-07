import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import type { SeasonStartCheck, StartIssue } from "../../../../../packages/shared/src/index";
import {
  activeRolesFor,
  describeBlock,
  eligibilityRefusal,
  inRoleRefusal,
  loadStandings,
  type StandingSeason,
} from "../roles";

/** A role held elsewhere only clashes once this season is live, so judge it as though it were. */
const AS_STARTED = "ACTIVE" as const;

const SEATS: StartIssue["seat"][] = ["admin", "leader", "student"];

/**
 * Who stops this draft from starting, and why, one item per reason. Unlike a new
 * seat's check it looks at seats already held: leading one group here is fine,
 * and a stored role doesn't matter. A recorded override lifts a program block,
 * never a role held elsewhere. An account that can't hold the seat at all needs
 * removing, so nothing else is said about it.
 *
 * Start calls this holding the season and its people, so what it reads stands.
 */
export async function loadSeasonStartCheck(
  season: StandingSeason & { isCommunityWide: boolean },
  client: Prisma.TransactionClient = db,
): Promise<SeasonStartCheck> {
  const admins = await client.seasonAdmin.findMany({ where: { seasonId: season.id }, select: { userId: true } });
  const leaders = await client.groupLeader.findMany({
    where: { group: { seasonId: season.id } },
    select: { userId: true },
  });
  const students = await client.seasonEnrollment.findMany({
    where: { seasonId: season.id, status: "ACTIVE" },
    select: { studentUserId: true, overrideAt: true },
  });

  const groupsLed = new Map<number, number>();
  for (const { userId } of leaders) groupsLed.set(userId, (groupsLed.get(userId) ?? 0) + 1);
  const overridden = new Set(students.filter((s) => s.overrideAt).map((s) => s.studentUserId));
  const seated: Record<StartIssue["seat"], number[]> = {
    admin: admins.map((a) => a.userId),
    leader: [...groupsLed.keys()],
    student: students.map((s) => s.studentUserId),
  };

  const userIds = [...new Set(Object.values(seated).flat())];
  const people = await client.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, role: true, graduationYear: true, deletedAt: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  const active = await activeRolesFor(client, userIds);
  const standings = await loadStandings(client, seated.student, season);

  const items: StartIssue[] = [];
  for (const seat of SEATS) {
    const here = new Set(seated[seat]);
    for (const person of people) {
      if (!here.has(person.id)) continue;
      const issue = (reason: StartIssue["reason"], message: string, otherSeasonCode: string | null = null) =>
        items.push({ userId: person.id, name: person.name, seat, reason, message, otherSeasonCode });

      const ineligible = eligibilityRefusal(person, seat, season);
      if (ineligible) {
        issue(ineligible.code, ineligible.message);
        continue;
      }
      const role = active.get(person.id);
      const inRole = inRoleRefusal(person, { kind: seat, season: { id: season.id, status: AS_STARTED, isCommunityWide: season.isCommunityWide } }, role);
      if (inRole) issue(inRole.code, inRole.message, role!.seasonCode);

      const led = groupsLed.get(person.id) ?? 0;
      if (seat === "leader" && led >= 2) {
        issue("leader_has_group", `${person.name} leads ${led} groups in this season.`);
      }
      const standing = standings.get(person.id);
      if (seat === "student" && standing?.kind === "blocked" && !overridden.has(person.id)) {
        issue(standing.reason!, `${person.name} ${describeBlock(standing, season.requiredProgram)}`);
      }
    }
  }
  return { ready: items.length === 0, items };
}
