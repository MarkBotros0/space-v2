// Community model, Build 2, Task 3: `User.role` holds SUPER, MENTOR or STUDENT;
// admin and leader come from season rows. Seats themselves: staff-seats.test.ts.
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { PASSWORD, cleanupTestData, createTestSeason, createTestUser, login, testEmail } from "./fixtures";

jest.setTimeout(120000);

const app = createApp();
let superToken: string;
let n = 0;

const as = (token: string) => ({ authorization: `Bearer ${token}` });

const alumnus = async (role: "STUDENT" | "ADMIN" | "LEADER" = "STUDENT") => {
  const user = await createTestUser(`stored-${++n}`, role);
  await db.user.update({ where: { id: user.id }, data: { graduationYear: 2020, name: "Mina" } });
  return user;
};
const patch = (id: number, body: object) =>
  request(app).patch(`/api/v1/users/${id}`).set(as(superToken)).send({ name: "Mina", graduationYear: 2020, ...body });
const seatAdmin = (userId: number, seasonId: number) => db.seasonAdmin.create({ data: { userId, seasonId } });
const seatLeader = async (userId: number, seasonId: number) => {
  const group = await db.group.create({ data: { seasonId, name: `G${++n}` }, select: { id: true } });
  await db.groupLeader.create({ data: { userId, groupId: group.id } });
};
const stored = (id: number) =>
  db.user.findUniqueOrThrow({ where: { id }, select: { role: true, sessionsValidFrom: true, name: true } });

const ROLE_FROM_SEASONS = {
  code: "role_from_seasons",
  message: "Admin and leader come from seasons, not from the account.",
};

beforeAll(async () => {
  await cleanupTestData();
  superToken = await login(app, (await createTestUser("stored-super", "SUPER")).email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("POST /users", () => {
  it.each(["ADMIN", "LEADER"])("refuses role %s", async (role) => {
    const email = testEmail("stored-new");
    const res = await request(app)
      .post("/api/v1/users")
      .set(as(superToken))
      .send({ name: "New Person", email, role, graduationYear: 2020 });
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual(ROLE_FROM_SEASONS);
    expect(await db.user.count({ where: { email } })).toBe(0);
  });

  it("says the same with no graduation year, rather than asking for one", async () => {
    const res = await request(app)
      .post("/api/v1/users")
      .set(as(superToken))
      .send({ name: "New Person", email: testEmail("stored-new"), role: "LEADER" });
    expect(res.body.error).toEqual(ROLE_FROM_SEASONS);
  });
});

describe("PATCH /users/:id", () => {
  it.each(["ADMIN", "LEADER"])("refuses a real change to %s, whatever the graduation year", async (role) => {
    const person = await alumnus();
    const res = await patch(person.id, { role });
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual(ROLE_FROM_SEASONS);
    expect((await patch(person.id, { role, graduationYear: null })).body.error).toEqual(ROLE_FROM_SEASONS);
    expect((await stored(person.id)).role).toBe("STUDENT");
  });

  it("refuses a move between derived ADMIN and LEADER as a real change", async () => {
    const person = await alumnus();
    await seatAdmin(person.id, (await createTestSeason()).id);
    expect((await patch(person.id, { role: "LEADER" })).body.error).toEqual(ROLE_FROM_SEASONS);
  });

  it("regression: a stored ADMIN with only finished rows loads as STUDENT; saving a name change as shown keeps every row", async () => {
    const person = await alumnus("ADMIN");
    const finished = await createTestSeason({ status: "COMPLETED" });
    await seatAdmin(person.id, finished.id);
    await seatLeader(person.id, finished.id);

    const shown = await request(app).get(`/api/v1/users/${person.id}`).set(as(superToken));
    expect(shown.body.data.role).toBe("STUDENT");

    const session = await request(app).post("/api/v1/auth/login").send({ email: person.email, password: PASSWORD });
    const info = jest.spyOn(console, "info").mockImplementation(() => undefined);
    const res = await patch(person.id, { name: "Mina Renamed", role: shown.body.data.role });
    const audited = info.mock.calls.flat().join(" ");
    info.mockRestore();

    expect(res.status).toBe(200);
    expect(await db.seasonAdmin.count({ where: { userId: person.id } })).toBe(1);
    expect(await db.groupLeader.count({ where: { userId: person.id } })).toBe(1);
    const after = await stored(person.id);
    expect(after).toEqual({ role: "ADMIN", sessionsValidFrom: null, name: "Mina Renamed" });
    expect(audited).not.toContain("user.role_change");
    const refreshed = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: session.body.data.refreshToken });
    expect(refreshed.status).toBe(200);
  });

  it.each([
    ["ADMIN", seatAdmin],
    ["LEADER", seatLeader],
  ] as const)("accepts the derived %s sent back unchanged, leaving the stored role alone", async (role, seat) => {
    const person = await alumnus("STUDENT");
    await seat(person.id, (await createTestSeason()).id);
    const res = await patch(person.id, { name: "Mina Two", role });
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe(role);
    expect(await stored(person.id)).toEqual({ role: "STUDENT", sessionsValidFrom: null, name: "Mina Two" });
  });

  it.each(["DRAFT", "ACTIVE"] as const)("refuses SUPER or MENTOR for someone holding a row in a %s season", async (status) => {
    const season = await createTestSeason({ status });
    await db.season.update({ where: { id: season.id }, data: { title: "GBV 2026" } });
    const admin = await alumnus();
    await seatAdmin(admin.id, season.id);
    const leader = await alumnus();
    await seatLeader(leader.id, season.id);

    for (const person of [admin, leader]) {
      for (const body of [{ role: "MENTOR" }, { role: "SUPER", confirmSuper: true }]) {
        const res = await patch(person.id, body);
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe("has_season_role");
        expect(res.body.error.message).toContain("GBV 2026");
      }
      expect((await stored(person.id)).role).toBe("STUDENT");
    }
    expect(await db.seasonAdmin.count({ where: { userId: admin.id } })).toBe(1);
    expect(await db.groupLeader.count({ where: { userId: leader.id } })).toBe(1);
  });

  it("refuses MENTOR for a student enrolled in a live season", async () => {
    const person = await alumnus();
    const season = await createTestSeason();
    await db.seasonEnrollment.create({ data: { seasonId: season.id, studentUserId: person.id, status: "ACTIVE" } });
    expect((await patch(person.id, { role: "MENTOR" })).body.error.code).toBe("has_season_role");
  });

  it("refuses STUDENT for a derived ADMIN: saying it can't change it, not answering 200 with nothing changed", async () => {
    const person = await alumnus("ADMIN");
    await seatAdmin(person.id, (await createTestSeason()).id);
    const res = await patch(person.id, { role: "STUDENT" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("has_season_role");
    expect(await db.seasonAdmin.count({ where: { userId: person.id } })).toBe(1);
  });

  it("allows MENTOR once only finished rows are left, and deletes none of them", async () => {
    const person = await alumnus("ADMIN");
    await seatAdmin(person.id, (await createTestSeason({ status: "COMPLETED" })).id);
    await seatLeader(person.id, (await createTestSeason({ status: "ARCHIVED" })).id);
    const res = await patch(person.id, { role: "MENTOR" });
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe("MENTOR");
    expect(await db.seasonAdmin.count({ where: { userId: person.id } })).toBe(1);
    expect(await db.groupLeader.count({ where: { userId: person.id } })).toBe(1);
  });
});
