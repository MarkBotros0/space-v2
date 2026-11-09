// Creating a season post notifies its people: push is stubbed so a run never
// reaches a real phone.
const mockSendPush = jest.fn().mockResolvedValue(undefined);
jest.mock("../../lib/push", () => ({
  ...jest.requireActual("../../lib/push"),
  sendPushToUsers: (...args: unknown[]) => mockSendPush(...args),
}));

import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { announcementDetailSchema } from "../../../../../packages/shared/src/index";
import {
  insertPoll,
  insertPost,
  insertVote,
  seedAnnouncementFixtures,
  type AnnouncementFixtures,
} from "./announcements-setup";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();
let f: AnnouncementFixtures;
let draftSeasonId: number;
let draftAdminToken: string;
/** Extra voters, so a test can hold several people's votes. */
let voterIds: number[];

const as = (token: string) => ({ authorization: `Bearer ${token}` });
const create = (token: string, body: object) => request(app).post("/api/v1/announcements").set(as(token)).send(body);
const patch = (id: number, body: object) =>
  request(app).patch(`/api/v1/announcements/${id}`).set(as(f.tokens.admin)).send(body);

beforeAll(async () => {
  f = await seedAnnouncementFixtures(app);
  draftSeasonId = (await createTestSeason({ status: "DRAFT" })).id;
  const draftAdmin = await createTestUser("pollwritedraft", "ADMIN");
  await db.seasonAdmin.create({ data: { seasonId: draftSeasonId, userId: draftAdmin.id } });
  draftAdminToken = await login(app, draftAdmin.email);
  voterIds = [];
  for (let i = 0; i < 3; i++) voterIds.push((await createTestUser(`pollwritevoter${i}`, "STUDENT")).id);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

/** A fresh season post by the admin with its own poll. */
async function seasonPoll(allowsMultiple: boolean, labels = ["Sat", "Sun", "Mon"]) {
  const postId = await insertPost({ audience: "SEASON", seasonId: f.seasonId, authorId: f.userIds.admin });
  return { postId, ...(await insertPoll(postId, { allowsMultiple, labels })) };
}

async function pollState(pollId: number) {
  const poll = await db.announcementPoll.findUnique({
    where: { id: pollId },
    select: {
      version: true,
      allowsMultiple: true,
      options: { orderBy: { position: "asc" }, select: { id: true, label: true } },
    },
  });
  const votes = await db.announcementPollVote.findMany({
    where: { pollId },
    select: { optionId: true, userId: true },
    orderBy: [{ optionId: "asc" }, { userId: "asc" }],
  });
  return { poll, votes };
}

const BODY = "A post with a poll.";

describe("POST /announcements with a poll", () => {
  it("creates the post and its poll at version 1, options in order", async () => {
    const res = await create(f.tokens.admin, {
      audience: "SEASON",
      seasonId: f.seasonId,
      body: BODY,
      poll: { allowsMultiple: true, options: [{ label: " Sat " }, { label: "Sun" }, { label: "Mon" }] },
    });
    expect(res.status).toBe(201);
    const d = announcementDetailSchema.parse(res.body.data);
    expect(d.poll).toMatchObject({ version: 1, allowsMultiple: true, closed: false });
    expect(d.poll!.options.map((o) => o.label)).toEqual(["Sat", "Sun", "Mon"]);
    const options = await db.announcementPollOption.findMany({
      where: { poll: { announcementId: d.id } },
      orderBy: { position: "asc" },
      select: { label: true, position: true },
    });
    expect(options).toEqual([
      { label: "Sat", position: 0 },
      { label: "Sun", position: 1 },
      { label: "Mon", position: 2 },
    ]);
  });

  it("refuses a draft season with season_draft and leaves no rows", async () => {
    const before = await db.announcementPoll.count();
    const res = await create(draftAdminToken, {
      audience: "SEASON",
      seasonId: draftSeasonId,
      body: BODY,
      poll: { allowsMultiple: false, options: [{ label: "A" }, { label: "B" }] },
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("season_draft");
    expect(await db.announcement.count({ where: { seasonId: draftSeasonId } })).toBe(0);
    expect(await db.announcementPoll.count()).toBe(before);
  });

  it("refuses duplicate labels ignoring case and spaces", async () => {
    const res = await create(f.tokens.admin, {
      audience: "SEASON",
      seasonId: f.seasonId,
      body: BODY,
      poll: { allowsMultiple: false, options: [{ label: "Sat" }, { label: " sat " }] },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
  });
});

describe("PATCH /announcements/:id with a poll", () => {
  it("renaming keeps the votes and bumps the version", async () => {
    const p = await seasonPoll(false);
    await insertVote(p.pollId, p.optionIds[0]!, voterIds[0]!);
    const res = await patch(p.postId, {
      body: BODY,
      poll: {
        allowsMultiple: false,
        options: [
          { id: p.optionIds[0], label: "Saturday" },
          { id: p.optionIds[1], label: "Sun" },
          { id: p.optionIds[2], label: "Mon" },
        ],
      },
    });
    expect(res.status).toBe(200);
    expect(res.body.data.poll.version).toBe(2);
    expect(res.body.data.editedAt).not.toBeNull();
    const s = await pollState(p.pollId);
    expect(s.poll!.version).toBe(2);
    expect(s.poll!.options.map((o) => o.label)).toEqual(["Saturday", "Sun", "Mon"]);
    expect(s.votes).toEqual([{ optionId: p.optionIds[0], userId: voterIds[0] }]);
  });

  it("removing a voted option needs confirmVoteLoss: 409 with the count, then 200", async () => {
    const p = await seasonPoll(false);
    await insertVote(p.pollId, p.optionIds[1]!, voterIds[0]!);
    await insertVote(p.pollId, p.optionIds[1]!, voterIds[1]!);
    await insertVote(p.pollId, p.optionIds[0]!, voterIds[2]!);
    const edit = {
      body: BODY,
      poll: {
        allowsMultiple: false,
        options: [
          { id: p.optionIds[0], label: "Sat" },
          { id: p.optionIds[2], label: "Mon" },
        ],
      },
    };
    const before = await pollState(p.pollId);
    const refused = await patch(p.postId, edit);
    expect(refused.status).toBe(409);
    expect(refused.body).toEqual({
      error: { code: "poll_votes_lost", message: expect.any(String) },
      votes: 2,
    });
    expect(await pollState(p.pollId)).toEqual(before);
    expect((await db.announcement.findUnique({ where: { id: p.postId } }))!.editedAt).toBeNull();

    const ok = await patch(p.postId, { ...edit, confirmVoteLoss: true });
    expect(ok.status).toBe(200);
    const after = await pollState(p.pollId);
    expect(after.poll!.options.map((o) => o.id)).toEqual([p.optionIds[0], p.optionIds[2]]);
    expect(after.poll!.version).toBe(2);
    expect(after.votes).toEqual([{ optionId: p.optionIds[0], userId: voterIds[2] }]);
  });

  it("poll: null with votes needs confirmVoteLoss, then removes the poll", async () => {
    const p = await seasonPoll(false);
    await insertVote(p.pollId, p.optionIds[0]!, voterIds[0]!);
    const refused = await patch(p.postId, { body: BODY, poll: null });
    expect(refused.status).toBe(409);
    expect(refused.body.votes).toBe(1);
    expect(await db.announcementPoll.count({ where: { id: p.pollId } })).toBe(1);

    const ok = await patch(p.postId, { body: BODY, poll: null, confirmVoteLoss: true });
    expect(ok.status).toBe(200);
    expect(ok.body.data.poll).toBeNull();
    expect(await db.announcementPoll.count({ where: { id: p.pollId } })).toBe(0);
    expect(await db.announcementPollVote.count({ where: { pollId: p.pollId } })).toBe(0);
  });

  it("several -> one drops only the multi-pickers' votes", async () => {
    const p = await seasonPoll(true);
    await insertVote(p.pollId, p.optionIds[0]!, voterIds[0]!);
    await insertVote(p.pollId, p.optionIds[1]!, voterIds[0]!);
    await insertVote(p.pollId, p.optionIds[2]!, voterIds[1]!);
    const edit = {
      body: BODY,
      poll: { allowsMultiple: false, options: p.optionIds.map((id, i) => ({ id, label: ["Sat", "Sun", "Mon"][i] })) },
    };
    const refused = await patch(p.postId, edit);
    expect(refused.status).toBe(409);
    expect(refused.body.votes).toBe(2);
    const ok = await patch(p.postId, { ...edit, confirmVoteLoss: true });
    expect(ok.status).toBe(200);
    expect((await pollState(p.pollId)).votes).toEqual([{ optionId: p.optionIds[2], userId: voterIds[1] }]);
  });

  it("a body-only PATCH leaves the votes and the version alone", async () => {
    const p = await seasonPoll(false);
    await insertVote(p.pollId, p.optionIds[0]!, voterIds[0]!);
    const before = await pollState(p.pollId);
    const res = await patch(p.postId, { body: "Only the message changed." });
    expect(res.status).toBe(200);
    expect(res.body.data.editedAt).not.toBeNull();
    expect(await pollState(p.pollId)).toEqual(before);
  });

  it("an identical poll leaves the version alone", async () => {
    const p = await seasonPoll(false, ["A", "B"]);
    const res = await patch(p.postId, {
      body: BODY,
      poll: {
        allowsMultiple: false,
        options: [
          { id: p.optionIds[0], label: "A" },
          { id: p.optionIds[1], label: "B" },
        ],
      },
    });
    expect(res.status).toBe(200);
    expect((await pollState(p.pollId)).poll!.version).toBe(1);
  });

  it("adds a poll to a plain post", async () => {
    const postId = await insertPost({ audience: "SEASON", seasonId: f.seasonId, authorId: f.userIds.admin });
    const res = await patch(postId, {
      body: BODY,
      poll: { allowsMultiple: false, options: [{ label: "Yes" }, { label: "No" }] },
    });
    expect(res.status).toBe(200);
    expect(res.body.data.poll).toMatchObject({ version: 1, allowsMultiple: false });
    expect(res.body.data.poll.options.map((o: { label: string }) => o.label)).toEqual(["Yes", "No"]);
  });

  it("refuses an option id from another poll with 400", async () => {
    const p = await seasonPoll(false, ["A", "B"]);
    const other = await seasonPoll(false, ["X", "Y"]);
    const before = await pollState(p.pollId);
    const otherBefore = await pollState(other.pollId);
    const res = await patch(p.postId, {
      body: BODY,
      poll: {
        allowsMultiple: false,
        options: [
          { id: p.optionIds[0], label: "A" },
          { id: other.optionIds[0], label: "B" },
        ],
      },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
    expect(await pollState(p.pollId)).toEqual(before);
    expect(await pollState(other.pollId)).toEqual(otherBefore);
  });

  it("refuses duplicate labels with 400", async () => {
    const p = await seasonPoll(false, ["A", "B"]);
    const res = await patch(p.postId, {
      body: BODY,
      poll: { allowsMultiple: false, options: [{ id: p.optionIds[0], label: "Sat" }, { label: " sat " }] },
    });
    expect(res.status).toBe(400);
  });

  it("an edit removing A and a vote for A at the old version end consistent", async () => {
    // Raced several times on fresh polls, so either order may come first.
    for (let round = 0; round < 5; round++) {
      const p = await seasonPoll(false, ["A", "B"]);
      await insertVote(p.pollId, p.optionIds[0]!, voterIds[0]!);
      const [edit, voteRes] = await Promise.all([
        patch(p.postId, {
          body: BODY,
          confirmVoteLoss: true,
          poll: { allowsMultiple: false, options: [{ id: p.optionIds[1], label: "B" }, { label: "C" }] },
        }),
        request(app)
          .put(`/api/v1/announcements/${p.postId}/poll/vote`)
          .set(as(f.tokens.student))
          .send({ version: 1, optionIds: [p.optionIds[0]] }),
      ]);
      expect(edit.status).toBe(200);
      // No vote row points at an option that no longer exists.
      const after = await pollState(p.pollId);
      const optionIds = new Set(after.poll!.options.map((o) => o.id));
      expect(after.votes.every((v) => optionIds.has(v.optionId))).toBe(true);
      expect(after.votes).toEqual([]);
      expect(after.poll!.version).toBe(2);
      // Either the vote went first (and was removed with A, so the student holds nothing),
      // or it met the new version and was refused.
      if (voteRes.status !== 200) {
        expect(voteRes.status).toBe(409);
        expect(voteRes.body.error.code).toBe("poll_changed");
      }
    }
  });
});
