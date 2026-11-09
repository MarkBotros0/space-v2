import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import {
  announcementDetailSchema,
  pollVotersResponseSchema,
} from "../../../../../packages/shared/src/index";
import {
  insertPoll,
  insertPost,
  insertVote,
  seedAnnouncementFixtures,
  type AnnouncementFixtures,
} from "./announcements-setup";
import { cleanupTestData, createTestUser } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();
let f: AnnouncementFixtures;

beforeAll(async () => {
  f = await seedAnnouncementFixtures(app);
});

afterAll(async () => {
  await cleanupTestData();
});

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function poll(seasonId: number, opts: { closed?: boolean } = {}) {
  const postId = await insertPost({ audience: "SEASON", seasonId, authorId: f.userIds.admin });
  return { postId, ...(await insertPoll(postId, { allowsMultiple: true, labels: ["A", "B"], ...opts })) };
}
const post = (path: string, id: number, token: string) =>
  request(app).post(`/api/v1/announcements/${id}/poll/${path}`).set(auth(token)).send({});
const voters = (id: number, token: string) =>
  request(app).get(`/api/v1/announcements/${id}/poll/voters`).set(auth(token));

describe("POST /announcements/:id/poll/close and reopen", () => {
  it("closes and reopens as the author, leaving editedAt and version, sending nothing", async () => {
    const p = await poll(f.seasonId);
    const before = await db.notification.count();
    const res = await post("close", p.postId, f.tokens.admin);
    expect(res.status).toBe(200);
    const d = announcementDetailSchema.parse(res.body.data);
    expect(d.poll!.closed).toBe(true);
    expect(d.editedAt).toBeNull();
    const row = await db.announcementPoll.findUniqueOrThrow({ where: { id: p.pollId } });
    expect(row.closedAt).not.toBeNull();
    expect(row.closedById).toBe(f.userIds.admin);
    expect(row.version).toBe(1);
    // Closing twice is fine.
    expect((await post("close", p.postId, f.tokens.admin)).status).toBe(200);

    const re = await post("reopen", p.postId, f.tokens.admin);
    expect(re.status).toBe(200);
    expect(re.body.data.poll.closed).toBe(false);
    const after = await db.announcementPoll.findUniqueOrThrow({ where: { id: p.pollId } });
    expect(after.closedAt).toBeNull();
    expect(after.closedById).toBeNull();
    // Reopening an open poll is fine.
    expect((await post("reopen", p.postId, f.tokens.admin)).status).toBe(200);
    expect(await db.notification.count()).toBe(before);
  });

  it("refuses a student with 403", async () => {
    const p = await poll(f.seasonId);
    expect((await post("close", p.postId, f.tokens.student)).status).toBe(403);
    expect((await post("reopen", p.postId, f.tokens.student)).status).toBe(403);
  });

  it("answers season_finished on a finished season's poll", async () => {
    const p = await poll(f.finishedSeasonId);
    const res = await post("close", p.postId, f.tokens.superUser);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("season_finished");
    expect((await post("reopen", p.postId, f.tokens.superUser)).status).toBe(409);
  });
});

describe("GET /announcements/:id/poll/voters", () => {
  it("lists names per option in vote order, nulls a deleted user, counts a dropped student", async () => {
    const p = await poll(f.seasonId);
    const dropped = await createTestUser("dropped-voter", "STUDENT");
    const gone = await createTestUser("gone-voter", "STUDENT");
    const enrol = await db.seasonEnrollment.create({
      data: { seasonId: f.seasonId, studentUserId: dropped.id, status: "ACTIVE" },
    });
    await insertVote(p.pollId, p.optionIds[0]!, f.userIds.student);
    await insertVote(p.pollId, p.optionIds[0]!, dropped.id);
    await insertVote(p.pollId, p.optionIds[0]!, gone.id);
    await insertVote(p.pollId, p.optionIds[1]!, f.userIds.student);
    await db.seasonEnrollment.update({ where: { id: enrol.id }, data: { status: "WITHDRAWN" } });
    await db.user.update({ where: { id: gone.id }, data: { deletedAt: new Date() } });

    const res = await voters(p.postId, f.tokens.admin);
    expect(res.status).toBe(200);
    const d = pollVotersResponseSchema.parse(res.body.data);
    expect(d.options.map((o) => o.id)).toEqual(p.optionIds);
    const names = d.options[0]!.voters.map((v) => v.name);
    expect(names).toHaveLength(3);
    expect(names[1]).toBe("Test dropped-voter");
    expect(names[2]).toBeNull();
    expect(names[0]).not.toBeNull();
    expect(d.options[1]!.voters).toHaveLength(1);
  });

  it("is 404 for a student", async () => {
    const p = await poll(f.seasonId);
    expect((await voters(p.postId, f.tokens.student)).status).toBe(404);
  });

  it("is 404 for a post without a poll", async () => {
    expect((await voters(f.liveId, f.tokens.superUser)).status).toBe(404);
  });

  it("gives the Super the list once the season has finished", async () => {
    const p = await poll(f.finishedSeasonId);
    await insertVote(p.pollId, p.optionIds[0]!, f.userIds.student);
    const res = await voters(p.postId, f.tokens.superUser);
    expect(res.status).toBe(200);
    expect(res.body.data.options[0].voters).toHaveLength(1);
  });
});

describe("DELETE /announcements/:id with a poll", () => {
  it("removes the poll, its options and its votes with the post", async () => {
    const p = await poll(f.seasonId);
    await insertVote(p.pollId, p.optionIds[0]!, f.userIds.student);
    await insertVote(p.pollId, p.optionIds[1]!, f.userIds.student);
    const res = await request(app).delete(`/api/v1/announcements/${p.postId}`).set(auth(f.tokens.admin));
    expect(res.status).toBe(204);
    expect(await db.announcement.count({ where: { id: p.postId } })).toBe(0);
    expect(await db.announcementPoll.count({ where: { id: p.pollId } })).toBe(0);
    expect(await db.announcementPollOption.count({ where: { pollId: p.pollId } })).toBe(0);
    expect(await db.announcementPollVote.count({ where: { pollId: p.pollId } })).toBe(0);
  });
});
