// A mentor's follow-ups and the daily reminder (owner, 2026-11-07).
const mockSendPush = jest.fn().mockResolvedValue(undefined);
jest.mock("../../lib/push", () => ({
  ...jest.requireActual("../../lib/push"),
  sendPushToUsers: (...args: unknown[]) => mockSendPush(...args),
}));

import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { config } from "../../lib/config";
import { cleanupTestData, createTestUser, login } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();
const SECRET = "test-cron-secret-0123456789";

let mentorId: number;
let mentorToken: string;
let otherMentorToken: string;
let superToken: string;
let studentId: number;
let student2Id: number;

const remind = (auth?: string) => {
  const r = request(app).get("/api/v1/internal/follow-ups/remind");
  return auth ? r.set("authorization", auth) : r;
};
const reminders = (userId: number) => db.notification.count({ where: { userId, type: "MENTOR_FOLLOWUP" } });

beforeAll(async () => {
  await cleanupTestData();
  const mentor = await createTestUser("fu-mentor", "MENTOR");
  const other = await createTestUser("fu-mentor-2", "MENTOR");
  const sup = await createTestUser("fu-super", "SUPER");
  studentId = (await createTestUser("fu-student", "STUDENT")).id;
  student2Id = (await createTestUser("fu-student-2", "STUDENT")).id;
  mentorId = mentor.id;
  mentorToken = await login(app, mentor.email);
  otherMentorToken = await login(app, other.email);
  superToken = await login(app, sup.email);
});

afterAll(async () => {
  (config as { cronSecret?: string }).cronSecret = undefined;
  await cleanupTestData();
  await db.$disconnect();
});

describe("follow-ups", () => {
  let followUpId: number;

  it("lets a mentor flag a student, due in 7 days", async () => {
    const res = await request(app)
      .post(`/api/v1/students/${studentId}/follow-ups`)
      .set("authorization", `Bearer ${mentorToken}`)
      .send({ reason: "  Check in after the exam  " });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ studentUserId: studentId, reason: "Check in after the exam", doneAt: null });
    const created = new Date(res.body.data.createdAt).getTime();
    expect(new Date(res.body.data.dueAt).getTime() - created).toBe(7 * 86_400_000);
    followUpId = res.body.data.id;
  });

  it("refuses a second open one for the same student (409), and anyone but a mentor (403)", async () => {
    const again = await request(app)
      .post(`/api/v1/students/${studentId}/follow-ups`)
      .set("authorization", `Bearer ${mentorToken}`)
      .send({});
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("already_following_up");
    const sup = await request(app)
      .post(`/api/v1/students/${studentId}/follow-ups`)
      .set("authorization", `Bearer ${superToken}`)
      .send({});
    expect(sup.status).toBe(403);
  });

  it("lists only the mentor's own", async () => {
    const mine = await request(app).get("/api/v1/follow-ups").set("authorization", `Bearer ${mentorToken}`);
    expect(mine.body.data.followUps.map((f: { id: number }) => f.id)).toEqual([followUpId]);
    const theirs = await request(app).get("/api/v1/follow-ups").set("authorization", `Bearer ${otherMentorToken}`);
    expect(theirs.body.data.followUps).toEqual([]);
    const done = await request(app)
      .post(`/api/v1/follow-ups/${followUpId}/done`)
      .set("authorization", `Bearer ${otherMentorToken}`);
    expect(done.status).toBe(404);
  });

  it("the reminder is a 404 with no CRON_SECRET, and 401 with a wrong one", async () => {
    (config as { cronSecret?: string }).cronSecret = undefined;
    expect((await remind(`Bearer ${SECRET}`)).status).toBe(404);
    (config as { cronSecret?: string }).cronSecret = SECRET;
    expect((await remind("Bearer nope")).status).toBe(401);
    expect((await remind()).status).toBe(401);
  });

  it("sends nothing before 7 days, then exactly one reminder to that mentor", async () => {
    (config as { cronSecret?: string }).cronSecret = SECRET;
    const before = await reminders(mentorId);
    await remind(`Bearer ${SECRET}`);
    expect(await reminders(mentorId)).toBe(before);

    await db.mentorFollowUp.update({ where: { id: followUpId }, data: { dueAt: new Date(Date.now() - 1000) } });
    const first = await remind(`Bearer ${SECRET}`);
    expect(first.status).toBe(200);
    expect(await reminders(mentorId)).toBe(before + 1);
    await remind(`Bearer ${SECRET}`);
    expect(await reminders(mentorId)).toBe(before + 1);

    const note = await db.notification.findFirst({
      where: { userId: mentorId, type: "MENTOR_FOLLOWUP" },
      orderBy: { id: "desc" },
    });
    expect(note).toMatchObject({ title: "Follow up with Test fu-student", body: "Check in after the exam" });
  });

  it("stays open until marked done, and a done one can be flagged again", async () => {
    const list = await request(app).get("/api/v1/follow-ups").set("authorization", `Bearer ${mentorToken}`);
    expect(list.body.data.followUps[0]).toMatchObject({ id: followUpId, doneAt: null });

    const done = await request(app)
      .post(`/api/v1/follow-ups/${followUpId}/done`)
      .set("authorization", `Bearer ${mentorToken}`);
    expect(done.status).toBe(200);
    expect(done.body.data.doneAt).not.toBeNull();

    const again = await request(app)
      .post(`/api/v1/students/${studentId}/follow-ups`)
      .set("authorization", `Bearer ${mentorToken}`)
      .send({});
    expect(again.status).toBe(201);
  });

  it("counts due follow-ups on the mentor's Home", async () => {
    const res = await request(app)
      .post(`/api/v1/students/${student2Id}/follow-ups`)
      .set("authorization", `Bearer ${mentorToken}`)
      .send({});
    await db.mentorFollowUp.update({ where: { id: res.body.data.id }, data: { dueAt: new Date(Date.now() - 1000) } });
    const summary = await request(app).get("/api/v1/me/mentor-summary").set("authorization", `Bearer ${mentorToken}`);
    expect(summary.status).toBe(200);
    expect(summary.body.data.followUpsDue).toBe(1);
    expect(typeof summary.body.data.students).toBe("number");
    const sup = await request(app).get("/api/v1/me/mentor-summary").set("authorization", `Bearer ${superToken}`);
    expect(sup.status).toBe(403);
  });
});
