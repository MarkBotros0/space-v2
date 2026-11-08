// A community post reaches every account in the database: push is stubbed so a
// run against a shared database never sends a real notification to a phone.
const mockSendPush = jest.fn().mockResolvedValue(undefined);
jest.mock("../../lib/push", () => ({
  ...jest.requireActual("../../lib/push"),
  sendPushToUsers: (...args: unknown[]) => mockSendPush(...args),
}));

import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { announcementRecipients } from "../../lib/announcement-notifications";
import { cleanupTestData, createTestSeason, createTestUser, login, testEventTitle } from "./fixtures";
import { insertPost, seedAnnouncementFixtures, type AnnouncementFixtures } from "./announcements-setup";

jest.setTimeout(60000);

const app = createApp();
let f: AnnouncementFixtures;
let draftSeasonId: number;
let draftAdminToken: string;

const as = (token: string) => ({ authorization: `Bearer ${token}` });
const post = (token: string, body: object) =>
  request(app).post("/api/v1/announcements").set(as(token)).send(body);
const seasonBody = (seasonId: number, extra: object = {}) => ({
  audience: "SEASON",
  seasonId,
  title: testEventTitle("write"),
  body: "  Hello class.  ",
  ...extra,
});

beforeAll(async () => {
  f = await seedAnnouncementFixtures(app);
  draftSeasonId = (await createTestSeason({ status: "DRAFT" })).id;
  // An admin serving in an ACTIVE season has no access to a draft (scopes.ts), so the draft needs its own admin.
  const draftAdmin = await createTestUser("newsdraftadmin", "ADMIN");
  await db.seasonAdmin.create({ data: { seasonId: draftSeasonId, userId: draftAdmin.id } });
  draftAdminToken = await login(app, draftAdmin.email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("POST /announcements", () => {
  it("admin posts to own active season", async () => {
    const res = await post(f.tokens.admin, seasonBody(f.seasonId));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      audience: "SEASON",
      seasonId: f.seasonId,
      body: "Hello class.",
      canEdit: true,
      canDelete: true,
      editedAt: null,
    });
  });

  it("super posts to the community", async () => {
    const res = await post(f.tokens.superUser, {
      audience: "COMMUNITY",
      title: testEventTitle("write"),
      body: "All hands.",
    });
    expect(res.status).toBe(201);
    expect(res.body.data.audience).toBe("COMMUNITY");
  });

  it("admin cannot post to community", async () => {
    const res = await post(f.tokens.admin, { audience: "COMMUNITY", title: "t", body: "b" });
    expect(res.status).toBe(403);
  });

  it("admin cannot post to another season", async () => {
    const res = await post(f.tokens.admin, seasonBody(f.otherSeasonId));
    expect(res.status).toBe(403);
  });

  it("leader and student cannot post", async () => {
    expect((await post(f.tokens.leader, seasonBody(f.seasonId))).status).toBe(403);
    expect((await post(f.tokens.student, seasonBody(f.seasonId))).status).toBe(403);
    expect((await post(f.tokens.mentor, { audience: "COMMUNITY", title: "t", body: "b" })).status).toBe(403);
  });

  it("invalid body is 400, unknown season 404", async () => {
    expect((await post(f.tokens.admin, { audience: "SEASON", title: "  ", body: "b", seasonId: f.seasonId })).status).toBe(400);
    expect((await post(f.tokens.superUser, seasonBody(999999999))).status).toBe(404);
  });

  it("draft season refused season_draft", async () => {
    const res = await post(draftAdminToken, seasonBody(draftSeasonId));
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({ code: "season_draft", message: "This season hasn't started yet." });
  });

  it("finished season refused season_finished", async () => {
    const res = await post(f.tokens.superUser, seasonBody(f.finishedSeasonId));
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({ code: "season_finished", message: "This season has finished." });
  });

  it("an outsider learns nothing about a draft season (403, not 409)", async () => {
    expect((await post(f.tokens.leader, seasonBody(draftSeasonId))).status).toBe(403);
  });
});

describe("PATCH and DELETE /announcements/:id", () => {
  let id: number;
  beforeAll(async () => {
    id = (await post(f.tokens.admin, seasonBody(f.seasonId))).body.data.id;
  });

  it("author edits, editedAt set, audience unchanged", async () => {
    const res = await request(app)
      .patch(`/api/v1/announcements/${id}`)
      .set(as(f.tokens.admin))
      .send({ title: testEventTitle("edited") });
    expect(res.status).toBe(200);
    expect(res.body.data.editedAt).not.toBeNull();
    expect(res.body.data.audience).toBe("SEASON");
    expect(res.body.data.seasonId).toBe(f.seasonId);
    const bad = await request(app)
      .patch(`/api/v1/announcements/${id}`)
      .set(as(f.tokens.admin))
      .send({ audience: "COMMUNITY" });
    expect(bad.status).toBe(400);
  });

  it("student who can read it cannot edit or delete; unreadable is 404", async () => {
    const e = await request(app).patch(`/api/v1/announcements/${id}`).set(as(f.tokens.student)).send({ body: "x" });
    expect(e.status).toBe(403);
    const d = await request(app).delete(`/api/v1/announcements/${id}`).set(as(f.tokens.student));
    expect(d.status).toBe(403);
    const hidden = await request(app).patch(`/api/v1/announcements/${id}`).set(as(f.tokens.otherStudent)).send({ body: "x" });
    expect(hidden.status).toBe(404);
  });

  it("former admin cannot edit", async () => {
    const author = await createTestUser("newsdemoted", "ADMIN");
    await db.seasonAdmin.create({ data: { seasonId: f.seasonId, userId: author.id } });
    const t1 = await login(app, author.email);
    const own = (await post(t1, seasonBody(f.seasonId))).body.data.id as number;
    await db.seasonAdmin.deleteMany({ where: { userId: author.id } });
    await db.studentProfile.create({ data: { userId: author.id } });
    await db.seasonEnrollment.create({ data: { seasonId: f.seasonId, studentUserId: author.id, status: "ACTIVE" } });
    const t2 = await login(app, author.email);
    const res = await request(app).patch(`/api/v1/announcements/${own}`).set(as(t2)).send({ body: "x" });
    expect(res.status).toBe(403);
    const detail = await request(app).get(`/api/v1/announcements/${own}`).set(as(t2));
    expect(detail.body.data).toMatchObject({ canEdit: false, canDelete: false });
  });

  it("nobody edits a finished season's post, super included", async () => {
    const res = await request(app)
      .patch(`/api/v1/announcements/${f.finishedId}`)
      .set(as(f.tokens.superUser))
      .send({ body: "x" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("season_finished");
  });

  it("super deletes a finished season's post, its author cannot", async () => {
    const author = await createTestUser("newsfinauthor", "STUDENT");
    await db.studentProfile.create({ data: { userId: author.id } });
    await db.seasonEnrollment.create({ data: { seasonId: f.finishedSeasonId, studentUserId: author.id, status: "COMPLETED" } });
    const authored = await insertPost({ audience: "SEASON", seasonId: f.finishedSeasonId, authorId: author.id });
    const t = await login(app, author.email);
    const denied = await request(app).delete(`/api/v1/announcements/${authored}`).set(as(t));
    expect(denied.status).toBe(403);
    const ok = await request(app).delete(`/api/v1/announcements/${authored}`).set(as(f.tokens.superUser));
    expect(ok.status).toBe(204);
    expect(await db.announcement.findUnique({ where: { id: authored } })).toBeNull();
  });

  it("author deletes own live post; the detail flags match", async () => {
    const detail = await request(app).get(`/api/v1/announcements/${f.finishedId}`).set(as(f.tokens.superUser));
    expect(detail.body.data).toMatchObject({ canEdit: false, canDelete: true, seasonFinished: true });
    const res = await request(app).delete(`/api/v1/announcements/${id}`).set(as(f.tokens.admin));
    expect(res.status).toBe(204);
    expect((await request(app).delete(`/api/v1/announcements/${id}`).set(as(f.tokens.admin))).status).toBe(404);
  });
});

describe("GET /announcements/targets", () => {
  it("super sees community and active seasons, admin sees own season, student sees none", async () => {
    const sup = await request(app).get("/api/v1/announcements/targets").set(as(f.tokens.superUser));
    expect(sup.status).toBe(200);
    expect(sup.body.data.community).toBe(true);
    const ids = sup.body.data.seasons.map((s: { id: number }) => s.id);
    expect(ids).toEqual(expect.arrayContaining([f.seasonId, f.otherSeasonId]));
    expect(ids).not.toContain(f.finishedSeasonId);
    expect(ids).not.toContain(draftSeasonId);
    const mine = sup.body.data.seasons.find((s: { id: number }) => s.id === f.seasonId);
    expect(mine.reach).toBe((await announcementRecipients({ audience: "SEASON", seasonId: f.seasonId }, f.userIds.superUser)).length);
    expect(sup.body.data.communityReach).toBe((await announcementRecipients({ audience: "COMMUNITY" }, f.userIds.superUser)).length);

    const adm = await request(app).get("/api/v1/announcements/targets").set(as(f.tokens.admin));
    expect(adm.body.data.community).toBe(false);
    expect(adm.body.data.communityReach).toBe(0);
    expect(adm.body.data.seasons.map((s: { id: number }) => s.id)).toEqual([f.seasonId]);

    const stu = await request(app).get("/api/v1/announcements/targets").set(as(f.tokens.student));
    expect(stu.body.data).toEqual({ community: false, communityReach: 0, seasons: [] });
  });
});
