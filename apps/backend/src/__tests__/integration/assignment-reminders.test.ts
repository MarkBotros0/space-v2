import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { reviewEssay } from "../../lib/assignments/essay-review";
import { sendDueAssignmentReminders } from "../../lib/assignments/reminder";
import * as notifications from "../../lib/notifications";
import { parseNotificationLink } from "../../lib/notification-target";
import { orgDaysBeforeAt } from "../../lib/org-time";
import { createAssignmentWithParts, seedTextWork, seedVideoWork, setSubmitted } from "./assignment-reads-setup";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

// 60s: beforeAll performs many sequential writes.
jest.setTimeout(60000);

const app = createApp();

let superToken: string;
let reviewerId: number;

beforeAll(async () => {
  await cleanupTestData();
  const superUser = await createTestUser("super", "SUPER");
  reviewerId = superUser.id;
  superToken = await login(app, superUser.email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

const auth = () => ({ authorization: `Bearer ${superToken}` });

/** A live season with these students' enrolments, by label; returns the season and each student's id. */
async function seasonWith(labels: Record<string, "ACTIVE" | "WITHDRAWN">) {
  const seasonId = (await createTestSeason()).id;
  const ids: Record<string, number> = {};
  for (const [label, status] of Object.entries(labels)) {
    const user = await createTestUser(`${label}-${seasonId}`, "STUDENT");
    await db.seasonEnrollment.create({ data: { seasonId, studentUserId: user.id, status } });
    ids[label] = user.id;
  }
  return { seasonId, ids };
}

function remindersFor(assignmentId: number) {
  return db.notification.findMany({
    where: { type: "ASSIGNMENT_REMINDER", link: `/student/assignments/${assignmentId}` },
    orderBy: { userId: "asc" },
    select: { userId: true, title: true, body: true },
  });
}

function stored(id: number) {
  return db.assignment.findUniqueOrThrow({ where: { id }, select: { remindAt: true, remindedAt: true } });
}

// 2099-02-12 is a Thursday; Cairo is UTC+2 in February.
const THU = "2099-02-12T16:00:00.000Z";

describe("remindAt follows the next session", () => {
  it("moves with the session, follows a new earlier one, and goes when there is none", async () => {
    const { seasonId } = await seasonWith({});
    const made = await request(app)
      .post("/api/v1/sessions")
      .set(auth())
      .send({ seasonId, title: "Week 1", startsAt: THU, durationMinutes: 90, repeatWeeks: 1 });
    expect(made.status).toBe(201);
    const sessionId = made.body.data.id as number;

    const created = await request(app)
      .post(`/api/v1/seasons/${seasonId}/assignments`)
      .set(auth())
      .send({
        title: "The Prodigal Son",
        description: null,
        dueDay: null,
        dueTime: null,
        reminder: { enabled: true, days: 2, anchor: "NEXT_SESSION", time: "09:00" },
        parts: [{ kind: "FORUM", prompt: "Share one idea", minWords: null, postToRead: true, allowComments: false }],
      });
    expect(created.status).toBe(201);
    const id = created.body.data.id as number;
    expect((await stored(id)).remindAt?.toISOString()).toBe("2099-02-10T07:00:00.000Z");
    expect(created.body.data.reminderLine).toBe("Tue 10 Feb, around 9:00 AM — students who haven't finished");

    const moved = await request(app)
      .patch(`/api/v1/sessions/${sessionId}`)
      .set(auth())
      .send({ title: "Week 1", startsAt: "2099-02-19T16:00:00.000Z", durationMinutes: 90, scope: "one" });
    expect(moved.status).toBe(200);
    expect((await stored(id)).remindAt?.toISOString()).toBe("2099-02-17T07:00:00.000Z");

    const earlier = await request(app)
      .post("/api/v1/sessions")
      .set(auth())
      .send({ seasonId, title: "Extra", startsAt: "2099-02-11T16:00:00.000Z", durationMinutes: 90, repeatWeeks: 1 });
    expect((await stored(id)).remindAt?.toISOString()).toBe("2099-02-09T07:00:00.000Z");

    for (const sid of [earlier.body.data.id as number, sessionId]) {
      expect((await request(app).delete(`/api/v1/sessions/${sid}`).set(auth()).send({})).status).toBe(200);
    }
    expect((await stored(id)).remindAt).toBeNull();
    const detail = await request(app).get(`/api/v1/assignments/${id}`).set(auth());
    expect(detail.body.data.reminderLine).toBe("No session after it was published — no reminder");
  });
});

describe("refreshSeasonReminders", () => {
  it("keeps a reminder that is due but not yet sent when an unrelated session is written", async () => {
    const { seasonId } = await seasonWith({});
    // A session in a day: 2 days before it is already past, and nothing has swept it yet.
    const soon = new Date(Date.now() + 24 * 3600_000);
    await db.session.create({ data: { seasonId, title: "Soon", startsAt: soon, durationMinutes: 60 } });
    const a = await createAssignmentWithParts({ seasonId, title: "Owed" }, [{ kind: "FORUM" }]);
    await db.assignment.update({ where: { id: a.id }, data: { createdAt: new Date(Date.now() - 7 * 24 * 3600_000) } });
    const owed = orgDaysBeforeAt(soon, 2, "09:00");
    await db.assignment.update({ where: { id: a.id }, data: { remindAt: owed } });

    const other = await request(app)
      .post("/api/v1/sessions")
      .set(auth())
      .send({ seasonId, title: "Later", startsAt: "2099-06-01T16:00:00.000Z", durationMinutes: 90, repeatWeeks: 1 });
    expect(other.status).toBe(201);
    expect((await stored(a.id)).remindAt?.toISOString()).toBe(owed.toISOString());
  });
});

// The reminder was due Tue 11 Nov 2025 at 09:00 Cairo, 2 days before Thursday.
const REMIND_AT = new Date("2025-11-11T07:00:00.000Z");
const NOW = new Date("2025-11-11T07:05:00.000Z");

async function dueAssignment(seasonId: number) {
  const a = await createAssignmentWithParts({ seasonId, title: "The Prodigal Son" }, [
    { kind: "VIDEO", durationSeconds: 600 },
    { kind: "ESSAY" },
  ]);
  await db.assignment.update({ where: { id: a.id }, data: { remindAt: REMIND_AT, reminderDays: 2 } });
  return a;
}

describe("the assignment-reminders handler", () => {
  it("the reminder skips students who submitted and goes once", async () => {
    const { seasonId, ids } = await seasonWith({
      done: "ACTIVE",
      partway: "ACTIVE",
      idle: "ACTIVE",
      left: "WITHDRAWN",
    });
    const a = await dueAssignment(seasonId);
    await seedVideoWork(a.id, a.partIds[0]!, ids.done!, 600);
    await seedTextWork(a.id, a.partIds[1]!, ids.done!, "SUBMITTED");
    await setSubmitted(a.id, ids.done!, new Date());
    await seedVideoWork(a.id, a.partIds[0]!, ids.partway!, 600);

    expect(await sendDueAssignmentReminders(NOW)).toBeGreaterThanOrEqual(2);
    expect(await remindersFor(a.id)).toEqual(
      [
        { userId: ids.partway!, title: "Reminder: The Prodigal Son", body: "1 part left before Thursday" },
        { userId: ids.idle!, title: "Reminder: The Prodigal Son", body: "2 parts left before Thursday" },
      ].sort((x, y) => x.userId - y.userId),
    );
    expect((await stored(a.id)).remindedAt?.toISOString()).toBe(NOW.toISOString());
    // The stored link opens the assignment in the app: the same target as a new assignment's.
    const sent = await db.notification.findFirstOrThrow({
      where: { type: "ASSIGNMENT_REMINDER", userId: ids.idle! },
      select: { link: true },
    });
    expect(parseNotificationLink(sent.link)).toEqual({ entityType: "assignment", entityId: a.id });

    // The second run finds it claimed.
    await sendDueAssignmentReminders(new Date(NOW.getTime() + 60_000));
    expect(await remindersFor(a.id)).toHaveLength(2);
  });

  it("is not due before its time, and never for an assignment with the reminder off", async () => {
    const { seasonId } = await seasonWith({ idle: "ACTIVE" });
    const early = await dueAssignment(seasonId);
    const off = await dueAssignment(seasonId);
    await db.assignment.update({ where: { id: off.id }, data: { reminderEnabled: false } });

    await sendDueAssignmentReminders(new Date(REMIND_AT.getTime() - 60_000));
    expect(await remindersFor(early.id)).toEqual([]);
    await sendDueAssignmentReminders(NOW);
    expect(await remindersFor(early.id)).toHaveLength(1);
    expect(await remindersFor(off.id)).toEqual([]);
  });

  it("a returned essay makes a student eligible again", async () => {
    const { seasonId, ids } = await seasonWith({ returned: "ACTIVE" });
    const before = await dueAssignment(seasonId);
    await seedVideoWork(before.id, before.partIds[0]!, ids.returned!, 600);
    const essay = await seedTextWork(before.id, before.partIds[1]!, ids.returned!, "SUBMITTED");
    await setSubmitted(before.id, ids.returned!, new Date());
    await reviewEssay(essay.publicId, reviewerId, "return", "Say more about the father.");

    await sendDueAssignmentReminders(NOW);
    expect(await remindersFor(before.id)).toEqual([
      { userId: ids.returned!, title: "Reminder: The Prodigal Son", body: "1 part left before Thursday" },
    ]);
  });

  it("is sent once per assignment: an essay returned after it went out brings no second one", async () => {
    const { seasonId, ids } = await seasonWith({ returned: "ACTIVE" });
    const after = await dueAssignment(seasonId);
    await seedVideoWork(after.id, after.partIds[0]!, ids.returned!, 600);
    const essay = await seedTextWork(after.id, after.partIds[1]!, ids.returned!, "SUBMITTED");
    await setSubmitted(after.id, ids.returned!, new Date());

    await sendDueAssignmentReminders(NOW);
    expect(await remindersFor(after.id)).toEqual([]);
    await reviewEssay(essay.publicId, reviewerId, "return", "Say more about the father.");
    await sendDueAssignmentReminders(new Date(NOW.getTime() + 60_000));
    expect(await remindersFor(after.id)).toEqual([]);
  });

  it("claims but does not send a reminder whose anchor day has come (a late sweep)", async () => {
    const { seasonId } = await seasonWith({ idle: "ACTIVE" });
    const late = await dueAssignment(seasonId);
    // Thursday 10:00 Cairo: "before Thursday" no longer holds.
    const thursday = new Date("2025-11-13T08:00:00.000Z");
    await sendDueAssignmentReminders(thursday);
    expect(await remindersFor(late.id)).toEqual([]);
    expect((await stored(late.id)).remindedAt?.toISOString()).toBe(thursday.toISOString());
  });

  it("one assignment's failure does not stop the next", async () => {
    const { seasonId, ids } = await seasonWith({ idle: "ACTIVE" });
    const failing = await dueAssignment(seasonId);
    const next = await dueAssignment(seasonId);
    const errors = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const bulk = jest.spyOn(notifications, "createNotificationsBulk").mockRejectedValueOnce(new Error("push down"));
    let logged: unknown[][] = [];
    try {
      await sendDueAssignmentReminders(NOW);
      logged = errors.mock.calls.slice();
    } finally {
      bulk.mockRestore();
      errors.mockRestore();
    }
    expect(logged).toContainEqual([`[assignment-reminders] assignment ${failing.id} failed:`, "push down"]);
    expect(await remindersFor(failing.id)).toEqual([]);
    expect(await remindersFor(next.id)).toEqual([
      { userId: ids.idle!, title: "Reminder: The Prodigal Son", body: "2 parts left before Thursday" },
    ]);
  });
});
