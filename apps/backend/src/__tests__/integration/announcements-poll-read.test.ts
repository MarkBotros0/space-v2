import request from "supertest";

import { createApp } from "../../app";
import { announcementDetailSchema } from "../../../../../packages/shared/src/index";
import {
  insertPoll,
  insertPost,
  insertVote,
  seedAnnouncementFixtures,
  type AnnouncementFixtures,
} from "./announcements-setup";
import { cleanupTestData } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();
let f: AnnouncementFixtures;
let adminPost: number;
let adminPoll: { pollId: number; optionIds: number[] };
let closedPost: number;

beforeAll(async () => {
  f = await seedAnnouncementFixtures(app);
  adminPost = await insertPost({ audience: "SEASON", seasonId: f.seasonId, authorId: f.userIds.admin });
  adminPoll = await insertPoll(adminPost, { allowsMultiple: true, labels: ["Red", "Green", "Blue"] });
  await insertPoll(f.communityId, { allowsMultiple: false, labels: ["Yes", "No"] });
  closedPost = await insertPost({ audience: "SEASON", seasonId: f.seasonId, authorId: f.userIds.superUser });
  await insertPoll(closedPost, { allowsMultiple: false, labels: ["A", "B"], closed: true });
  await insertPoll(f.finishedId, { allowsMultiple: false, labels: ["X", "Y"] });
});

afterAll(async () => {
  await cleanupTestData();
});

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function detail(id: number, token: string) {
  const res = await request(app).get(`/api/v1/announcements/${id}`).set(auth(token));
  expect(res.status).toBe(200);
  return announcementDetailSchema.parse(res.body.data);
}

describe("poll on the announcement detail", () => {
  it("hides counts from a student who has not voted, then shows them after", async () => {
    const before = (await detail(adminPost, f.tokens.student)).poll!;
    expect(before.canVote).toBe(true);
    expect(before.canManage).toBe(false);
    expect(before.voterCount).toBeNull();
    expect(before.multiPickVoters).toBeNull();
    expect(before.multiPickVotes).toBeNull();
    expect(before.canSeeNames).toBe(false);
    expect(before.options.map((o) => o.votes)).toEqual([null, null, null]);

    await insertVote(adminPoll.pollId, adminPoll.optionIds[0]!, f.userIds.student);
    const after = (await detail(adminPost, f.tokens.student)).poll!;
    expect(after.myOptionIds).toEqual([adminPoll.optionIds[0]]);
    expect(after.voterCount).toBe(1);
    expect(after.options.map((o) => o.votes)).toEqual([1, 0, 0]);
    expect(after.multiPickVoters).toBeNull();
    expect(after.multiPickVotes).toBeNull();
  });

  it("gives the admin author counts and multiPickVoters without voting", async () => {
    await insertVote(adminPoll.pollId, adminPoll.optionIds[1]!, f.userIds.student);
    const poll = (await detail(adminPost, f.tokens.admin)).poll!;
    expect(poll.canManage).toBe(true);
    expect(poll.canVote).toBe(true);
    expect(poll.myOptionIds).toEqual([]);
    expect(poll.voterCount).toBe(1);
    expect(poll.multiPickVoters).toBe(1);
    // The one multi-picker's two vote rows: what a several -> one edit removes.
    expect(poll.multiPickVotes).toBe(2);
    expect(poll.canSeeNames).toBe(true);
    expect(poll.options.map((o) => o.votes)).toEqual([1, 1, 0]);
  });

  it("keeps a Super from voting on a season poll but lets them manage it", async () => {
    const poll = (await detail(adminPost, f.tokens.superUser)).poll!;
    expect(poll.canVote).toBe(false);
    expect(poll.canManage).toBe(true);
  });

  it("lets a mentor vote on a community poll", async () => {
    const poll = (await detail(f.communityId, f.tokens.mentor)).poll!;
    expect(poll.canVote).toBe(true);
    expect(poll.canManage).toBe(false);
    expect(poll.voterCount).toBeNull();
  });

  it("lets a Super vote on a community poll", async () => {
    const poll = (await detail(f.communityId, f.tokens.superUser)).poll!;
    expect(poll.canVote).toBe(true);
    expect(poll.canManage).toBe(true);
  });

  it("shows counts to a non-voter once the poll is closed", async () => {
    const poll = (await detail(closedPost, f.tokens.student)).poll!;
    expect(poll.closed).toBe(true);
    expect(poll.canVote).toBe(false);
    expect(poll.voterCount).toBe(0);
    expect(poll.options.map((o) => o.votes)).toEqual([0, 0]);
  });

  it("reads a finished season's poll as closed and unmanageable", async () => {
    const poll = (await detail(f.finishedId, f.tokens.finishedStudent)).poll!;
    expect(poll.closed).toBe(true);
    expect(poll.canVote).toBe(false);
    expect(poll.canManage).toBe(false);
    expect(poll.voterCount).toBe(0);
    const asSuper = (await detail(f.finishedId, f.tokens.superUser)).poll!;
    expect(asSuper.canManage).toBe(false);
    expect(asSuper.multiPickVotes).toBeNull();
    // Spec: a finished season's poll, Supers see names; nobody else does.
    expect(asSuper.canSeeNames).toBe(true);
    expect(poll.canSeeNames).toBe(false);
  });

  it("gives a post without a poll poll: null", async () => {
    const d = await detail(f.liveId, f.tokens.student);
    expect(d.poll).toBeNull();
    expect(d.hasPoll).toBe(false);
  });
});

describe("poll flags on the feed", () => {
  it("marks poll posts with hasPoll and pollClosed", async () => {
    const res = await request(app).get("/api/v1/announcements").set(auth(f.tokens.student));
    expect(res.status).toBe(200);
    const byId = new Map(
      (res.body.data.items as { id: number; hasPoll: boolean; pollClosed: boolean | null }[]).map((i) => [i.id, i]),
    );
    expect(byId.get(adminPost)).toMatchObject({ hasPoll: true, pollClosed: false });
    expect(byId.get(closedPost)).toMatchObject({ hasPoll: true, pollClosed: true });
    expect(byId.get(f.liveId)).toMatchObject({ hasPoll: false, pollClosed: null });
  });
});
