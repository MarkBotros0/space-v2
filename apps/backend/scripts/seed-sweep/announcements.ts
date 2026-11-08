import { db } from "../../src/db/client";
import type { SweepPeople } from "./people";

/**
 * Two announcements for the Announcements sweep flows (super-scenarios/s56,
 * student-scenarios/s57): one to the community, one to the current season from
 * its admin.
 *
 * A post counts as unread only if it is newer than the reader's account and
 * not their own (`announcementUnreadFilter`). So both are dated a second ahead, after
 * every user was created, and the community post is written by a second Super
 * ("Nour Announcer"), not the Super the flows sign in as: that Super then has
 * the community post unread, the sweep student has both, and the season's admin
 * wrote the season post. Seeded last for that reason, and a check below fails
 * the seed if the dates or authors would ever make a post read-by-default.
 * Bodies start "[Sweep]" to say they are sweep data. No notifications are written: the flows only
 * open the feed, a post and the form.
 */
export async function seedAnnouncementScenario({ user, admin, season }: SweepPeople): Promise<void> {
  const announcer = await user("announcer", "Nour Announcer", "SUPER");
  // A second past the newest user, so the strict `createdAt > account` test cannot tie on a millisecond.
  const createdAt = new Date(Date.now() + 1000);
  await db.announcement.createMany({
    data: [
      {
        audience: "COMMUNITY",
        body: "[Sweep] This is fake text for the UI sweep. It goes to everyone in the community.\n\nA second paragraph, to check line breaks.",
        authorId: announcer.id,
        createdAt,
      },
      {
        audience: "SEASON",
        seasonId: season.id,
        body: "[Sweep] This is fake text for the UI sweep. It goes to the current season only.",
        authorId: admin.id,
        createdAt,
      },
    ],
  });

  const newest = await db.user.aggregate({ _max: { createdAt: true } });
  const newestUser = newest._max.createdAt;
  if (!newestUser || createdAt <= newestUser)
    throw new Error("seed:sweep: announcements must be newer than every user, or they seed as read.");
}
