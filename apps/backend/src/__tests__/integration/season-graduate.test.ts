// Community model, Build 2, Task 7: graduating several people from a finished season.
import request from "supertest";

import { db } from "../../db/client";
import { createTestUser, login } from "./fixtures";
import {
  adminTokenOf,
  app,
  as,
  ctx,
  person,
  rowOf,
  season,
  seedEnrollmentFixtures,
  stamp,
  teardownEnrollmentFixtures,
  type Status,
} from "./season-enrollments-setup";

jest.setTimeout(180000);

beforeAll(seedEnrollmentFixtures);
afterAll(teardownEnrollmentFixtures);

const graduate = (seasonId: number, body: object, token = ctx.superToken) =>
  request(app).post(`/api/v1/seasons/${seasonId}/graduate`).set(as(token)).send(body);

const yearOf = async (id: number) =>
  (await db.user.findUniqueOrThrow({ where: { id }, select: { graduationYear: true } })).graduationYear;

const COMPLETED_AT = new Date(Date.UTC(2026, 5, 1));

async function finisher(seasonId: number, name: string, result: "PASSED" | "NOT_PASSED" = "PASSED") {
  const student = await person(name);
  await db.seasonEnrollment.create({
    data: { seasonId, studentUserId: student.id, status: "COMPLETED", result, completedAt: COMPLETED_AT },
  });
  return student;
}

describe("POST /seasons/:id/graduate", () => {
  it.each<Status>(["COMPLETED", "ARCHIVED"])("graduates a batch from a %s season, its enrolments untouched", async (status) => {
    const target = await season(status);
    const passed = await finisher(target, "Peter");
    const notPassed = await finisher(target, "Nour", "NOT_PASSED");
    const before = await stamp(passed.id);
    const rowsBefore = [await rowOf(target, passed.id), await rowOf(target, notPassed.id)];

    const res = await graduate(target, { userIds: [notPassed.id, passed.id], graduationYear: 2026 });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ graduated: [notPassed.id, passed.id], graduationYear: 2026 });
    expect(await yearOf(passed.id)).toBe(2026);
    expect(await yearOf(notPassed.id)).toBe(2026);
    expect([await rowOf(target, passed.id), await rowOf(target, notPassed.id)]).toEqual(rowsBefore);
    expect((await stamp(passed.id))?.getTime()).not.toBe(before?.getTime());
  });

  it("completes a live enrolment elsewhere with no result, as graduating one person does", async () => {
    const target = await season("COMPLETED");
    const live = await season("ACTIVE");
    const student = await finisher(target, "Sara");
    await db.seasonEnrollment.create({ data: { seasonId: live, studentUserId: student.id, status: "ACTIVE" } });

    expect((await graduate(target, { userIds: [student.id], graduationYear: 2026 })).status).toBe(200);

    const row = await rowOf(live, student.id);
    expect(row).toMatchObject({ status: "COMPLETED", result: null });
    expect(row?.completedAt).not.toBeNull();
  });

  it("leaves an audit line for each person, naming the season and never the year", async () => {
    const target = await season("COMPLETED");
    const student = await finisher(target, "Audit");
    const info = jest.spyOn(console, "info").mockImplementation(() => undefined);
    expect((await graduate(target, { userIds: [student.id], graduationYear: 2026 })).status).toBe(200);
    const lines = info.mock.calls.map((c) => String(c[0]));
    info.mockRestore();
    expect(lines).toContain(`[audit] student.graduate actor=${ctx.superId} subject=${student.id} season=${target}`);
  });

  it.each<Status>(["DRAFT", "ACTIVE"])("is refused in a %s season", async (status) => {
    const target = await season(status);
    const student = await person("Live");
    await db.seasonEnrollment.create({ data: { seasonId: target, studentUserId: student.id, status: "ACTIVE" } });

    const res = await graduate(target, { userIds: [student.id], graduationYear: 2026 });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("season_not_finished");
    expect(await yearOf(student.id)).toBeNull();
    expect(await rowOf(target, student.id)).toMatchObject({ status: "ACTIVE" });
  });

  it("one bad person refuses the whole batch, named in the message", async () => {
    const target = await season("COMPLETED");
    const good = await finisher(target, "Good");
    const outsider = await person("Outsider");
    const graduated = await finisher(target, "Graduated");
    await db.user.update({ where: { id: graduated.id }, data: { graduationYear: 2020 } });
    const droppedOut = await person("Dropped");
    await db.seasonEnrollment.create({
      data: { seasonId: target, studentUserId: droppedOut.id, status: "WITHDRAWN", droppedAt: new Date() },
    });
    const staff = await finisher(target, "Stored Leader");
    await db.user.update({ where: { id: staff.id }, data: { role: "LEADER" } });
    const gone = await finisher(target, "Gone");
    await db.user.update({ where: { id: gone.id }, data: { deletedAt: new Date() } });

    const cases: [number, string][] = [
      [outsider.id, "Outsider wasn't in this season"],
      [graduated.id, "Graduated has already graduated"],
      [droppedOut.id, "Dropped was dropped from this season"],
      [staff.id, "Stored Leader can't graduate"],
      [gone.id, "Gone can't graduate"],
      [2147483000, "Someone in this list wasn't found"],
    ];
    for (const [bad, message] of cases) {
      const res = await graduate(target, { userIds: [good.id, bad], graduationYear: 2026 });
      expect(res.status).toBe(409);
      expect(res.body.error).toEqual({ code: "people_unavailable", message });
      expect(await yearOf(good.id)).toBeNull();
    }
    expect(await yearOf(graduated.id)).toBe(2020);

    const counted = await graduate(target, { userIds: [outsider.id, graduated.id, good.id, droppedOut.id], graduationYear: 2026 });
    expect(counted.body.error.message).toBe("Outsider wasn't in this season, and 2 others can't graduate");
  });

  it("is refused to everyone but a super, before anything is read", async () => {
    const target = await season("COMPLETED");
    const student = await finisher(target, "Kept");
    const mentor = await createTestUser("grad-mentor", "MENTOR");
    const live = await season("ACTIVE");
    for (const [id, token] of [
      [target, await adminTokenOf(live)],
      [target, await login(app, mentor.email)],
      [live, await adminTokenOf(live)],
      [2147483000, await login(app, mentor.email)],
    ] as const) {
      expect((await graduate(id, { userIds: [student.id], graduationYear: 2026 }, token)).status).toBe(403);
    }
    expect(await yearOf(student.id)).toBeNull();
  });

  it("answers 404 for no season and 400 for a bad body", async () => {
    const target = await season("COMPLETED");
    const student = await finisher(target, "Body");
    expect((await graduate(2147483000, { userIds: [student.id], graduationYear: 2026 })).status).toBe(404);
    const bad = [
      {},
      { userIds: [], graduationYear: 2026 },
      { userIds: [student.id, student.id], graduationYear: 2026 },
      { userIds: [student.id], graduationYear: 1989 },
      { userIds: [student.id], graduationYear: new Date().getFullYear() + 1 },
      { userIds: [student.id], graduationYear: 2026, extra: 1 },
    ];
    for (const body of bad) expect((await graduate(target, body)).status).toBe(400);
    expect(await yearOf(student.id)).toBeNull();
  });
});
