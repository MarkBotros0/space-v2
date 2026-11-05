import { db } from "../../db/client";
import type { SessionUser } from "../auth/tokens";
import { groupIdInSeason } from "../queries/enrollment";
import { isAdminOfSeason, isLeaderOfGroup, isMentor, isSuper } from "../rbac";

export async function canAccessGroup(user: SessionUser, groupId: number): Promise<boolean> {
  if (isSuper(user) || isMentor(user)) return true;
  if (isLeaderOfGroup(user, groupId)) return true;

  const group = await db.group.findUnique({
    where: { id: groupId },
    select: { seasonId: true },
  });
  if (!group) return false;
  if (isAdminOfSeason(user, group.seasonId)) return true;

  if (user.role === "STUDENT") {
    // The student's group *in this group's season*, from the enrolment, the
    // authority (ruling C9).
    return (await groupIdInSeason(user.userId, group.seasonId)) === groupId;
  }

  return false;
}
