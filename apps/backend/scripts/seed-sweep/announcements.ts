import { db } from "../../src/db/client";
import type { SweepPeople } from "./people";

/**
 * Three announcements for the Announcements sweep flows (super-scenarios/s56,
 * student-scenarios/s57): one to the community, two to the current season from
 * its admin (one with a poll).
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
export async function seedAnnouncementScenario({ user, admin, season, classmate, leader }: SweepPeople): Promise<void> {
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

  // A third post carries a poll: open, three options, several answers. The sweep student
  // (Samir) has not voted, so the poll opens on its choices; two other seeded people have,
  // so the counts are not all zero once he does (the flows never vote).
  const pollPost = await db.announcement.create({
    data: {
      audience: "SEASON",
      seasonId: season.id,
      body: "[Sweep] Which evening suits the retreat?",
      authorId: admin.id,
      createdAt,
    },
  });
  const poll = await db.announcementPoll.create({
    data: { announcementId: pollPost.id, allowsMultiple: true },
  });
  const labels = ["Thursday", "Friday", "Saturday"];
  const [thursday, friday] = await Promise.all(
    labels.map((label, position) => db.announcementPollOption.create({ data: { pollId: poll.id, label, position } })),
  );
  if (!thursday || !friday) throw new Error("seed:sweep: the poll's options were not created.");
  await db.announcementPollVote.createMany({
    data: [
      { pollId: poll.id, optionId: thursday.id, userId: classmate.id },
      { pollId: poll.id, optionId: friday.id, userId: classmate.id },
      { pollId: poll.id, optionId: friday.id, userId: leader.id },
    ],
  });

  const newest = await db.user.aggregate({ _max: { createdAt: true } });
  const newestUser = newest._max.createdAt;
  if (!newestUser || createdAt <= newestUser)
    throw new Error("seed:sweep: announcements must be newer than every user, or they seed as read.");
}
