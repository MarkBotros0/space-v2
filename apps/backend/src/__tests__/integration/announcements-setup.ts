import type { Express } from "express";

import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login, testEventTitle } from "./fixtures";

export interface AnnouncementFixtures {
  seasonId: number;
  finishedSeasonId: number;
  otherSeasonId: number;
  communityId: number;
  liveId: number;
  finishedId: number;
  otherId: number;
  userIds: { admin: number; student: number; superUser: number };
  tokens: {
    student: string;
    dropped: string;
    finishedStudent: string;
    formerAdmin: string;
    alumnus: string;
    leader: string;
    admin: string;
    mentor: string;
    superUser: string;
    otherStudent: string;
  };
}

/** Inserts a post directly; the body carries the test prefix so cleanup finds it. */
export async function insertPost(data: {
  audience: "COMMUNITY" | "SEASON";
  seasonId?: number;
  authorId?: number | null;
  createdAt?: Date;
}): Promise<number> {
  const row = await db.announcement.create({
    data: {
      audience: data.audience,
      seasonId: data.seasonId ?? null,
      authorId: data.authorId ?? null,
      body: `${testEventTitle("announce")} A plain-text body.`,
      ...(data.createdAt ? { createdAt: data.createdAt } : {}),
    },
    select: { id: true },
  });
  return row.id;
}

/**
 * The announcement suites' beforeAll body. A live community-wide season (so an
 * alumnus can study in it), a finished one, and another live one; one post of
 * each, authored by the Super. Tokens come from real logins, so the scopes are
 * derived for real.
 */
export async function seedAnnouncementFixtures(app: Express): Promise<AnnouncementFixtures> {
  await cleanupTestData();

  const live = await createTestSeason();
  await db.season.update({ where: { id: live.id }, data: { isCommunityWide: true } });
  const finished = await createTestSeason({ status: "COMPLETED" });
  const other = await createTestSeason();

  const admin = await createTestUser("announceadmin", "ADMIN");
  const leader = await createTestUser("announceleader", "LEADER");
  const student = await createTestUser("announcestudent", "STUDENT");
  const dropped = await createTestUser("announcedropped", "STUDENT");
  const alumnus = await createTestUser("announcealumnus", "STUDENT");
  const finishedStudent = await createTestUser("announcefinished", "STUDENT");
  const formerAdmin = await createTestUser("announceformer", "ADMIN");
  const otherStudent = await createTestUser("announceother", "STUDENT");
  const mentor = await createTestUser("announcementor", "MENTOR");
  const superUser = await createTestUser("announcesuper", "SUPER");

  await db.user.update({ where: { id: alumnus.id }, data: { graduationYear: 2098 } });
  for (const u of [student, dropped, alumnus, finishedStudent, otherStudent]) {
    await db.studentProfile.create({ data: { userId: u.id } });
  }

  const group = await db.group.create({
    data: { seasonId: live.id, name: "Announce A", leaders: { create: { userId: leader.id } } },
    select: { id: true },
  });
  await db.seasonAdmin.createMany({
    data: [
      { seasonId: live.id, userId: admin.id },
      { seasonId: finished.id, userId: formerAdmin.id },
    ],
  });
  await db.seasonEnrollment.createMany({
    data: [
      { seasonId: live.id, studentUserId: student.id, groupId: group.id, status: "ACTIVE" },
      { seasonId: live.id, studentUserId: dropped.id, groupId: group.id, status: "WITHDRAWN" },
      { seasonId: live.id, studentUserId: alumnus.id, groupId: group.id, status: "ACTIVE" },
      { seasonId: finished.id, studentUserId: finishedStudent.id, status: "COMPLETED" },
      { seasonId: other.id, studentUserId: otherStudent.id, status: "ACTIVE" },
    ],
  });

  const communityId = await insertPost({ audience: "COMMUNITY", authorId: superUser.id });
  const liveId = await insertPost({ audience: "SEASON", seasonId: live.id, authorId: superUser.id });
  const finishedId = await insertPost({ audience: "SEASON", seasonId: finished.id, authorId: superUser.id });
  const otherId = await insertPost({ audience: "SEASON", seasonId: other.id, authorId: superUser.id });

  return {
    seasonId: live.id,
    finishedSeasonId: finished.id,
    otherSeasonId: other.id,
    communityId,
    liveId,
    finishedId,
    otherId,
    userIds: { admin: admin.id, student: student.id, superUser: superUser.id },
    tokens: {
      student: await login(app, student.email),
      dropped: await login(app, dropped.email),
      finishedStudent: await login(app, finishedStudent.email),
      formerAdmin: await login(app, formerAdmin.email),
      alumnus: await login(app, alumnus.email),
      leader: await login(app, leader.email),
      admin: await login(app, admin.email),
      mentor: await login(app, mentor.email),
      superUser: await login(app, superUser.email),
      otherStudent: await login(app, otherStudent.email),
    },
  };
}

/** Inserts a poll on a post; labels become options in order. */
export async function insertPoll(
  postId: number,
  data: { allowsMultiple: boolean; labels: string[]; closed?: boolean },
): Promise<{ pollId: number; optionIds: number[] }> {
  const poll = await db.announcementPoll.create({
    data: {
      announcementId: postId,
      allowsMultiple: data.allowsMultiple,
      ...(data.closed ? { closedAt: new Date() } : {}),
      options: { create: data.labels.map((label, position) => ({ label, position })) },
    },
    select: { id: true, options: { orderBy: { position: "asc" }, select: { id: true } } },
  });
  return { pollId: poll.id, optionIds: poll.options.map((o) => o.id) };
}

export async function insertVote(pollId: number, optionId: number, userId: number): Promise<void> {
  await db.announcementPollVote.create({ data: { pollId, optionId, userId } });
}
