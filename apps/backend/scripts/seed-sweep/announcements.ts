import { db } from "../../src/db/client";
import type { SweepPeople } from "./people";
import { fromToday } from "./shared";

/**
 * Two announcements for the Announcements sweep flows (super-scenarios/s56,
 * student-scenarios/s57): one to the community from the super, one to the current
 * season from its admin. Seeded last, with the users created before them, so both
 * are unread for everyone they reach. Titles say they are sweep data. No
 * notifications are written: the flows only open the feed, a post and the form.
 */
export async function seedAnnouncementScenario({ superUser, admin, season }: SweepPeople): Promise<void> {
  await db.announcement.createMany({
    data: [
      {
        audience: "COMMUNITY",
        title: "[Sweep] Community test announcement",
        body: "This is fake text for the UI sweep. It goes to everyone in the community.\n\nA second paragraph, to check line breaks.",
        authorId: superUser.id,
        createdAt: fromToday(-1),
      },
      {
        audience: "SEASON",
        seasonId: season.id,
        title: "[Sweep] Season test announcement",
        body: "This is fake text for the UI sweep. It goes to the current season only.",
        authorId: admin.id,
        createdAt: fromToday(-2),
      },
    ],
  });
}
