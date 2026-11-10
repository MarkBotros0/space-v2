import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestUser } from "./fixtures";
import {
  body,
  essayPart,
  forumPart,
  notificationsFor,
  seedAssignmentWriteFixtures,
  videoPart,
} from "./assignment-writes-setup";

// 60s: beforeAll performs many sequential writes.
jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let groupAId: number;
let superId: number;
let adminId: number;
let studentAId: number;
let studentBId: number;
let optedOutId: number;
let withdrawnId: number;
let superToken: string;
let adminToken: string;
let otherAdminToken: string;
let leaderToken: string;
let studentToken: string;

beforeAll(async () => {
  ({
    seasonId,
    groupAId,
    superId,
    adminId,
    studentAId,
    studentBId,
    optedOutId,
    withdrawnId,
    superToken,
    adminToken,
    otherAdminToken,
    leaderToken,
    studentToken,
  } = await seedAssignmentWriteFixtures(app));
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

function create(over: Record<string, unknown> = {}, token = adminToken, season = seasonId) {
  return request(app)
    .post(`/api/v1/seasons/${season}/assignments`)
    .set("authorization", `Bearer ${token}`)
    .send(body(over));
}

const noVideo = { youtubeUrl: null, youtubeId: null, durationSeconds: null, blockSkipping: false };
const noEssay = { maxWords: null, maxFileSizeMb: null, allowedMimeCategories: [] };
const forumDefaults = { postToRead: true, allowComments: false };

describe("POST /api/v1/seasons/:id/assignments", () => {
  it("creates an assignment with three parts in order", async () => {
    const res = await create({
      reminder: { enabled: true, days: 3, anchor: "DUE_DATE", time: "18:30" },
      parts: [videoPart({ blockSkipping: true }), essayPart(), forumPart({ minWords: 40, allowComments: true })],
    });

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ id: expect.any(Number) });
    const row = await db.assignment.findUnique({
      where: { id: res.body.data.id },
      select: {
        seasonId: true,
        title: true,
        description: true,
        dueAt: true,
        reminderEnabled: true,
        reminderDays: true,
        reminderAnchor: true,
        reminderTime: true,
        remindAt: true,
        createdById: true,
        updatedById: true,
        parts: {
          orderBy: { position: "asc" },
          select: {
            position: true,
            kind: true,
            title: true,
            youtubeUrl: true,
            youtubeId: true,
            durationSeconds: true,
            blockSkipping: true,
            prompt: true,
            minWords: true,
            maxWords: true,
            maxFileSizeMb: true,
            allowedMimeCategories: true,
            postToRead: true,
            allowComments: true,
          },
        },
      },
    });
    expect(row).toEqual({
      seasonId,
      title: "Week 4 reflection",
      description: "Write a page.",
      // 23:59 on 10 March, Cairo (UTC+2): composed on the server (C2).
      dueAt: new Date("2099-03-10T21:59:00.000Z"),
      reminderEnabled: true,
      reminderDays: 3,
      reminderAnchor: "DUE_DATE",
      reminderTime: "18:30",
      remindAt: null, // resolveRemindAt is Task 8's
      createdById: adminId,
      updatedById: adminId,
      parts: [
        {
          position: 0,
          kind: "VIDEO",
          title: "Watch this first",
          youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          youtubeId: "dQw4w9WgXcQ",
          durationSeconds: 600,
          blockSkipping: true,
          prompt: null,
          minWords: null,
          ...noEssay,
          ...forumDefaults,
        },
        {
          position: 1,
          kind: "ESSAY",
          title: null,
          ...noVideo,
          prompt: "What did you learn?",
          minWords: 50,
          maxWords: 500,
          maxFileSizeMb: 10,
          allowedMimeCategories: ["pdf"],
          ...forumDefaults,
        },
        {
          position: 2,
          kind: "FORUM",
          title: null,
          ...noVideo,
          prompt: "Share one idea with your group",
          minWords: 40,
          ...noEssay,
          postToRead: true,
          allowComments: true,
        },
      ],
    });
  });

  it("composes the deadline on the org clock across DST: 23:59 in May is 20:59Z (UTC+3)", async () => {
    const res = await create({ dueDay: "2099-05-01" });
    expect(res.status).toBe(201);
    const row = await db.assignment.findUnique({ where: { id: res.body.data.id }, select: { dueAt: true } });
    expect(row?.dueAt).toEqual(new Date("2099-05-01T20:59:00.000Z"));
  });

  it("refuses two forums (400) and zero parts (400), writing nothing", async () => {
    const before = await db.assignment.count({ where: { seasonId } });
    const twoForums = await create({ parts: [forumPart(), essayPart(), forumPart()] });
    expect(twoForums.status).toBe(400);
    expect(twoForums.body.error).toEqual({ code: "bad_request", message: "parts: One forum per assignment" });
    const none = await create({ parts: [] });
    expect(none.status).toBe(400);
    expect(none.body.error).toEqual({ code: "bad_request", message: "parts: Add at least one part" });
    expect(await db.assignment.count({ where: { seasonId } })).toBe(before);
  });

  it("refuses a link that isn't YouTube, a zero duration and a 161-character title", async () => {
    for (const parts of [[videoPart({ youtubeUrl: "https://vimeo.com/1" })], [videoPart({ durationSeconds: 0 })]]) {
      const res = await create({ parts });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("bad_request");
    }
    expect((await create({ title: "x".repeat(161) })).status).toBe(400);
  });

  it("refuses a reminder before the due date when there is no due date", async () => {
    const res = await create({
      dueDay: null,
      dueTime: null,
      reminder: { enabled: true, days: 2, anchor: "DUE_DATE", time: "09:00" },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("reminder.anchor: Set a due date first");
  });

  it("refuses a leader (403), and everyone else who does not administer the season", async () => {
    for (const token of [leaderToken, otherAdminToken, studentToken]) {
      const res = await create({}, token);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("forbidden");
    }
  });

  it("notifies every season participant once, with v1's link and the org-time body (X1, C2)", async () => {
    const res = await create({ title: "Everyone" });
    const id = res.body.data.id as number;
    const told = {
      title: "New assignment: Everyone",
      body: "Due Mar 10, 2099, 11:59 PM",
      link: `/student/assignments/${id}`,
    };

    expect(await notificationsFor(studentAId, id)).toEqual([told]);
    expect(await notificationsFor(studentBId, id)).toEqual([told]);
    // The opt-out suppresses outbound channels only; the in-app row is history (spec D4, Plan 13).
    expect(await notificationsFor(optedOutId, id)).toEqual([told]);
    expect(await notificationsFor(withdrawnId, id)).toEqual([]); // R61: ACTIVE only
  });

  it("omits the body with no due date", async () => {
    const res = await create({ title: "Whenever", dueDay: null, dueTime: null });
    const id = res.body.data.id as number;
    expect(await notificationsFor(studentAId, id)).toEqual([
      { title: "New assignment: Whenever", body: null, link: `/student/assignments/${id}` },
    ]);
  });

  it("notifies no deleted account, though its enrolment is still ACTIVE (Q9)", async () => {
    const gone = await createTestUser("q9-deleted-create", "STUDENT");
    await db.seasonEnrollment.create({
      data: { seasonId, studentUserId: gone.id, groupId: groupAId, status: "ACTIVE" },
    });
    await db.user.update({ where: { id: gone.id }, data: { deletedAt: new Date() } });

    const res = await create({ title: "Q9" });
    expect(await notificationsFor(gone.id, res.body.data.id as number)).toEqual([]);
    expect(await notificationsFor(studentAId, res.body.data.id as number)).toHaveLength(1);
  });

  it("lets a SUPER create in any season", async () => {
    const res = await create({}, superToken);
    expect(res.status).toBe(201);
    const row = await db.assignment.findUnique({ where: { id: res.body.data.id }, select: { createdById: true } });
    expect(row?.createdById).toBe(superId);
  });

  it("returns 400 for a bad season id and 404 for a missing season", async () => {
    const bad = await request(app)
      .post("/api/v1/seasons/abc/assignments")
      .set("authorization", `Bearer ${superToken}`)
      .send(body());
    expect(bad.status).toBe(400);
    expect((await create({}, superToken, 2147483000)).status).toBe(404);
  });
});
