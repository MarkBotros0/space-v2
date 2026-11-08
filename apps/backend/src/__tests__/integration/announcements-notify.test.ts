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
import { cleanupTestData, createTestUser, login, testEventTitle } from "./fixtures";
import { seedAnnouncementFixtures, type AnnouncementFixtures } from "./announcements-setup";

jest.setTimeout(60000);

const app = createApp();
let f: AnnouncementFixtures;
let mentorId: number;
let leaderId: number;
let droppedId: number;
let finishedStudentId: number;
let studentIds: number[];

const as = (token: string) => ({ authorization: `Bearer ${token}` });

const rowsFor = (userId: number, postId: number) =>
  db.notification.count({ where: { userId, type: "ANNOUNCEMENT", link: `/announcements/${postId}` } });

/** The notify job runs after the response; poll for the author-visible effect. */
async function waitForRows(userId: number, postId: number, want: number) {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const n = await rowsFor(userId, postId);
    if (n >= want) return n;
    if (Date.now() > deadline) throw new Error(`no notification for user ${userId}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}
const settle = () => new Promise((r) => setTimeout(r, 400));

async function publish(token: string, body: object): Promise<number> {
  const res = await request(app).post("/api/v1/announcements").set(as(token)).send(body);
  expect(res.status).toBe(201);
  return res.body.data.id;
}

beforeAll(async () => {
  f = await seedAnnouncementFixtures(app);
  const idFor = async (label: string) =>
    (await db.user.findFirstOrThrow({ where: { email: { startsWith: `space-v2-test-${label}-` } }, select: { id: true } })).id;
  mentorId = await idFor("newsmentor");
  leaderId = await idFor("newsleader");
  droppedId = await idFor("newsdropped");
  finishedStudentId = await idFor("newsfinished");
  studentIds = [await idFor("newsstudent"), await idFor("newsalumnus")];
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("announcement notifications", () => {
  it("season post notifies live students, admins and leaders, not the author, super, mentor, dropped or finished-season people", async () => {
    const author = await createTestUser("newsauthor2", "ADMIN");
    await db.seasonAdmin.create({ data: { seasonId: f.seasonId, userId: author.id } });
    const token = await login(app, author.email);
    const id = await publish(token, { audience: "SEASON", seasonId: f.seasonId, title: testEventTitle("n1"), body: "Bring a pen." });
    await waitForRows(studentIds[0]!, id, 1);
    await settle();
    for (const uid of [...studentIds, leaderId, f.userIds.admin]) expect(await rowsFor(uid, id)).toBe(1);
    for (const uid of [author.id, f.userIds.superUser, mentorId, droppedId, finishedStudentId]) {
      expect(await rowsFor(uid, id)).toBe(0);
    }
    const row = await db.notification.findFirstOrThrow({ where: { userId: studentIds[0], link: `/announcements/${id}` } });
    expect(row).toMatchObject({ type: "ANNOUNCEMENT", body: "Bring a pen." });
  });

  it("community post notifies a test student and the mentor but not the author", async () => {
    const long = "x".repeat(300);
    const id = await publish(f.tokens.superUser, { audience: "COMMUNITY", title: testEventTitle("n2"), body: long });
    await waitForRows(mentorId, id, 1);
    await settle();
    expect(await rowsFor(studentIds[0]!, id)).toBe(1);
    expect(await rowsFor(mentorId, id)).toBe(1);
    expect(await rowsFor(f.userIds.superUser, id)).toBe(0);
    const row = await db.notification.findFirstOrThrow({ where: { userId: mentorId, link: `/announcements/${id}` } });
    expect(row.body).toBe("x".repeat(120));
  });

  it("turned-off announcement preference still writes the row", async () => {
    await db.notificationPreference.upsert({
      where: { userId: studentIds[0]! },
      create: { userId: studentIds[0]!, announcement: false },
      update: { announcement: false },
    });
    const id = await publish(f.tokens.superUser, { audience: "SEASON", seasonId: f.seasonId, title: testEventTitle("n3"), body: "Quiet." });
    await waitForRows(studentIds[0]!, id, 1);
    expect(await rowsFor(studentIds[0]!, id)).toBe(1);
  });

  it("edit sends nothing new", async () => {
    const id = await publish(f.tokens.superUser, { audience: "SEASON", seasonId: f.seasonId, title: testEventTitle("n4"), body: "Once." });
    await waitForRows(studentIds[0]!, id, 1);
    await settle();
    const before = await db.notification.count({ where: { link: `/announcements/${id}` } });
    const res = await request(app).patch(`/api/v1/announcements/${id}`).set(as(f.tokens.superUser)).send({ body: "Twice." });
    expect(res.status).toBe(200);
    await settle();
    expect(await db.notification.count({ where: { link: `/announcements/${id}` } })).toBe(before);
  });

  it("notification target parses to announcement id", async () => {
    const id = await publish(f.tokens.superUser, { audience: "SEASON", seasonId: f.seasonId, title: testEventTitle("n5"), body: "Look." });
    await waitForRows(studentIds[0]!, id, 1);
    const res = await request(app).get("/api/v1/notifications").set(as(f.tokens.student));
    expect(res.status).toBe(200);
    const item = res.body.data.items.find((n: { link: string }) => n.link === `/announcements/${id}`);
    expect(item.target).toEqual({ entityType: "announcement", entityId: id });
  });
});
