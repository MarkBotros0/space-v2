// apps/backend/src/__tests__/integration/dashboard-leader-session.test.ts
// The leader's `leaderSession` check-in counts on GET /me/dashboard. Kept apart
// from dashboard-routes.test.ts (400-line file limit); its own season, groups
// and people so the figures asserted there are untouched.
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { staffSeasonDashboardSchema } from "../../../../../packages/shared/src/index";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let emptySeasonId: number;
let sessionId: number;
let notCheckedInId: number;
let noNameId: number;
let noNameEmail: string;
let secondGroupUnmarkedId: number;
const tokens: Record<string, string> = {};
const token = (k: string) => tokens[k] as string;

const dashboard = (season: number, token: string) =>
  request(app).get(`/api/v1/me/dashboard?seasonId=${season}`).set("authorization", `Bearer ${token}`);

beforeAll(async () => {
  await cleanupTestData();
  seasonId = (await createTestSeason()).id;
  emptySeasonId = (await createTestSeason()).id;
  const groupA = (await db.group.create({ data: { seasonId, name: "Group A" }, select: { id: true } })).id;
  const groupB = (await db.group.create({ data: { seasonId, name: "Group B" }, select: { id: true } })).id;
  // A second group the same leader leads, in the same season.
  const groupC = (await db.group.create({ data: { seasonId, name: "Group C" }, select: { id: true } })).id;
  const emptyGroup = (
    await db.group.create({
      data: { seasonId: emptySeasonId, name: "Empty" },
      select: { id: true },
    })
  ).id;

  const present = await createTestUser("ls-present", "STUDENT");
  const late = await createTestUser("ls-late", "STUDENT");
  const absent = await createTestUser("ls-absent", "STUDENT");
  const unmarked = await createTestUser("ls-unmarked", "STUDENT");
  const noName = await createTestUser("ls-noname", "STUDENT");
  const other = await createTestUser("ls-other-group", "STUDENT");
  const secondPresent = await createTestUser("ls-second-present", "STUDENT");
  const secondUnmarked = await createTestUser("ls-second-unmarked", "STUDENT");
  // Enrolled in a group the leader leads, but in ANOTHER season: never counted here.
  const elsewhere = await createTestUser("ls-elsewhere", "STUDENT");
  secondGroupUnmarkedId = secondUnmarked.id;
  await db.user.update({ where: { id: noName.id }, data: { name: "  " } });
  notCheckedInId = unmarked.id;
  noNameId = noName.id;
  noNameEmail = noName.email;
  const leader = await createTestUser("ls-leader", "LEADER");
  const emptyLeader = await createTestUser("ls-leader-empty", "LEADER");
  const admin = await createTestUser("ls-admin", "ADMIN");
  await db.groupLeader.create({ data: { groupId: groupA, userId: leader.id } });
  await db.groupLeader.create({ data: { groupId: groupC, userId: leader.id } });
  // The same leader also leads a group in another season.
  await db.groupLeader.create({ data: { groupId: emptyGroup, userId: leader.id } });
  await db.groupLeader.create({ data: { groupId: emptyGroup, userId: emptyLeader.id } });
  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });

  const enrolledAt = new Date("2019-12-01T00:00:00.000Z");
  const enrol = (studentUserId: number, groupId: number) => ({
    seasonId,
    studentUserId,
    groupId,
    status: "ACTIVE" as const,
    enrolledAt,
  });
  await db.seasonEnrollment.createMany({
    data: [
      enrol(present.id, groupA),
      enrol(late.id, groupA),
      enrol(absent.id, groupA),
      enrol(unmarked.id, groupA),
      enrol(noName.id, groupA),
      enrol(other.id, groupB),
      enrol(secondPresent.id, groupC),
      enrol(secondUnmarked.id, groupC),
      { ...enrol(elsewhere.id, emptyGroup), seasonId: emptySeasonId },
    ],
  });

  // The next session: in the future, so it is "next" rather than a past one.
  sessionId = (
    await db.session.create({
      data: {
        seasonId,
        title: "Next",
        startsAt: new Date("2099-01-01T16:00:00.000Z"),
        durationMinutes: 90,
      },
      select: { id: true },
    })
  ).id;
  await db.attendance.createMany({
    data: [
      { sessionId, studentUserId: present.id, status: "PRESENT" },
      { sessionId, studentUserId: late.id, status: "LATE", lateMinutes: 5 },
      { sessionId, studentUserId: absent.id, status: "ABSENT" },
      { sessionId, studentUserId: secondPresent.id, status: "PRESENT" },
      // Another group's student is marked too, and must never be counted.
      { sessionId, studentUserId: other.id, status: "PRESENT" },
    ],
  });

  tokens.leader = await login(app, leader.email);
  tokens.emptyLeader = await login(app, emptyLeader.email);
  tokens.admin = await login(app, admin.email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("GET /api/v1/me/dashboard — leaderSession", () => {
  it("counts the leader's groups for the next session and lists who is not checked in", async () => {
    const res = await dashboard(seasonId, token("leader"));
    expect(res.status).toBe(200);
    const d = staffSeasonDashboardSchema.parse(res.body.data);

    // Two led groups in this season add up (5 + 2); the led group in another season adds nothing.
    expect(d.leaderSession).toMatchObject({ sessionId, total: 7, present: 2, late: 1, absent: 1 });
    expect(d.groups.map((g) => g.name).sort()).toEqual(["Group A", "Group C"]);
    expect(d.leaderSession?.sessionId).toBe(d.nextSession?.id);
    // The other group's student is neither counted nor listed; a blank name (the column is NOT NULL, so blank is the real case) falls back to the email.
    expect(d.leaderSession?.notCheckedIn).toEqual(
      expect.arrayContaining([
        { id: notCheckedInId, name: "Test ls-unmarked" },
        { id: noNameId, name: noNameEmail },
        { id: secondGroupUnmarkedId, name: "Test ls-second-unmarked" },
      ]),
    );
    expect(d.leaderSession?.notCheckedIn).toHaveLength(3);
  });

  it("has no leaderSession key for an admin (season scope)", async () => {
    const res = await dashboard(seasonId, token("admin"));
    expect(res.status).toBe(200);
    expect(res.body.data.scope).toBe("season");
    expect(res.body.data).not.toHaveProperty("leaderSession");
  });

  it("is null when the season has no next session", async () => {
    const res = await dashboard(emptySeasonId, token("emptyLeader"));
    expect(res.status).toBe(200);
    expect(res.body.data.nextSession).toBeNull();
    expect(res.body.data.leaderSession).toBeNull();
  });
});
