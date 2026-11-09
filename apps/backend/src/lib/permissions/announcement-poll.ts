import type { SessionUser } from "../auth/tokens";
import { isSuper } from "../rbac";
import {
  canEditAnnouncement,
  isFinished,
  type AnnouncementRowForAuth,
} from "./announcement";

/** A poll is closed by a manager, or for good once its season has finished. */
export function isPollClosed(
  row: AnnouncementRowForAuth,
  poll: { closedAt: Date | null },
): boolean {
  return poll.closedAt !== null || isFinished(row);
}

/**
 * Whoever may read the post votes on it while it is open, except a Super on a
 * season post: they read it as an overseer, not as its audience. Fails closed:
 * a season post takes votes only while its season is ACTIVE.
 */
export function canVotePoll(
  user: SessionUser,
  row: AnnouncementRowForAuth,
  closed: boolean,
): boolean {
  if (closed) return false;
  if (row.audience === "COMMUNITY") return true;
  if (row.season?.status !== "ACTIVE") return false;
  return !isSuper(user);
}

/** The managers of a poll are exactly who may edit its post. */
export function canManagePoll(user: SessionUser, row: AnnouncementRowForAuth): boolean {
  return canEditAnnouncement(user, row);
}

/** Managers, and a Super once the season has finished. */
export function canSeePollNames(user: SessionUser, row: AnnouncementRowForAuth): boolean {
  return canManagePoll(user, row) || (isFinished(row) && isSuper(user));
}
