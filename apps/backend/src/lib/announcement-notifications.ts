import { db } from "../db/client";
import { liveSeason, liveUser } from "./db/live";
import { ANNOUNCEMENT_PUSH_LENGTH } from "../../../../packages/shared/src/index";
import { runInBackground } from "./background";
import { createNotificationsBulk } from "./notifications";
import { notificationLink } from "./notification-target";

interface RecipientTarget {
  audience: "COMMUNITY" | "SEASON";
  seasonId?: number | null;
}

/**
 * Who a post reaches. Everyone is a live account and never the author.
 * COMMUNITY: every account. SEASON: the students enrolled and ACTIVE while the
 * season is ACTIVE, plus its admins and group leaders; Super and Mentor are
 * permanent roles with no season, so they are left out.
 */
export async function announcementRecipients(target: RecipientTarget, excludeUserId: number | null): Promise<number[]> {
  const live = { ...liveUser, ...(excludeUserId !== null ? { id: { not: excludeUserId } } : {}) };
  if (target.audience === "COMMUNITY") {
    const users = await db.user.findMany({ where: live, select: { id: true } });
    return users.map((u) => u.id);
  }
  if (target.seasonId === null || target.seasonId === undefined) return [];
  const seasonId = target.seasonId;
  const seasonActive = { id: seasonId, status: "ACTIVE" as const, ...liveSeason };
  const notPermanent = { role: { notIn: ["SUPER", "MENTOR"] as ("SUPER" | "MENTOR")[] } };
  const users = await db.user.findMany({
    where: {
      ...live,
      ...notPermanent,
      OR: [
        { seasonEnrollments: { some: { seasonId, status: "ACTIVE", season: seasonActive } } },
        { seasonAdminAssignments: { some: { seasonId, season: seasonActive } } },
        { groupLeaderAssignments: { some: { group: { seasonId, season: seasonActive } } } },
      ],
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

/** The bell and push for a new post. Runs after the create transaction, never on an edit. */
export function notifyAnnouncement(post: {
  id: number;
  audience: "COMMUNITY" | "SEASON";
  seasonId: number | null;
  authorId: number | null;
  body: string;
}): void {
  runInBackground(
    "announcement-notify",
    (async () => {
      const recipients = await announcementRecipients(post, post.authorId);
      await createNotificationsBulk(recipients, {
        type: "ANNOUNCEMENT",
        // A post has no title of its own: the message is the push body.
        title: "New announcement",
        // By code point: a slice would cut an emoji's surrogate pair in half.
        body: Array.from(post.body).slice(0, ANNOUNCEMENT_PUSH_LENGTH).join(""),
        link: notificationLink.announcement(post.id),
      });
    })(),
  );
}
