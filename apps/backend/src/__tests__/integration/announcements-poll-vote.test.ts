import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { announcementDetailSchema } from "../../../../../packages/shared/src/index";
import { insertPoll, insertPost, seedAnnouncementFixtures, type AnnouncementFixtures } from "./announcements-setup";
import { bearer, cleanupTestData } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();
let f: AnnouncementFixtures;

beforeAll(async () => {
  f = await seedAnnouncementFixtures(app);
});

afterAll(async () => {
  await cleanupTestData();
});

/** A fresh season post (authored by the admin) with its own poll, so each test stands alone. */
async function seasonPoll(allowsMultiple: boolean, labels = ["Sat", "Sun", "Mon"]) {
  const postId = await insertPost({
    audience: "SEASON",
    seasonId: f.seasonId,
    authorId: f.userIds.admin,
  });
  return { postId, ...(await insertPoll(postId, { allowsMultiple, labels })) };
}

function vote(postId: number, token: string, body: object) {
  return request(app).put(`/api/v1/announcements/${postId}/poll/vote`).set(bearer(token)).send(body);
}

async function votesOf(pollId: number, userId: number) {
  return db.announcementPollVote.findMany({
    where: { pollId, userId },
    select: { optionId: true, pollId: true },
    orderBy: { optionId: "asc" },
  });
}

describe("PUT /announcements/:id/poll/vote", () => {
  it("records a student's vote on a one-answer poll and returns the post with counts", async () => {
    const p = await seasonPoll(false);
    const res = await vote(p.postId, f.tokens.student, { version: 1, optionIds: [p.optionIds[1]] });
    expect(res.status).toBe(200);
    const d = announcementDetailSchema.parse(res.body.data);
    expect(d.id).toBe(p.postId);
    expect(d.poll!.myOptionIds).toEqual([p.optionIds[1]]);
    expect(d.poll!.voterCount).toBe(1);
    expect(d.poll!.options.map((o) => o.votes)).toEqual([0, 1, 0]);
    expect(await votesOf(p.pollId, f.userIds.student)).toEqual([{ optionId: p.optionIds[1], pollId: p.pollId }]);
  });

  it("replaces the vote when it changes, leaving one row", async () => {
    const p = await seasonPoll(false);
    expect((await vote(p.postId, f.tokens.student, { version: 1, optionIds: [p.optionIds[0]] })).status).toBe(200);
    const res = await vote(p.postId, f.tokens.student, { version: 1, optionIds: [p.optionIds[2]] });
    expect(res.status).toBe(200);
    expect(res.body.data.poll.myOptionIds).toEqual([p.optionIds[2]]);
    expect(await votesOf(p.pollId, f.userIds.student)).toEqual([{ optionId: p.optionIds[2], pollId: p.pollId }]);
  });

  it("stores every id on a several-answer poll", async () => {
    const p = await seasonPoll(true);
    const res = await vote(p.postId, f.tokens.student, {
      version: 1,
      optionIds: [p.optionIds[0], p.optionIds[2]],
    });
    expect(res.status).toBe(200);
    expect([...res.body.data.poll.myOptionIds].sort()).toEqual([p.optionIds[0], p.optionIds[2]].sort());
    expect((await votesOf(p.pollId, f.userIds.student)).map((v) => v.optionId)).toEqual(
      [p.optionIds[0]!, p.optionIds[2]!].sort((a, b) => a - b),
    );
  });

  it("refuses two ids on a one-answer poll", async () => {
    const p = await seasonPoll(false);
    const res = await vote(p.postId, f.tokens.student, {
      version: 1,
      optionIds: [p.optionIds[0], p.optionIds[1]],
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
    expect(await votesOf(p.pollId, f.userIds.student)).toEqual([]);
  });

  it("refuses an option id from another poll, keeping the earlier vote", async () => {
    const p = await seasonPoll(true);
    const other = await seasonPoll(true);
    expect((await vote(p.postId, f.tokens.student, { version: 1, optionIds: [p.optionIds[0]] })).status).toBe(200);
    const res = await vote(p.postId, f.tokens.student, {
      version: 1,
      optionIds: [p.optionIds[1], other.optionIds[0]],
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
    expect((await votesOf(p.pollId, f.userIds.student)).map((v) => v.optionId)).toEqual([p.optionIds[0]]);
    expect(await votesOf(other.pollId, f.userIds.student)).toEqual([]);
  });

  it("refuses an empty list, a missing version and extra fields", async () => {
    const p = await seasonPoll(false);
    for (const body of [
      { version: 1, optionIds: [] },
      { optionIds: [p.optionIds[0]] },
      { version: 1, optionIds: [p.optionIds[0]], pollId: p.pollId },
    ]) {
      const res = await vote(p.postId, f.tokens.student, body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("bad_request");
    }
    expect(await votesOf(p.pollId, f.userIds.student)).toEqual([]);
  });

  it("refuses a stale version with poll_changed and stores nothing", async () => {
    const p = await seasonPoll(false);
    const res = await vote(p.postId, f.tokens.student, { version: 2, optionIds: [p.optionIds[0]] });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("poll_changed");
    expect(await votesOf(p.pollId, f.userIds.student)).toEqual([]);
  });

  it("refuses the old version after a rename bumps it", async () => {
    const p = await seasonPoll(false);
    await db.announcementPollOption.update({
      where: { id: p.optionIds[0] },
      data: { label: "Saturday" },
    });
    await db.announcementPoll.update({
      where: { id: p.pollId },
      data: { version: { increment: 1 } },
    });
    const res = await vote(p.postId, f.tokens.student, { version: 1, optionIds: [p.optionIds[0]] });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("poll_changed");
    expect(await votesOf(p.pollId, f.userIds.student)).toEqual([]);
    const ok = await vote(p.postId, f.tokens.student, { version: 2, optionIds: [p.optionIds[0]] });
    expect(ok.status).toBe(200);
  });

  it("refuses a closed poll with poll_closed", async () => {
    const postId = await insertPost({
      audience: "SEASON",
      seasonId: f.seasonId,
      authorId: f.userIds.admin,
    });
    const p = await insertPoll(postId, { allowsMultiple: false, labels: ["A", "B"], closed: true });
    const res = await vote(postId, f.tokens.student, { version: 1, optionIds: [p.optionIds[0]] });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("poll_closed");
    expect(await votesOf(p.pollId, f.userIds.student)).toEqual([]);
  });

  it("refuses a finished season's poll with season_finished, a Super included", async () => {
    const p = await insertPoll(f.finishedId, { allowsMultiple: false, labels: ["X", "Y"] });
    for (const token of [f.tokens.finishedStudent, f.tokens.superUser]) {
      const res = await vote(f.finishedId, token, { version: 1, optionIds: [p.optionIds[0]] });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("season_finished");
    }
    expect(await db.announcementPollVote.count({ where: { pollId: p.pollId } })).toBe(0);
  });

  it("forbids a Super voting on a season poll", async () => {
    const p = await seasonPoll(false);
    const res = await vote(p.postId, f.tokens.superUser, {
      version: 1,
      optionIds: [p.optionIds[0]],
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
  });

  it("forbids a Super voting on a season poll they wrote", async () => {
    const p = await insertPoll(f.liveId, { allowsMultiple: false, labels: ["A", "B"] });
    const res = await vote(f.liveId, f.tokens.superUser, {
      version: 1,
      optionIds: [p.optionIds[0]],
    });
    expect(res.status).toBe(403);
    expect(await votesOf(p.pollId, f.userIds.superUser)).toEqual([]);
  });

  it("lets the Super vote on a community poll", async () => {
    const p = await insertPoll(f.communityId, { allowsMultiple: false, labels: ["Yes", "No"] });
    const res = await vote(f.communityId, f.tokens.superUser, {
      version: 1,
      optionIds: [p.optionIds[1]],
    });
    expect(res.status).toBe(200);
    expect(res.body.data.poll.myOptionIds).toEqual([p.optionIds[1]]);
  });

  it("answers 404 to an outsider and for a post without a poll", async () => {
    const p = await seasonPoll(false);
    const outsider = await vote(p.postId, f.tokens.otherStudent, {
      version: 1,
      optionIds: [p.optionIds[0]],
    });
    expect(outsider.status).toBe(404);
    expect(outsider.body.error.code).toBe("not_found");
    const noPoll = await insertPost({
      audience: "SEASON",
      seasonId: f.seasonId,
      authorId: f.userIds.admin,
    });
    const res = await vote(noPoll, f.tokens.student, { version: 1, optionIds: [p.optionIds[0]] });
    expect(res.status).toBe(404);
    expect(await votesOf(p.pollId, f.userIds.student)).toEqual([]);
  });

  it("answers 400 to a bad post id", async () => {
    const res = await vote(0, f.tokens.student, { version: 1, optionIds: [1] });
    expect(res.status).toBe(400);
  });
});
