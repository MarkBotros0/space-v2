// Community model, Build 2, Task 3: who can be seated as a season admin or a
// group leader, what a save never re-checks, and who may pick from the
// candidates. Stored roles and the user form are in stored-roles.test.ts.
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { PASSWORD, cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

jest.setTimeout(120000);

const app = createApp();
let superToken: string;
let n = 0;

type Status = "DRAFT" | "ACTIVE" | "COMPLETED" | "ARCHIVED";

const as = (token: string) => ({ authorization: `Bearer ${token}` });

const person = async (name: string, graduationYear: number | null = 2020) => {
  const user = await createTestUser(`seats-${++n}`, "STUDENT");
  await db.user.update({ where: { id: user.id }, data: { name, graduationYear } });
  return user;
};
const season = async (status: Status = "ACTIVE", title = "Test Season") => {
  const row = await createTestSeason({ status });
  await db.season.update({ where: { id: row.id }, data: { title } });
  return row.id;
};
const group = async (seasonId: number, leaderIds: number[] = []) =>
  (
    await db.group.create({
      data: {
        seasonId,
        name: `Group ${++n}`,
        description: "Keep me",
        leaders: { create: leaderIds.map((userId) => ({ userId })) },
      },
      select: { id: true },
    })
  ).id;
const addAdmin = (seasonId: number, userId: number, token = superToken) =>
  request(app).post(`/api/v1/seasons/${seasonId}/admins`).set(as(token)).send({ userId });
const createGroup = (seasonId: number, body: object, token = superToken) =>
  request(app).post(`/api/v1/seasons/${seasonId}/groups`).set(as(token)).send({ name: `New ${++n}`, ...body });
const patchGroup = (groupId: number, body: object, token = superToken) =>
  request(app).patch(`/api/v1/groups/${groupId}`).set(as(token)).send(body);
const stamp = async (id: number) =>
  (await db.user.findUniqueOrThrow({ where: { id }, select: { sessionsValidFrom: true } })).sessionsValidFrom;
const refreshTokenOf = async (email: string) =>
  (await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD })).body.data.refreshToken as string;
const canRefresh = async (refreshToken: string) =>
  (await request(app).post("/api/v1/auth/refresh").send({ refreshToken })).status === 200;

beforeAll(async () => {
  await cleanupTestData();
  superToken = await login(app, (await createTestUser("seats-super", "SUPER")).email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("POST /seasons/:id/admins", () => {
  it("refuses someone who hasn't graduated", async () => {
    const res = await addAdmin(await season(), (await person("Non Alum", null)).id);
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({ code: "not_alumnus", message: "Only alumni can serve. Non Alum hasn't graduated." });
  });

  it("refuses someone leading in another ACTIVE season, by name and season", async () => {
    const mina = await person("Mina");
    await group(await season("ACTIVE", "GBV 2026"), [mina.id]);
    const target = await season();
    const res = await addAdmin(target, mina.id);
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({ code: "already_in_role", message: "Mina is already leading a group in GBV 2026" });
    expect(await db.seasonAdmin.count({ where: { seasonId: target, userId: mina.id } })).toBe(0);
  });

  it("seats that same person in a DRAFT, where nothing counts until it starts", async () => {
    const mina = await person("Mina");
    await group(await season("ACTIVE", "GBV 2026"), [mina.id]);
    expect((await addAdmin(await season("DRAFT"), mina.id)).status).toBe(201);
  });

  it("no longer asks for a stored ADMIN role: a stored STUDENT alumnus is seated", async () => {
    const res = await addAdmin(await season(), (await person("Alum")).id);
    expect(res.status).toBe(201);
  });

  it("refuses a mentor, and a season that has finished", async () => {
    const mentor = await person("Mentor");
    await db.user.update({ where: { id: mentor.id }, data: { role: "MENTOR" } });
    expect((await addAdmin(await season(), mentor.id)).body.error.code).toBe("permanent_role");

    const finished = await addAdmin(await season("COMPLETED"), (await person("Late")).id);
    expect(finished.status).toBe(409);
    expect(finished.body.error.code).toBe("season_finished");
  });

  it("is still idempotent, without a second stamp", async () => {
    const alum = await person("Twice");
    const seasonId = await season();
    expect((await addAdmin(seasonId, alum.id)).status).toBe(201);
    const after = await stamp(alum.id);
    expect((await addAdmin(seasonId, alum.id)).status).toBe(200);
    expect(await stamp(alum.id)).toEqual(after);
  });

  it("adding and removing keep the refresh token valid and bump sessionsValidFrom", async () => {
    const alum = await person("Stays Signed In");
    const seasonId = await season();
    const refreshToken = await refreshTokenOf(alum.email);
    expect(await stamp(alum.id)).toBeNull();

    expect((await addAdmin(seasonId, alum.id)).status).toBe(201);
    const added = await stamp(alum.id);
    expect(added).not.toBeNull();
    expect(await db.refreshToken.count({ where: { userId: alum.id, revokedAt: null } })).toBeGreaterThan(0);

    await new Promise((resolve) => setTimeout(resolve, 5));
    const removed = await request(app).delete(`/api/v1/seasons/${seasonId}/admins/${alum.id}`).set(as(superToken));
    expect(removed.status).toBe(200);
    expect((await stamp(alum.id))!.getTime()).toBeGreaterThan(added!.getTime());
    expect(await canRefresh(refreshToken)).toBe(true);
  });
});

describe("the group form's leaderIds", () => {
  it("refuses a non-alumnus and someone in an active role, writing nothing", async () => {
    const seasonId = await season();
    const notAlum = await createGroup(seasonId, { name: "Nope A", leaderIds: [(await person("Non Alum", null)).id] });
    expect(notAlum.status).toBe(409);
    expect(notAlum.body.error.code).toBe("not_alumnus");

    const mina = await person("Mina");
    await group(await season("ACTIVE", "GBV 2026"), [mina.id]);
    const busy = await createGroup(seasonId, { name: "Nope B", leaderIds: [mina.id] });
    expect(busy.status).toBe(409);
    expect(busy.body.error).toEqual({ code: "already_in_role", message: "Mina is already leading a group in GBV 2026" });
    expect(await db.group.count({ where: { seasonId, name: { startsWith: "Nope" } } })).toBe(0);
  });

  it("answers 404 for a leader who doesn't exist", async () => {
    expect((await createGroup(await season(), { leaderIds: [2147483000] })).status).toBe(404);
  });

  it("refuses a leader already on another group of this season, on create and on edit", async () => {
    const seasonId = await season();
    const lead = await person("Lead");
    const first = await createGroup(seasonId, { leaderIds: [lead.id] });
    expect(first.status).toBe(201);

    const second = await createGroup(seasonId, { leaderIds: [lead.id] });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("leader_has_group");

    const other = await group(seasonId);
    const edit = await patchGroup(other, { name: "Other", leaderIds: [lead.id] });
    expect(edit.status).toBe(409);
    expect(edit.body.error.code).toBe("leader_has_group");
    expect(await db.groupLeader.count({ where: { groupId: other } })).toBe(0);
  });

  it("two people in one request are each checked, and a repeated id is one person", async () => {
    const seasonId = await season();
    const [a, b] = [await person("A Alum"), await person("B Non", null)];
    expect((await createGroup(seasonId, { leaderIds: [a.id, b.id] })).body.error.code).toBe("not_alumnus");
    const repeated = await createGroup(seasonId, { leaderIds: [a.id, a.id] });
    expect(repeated.status).toBe(201);
    expect(await db.groupLeader.count({ where: { groupId: repeated.body.data.id } })).toBe(1);
  });

  it("lets a season's own admin lead in it", async () => {
    const seasonId = await season();
    const admin = await person("Own Admin");
    await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
    expect((await createGroup(seasonId, { leaderIds: [admin.id] })).status).toBe(201);
  });

  it("saving a group never re-checks a leader who is unchanged, so an old row can't block the form", async () => {
    const seasonId = await season();
    const former = await person("Former", null);
    await group(await season("ACTIVE", "Elsewhere"), [former.id]);
    const groupId = await group(seasonId, [former.id]);
    const res = await patchGroup(groupId, { name: "Renamed", leaderIds: [former.id] });
    expect(res.status).toBe(200);
    expect(await db.groupLeader.count({ where: { groupId, userId: former.id } })).toBe(1);
  });

  it("marks added and removed leaders stale, leaves the unchanged one, and signs nobody out", async () => {
    const seasonId = await season();
    const [stays, leaves, joins] = [await person("Stays"), await person("Leaves"), await person("Joins")];
    const groupId = await group(seasonId, [stays.id, leaves.id]);
    const refreshToken = await refreshTokenOf(leaves.email);

    const res = await patchGroup(groupId, { name: "Swap", leaderIds: [stays.id, joins.id] });
    expect(res.status).toBe(200);
    expect(await stamp(stays.id)).toBeNull();
    expect(await stamp(leaves.id)).not.toBeNull();
    expect(await stamp(joins.id)).not.toBeNull();
    expect(await canRefresh(refreshToken)).toBe(true);
  });

  it("deleting a group marks its leaders stale", async () => {
    const lead = await person("Deleted Group Lead");
    const groupId = await group(await season(), [lead.id]);
    expect((await request(app).delete(`/api/v1/groups/${groupId}`).set(as(superToken))).status).toBe(200);
    expect(await stamp(lead.id)).not.toBeNull();
  });
});

describe("who may seat whom", () => {
  it("an admin may add and remove leaders; a leader can't; an admin can't add admins", async () => {
    const seasonId = await season();
    const [admin, leader, recruit, second] = [
      await person("Admin"), await person("Leader"), await person("Recruit"), await person("Second"),
    ];
    await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
    const groupId = await group(seasonId, [leader.id]);
    const adminToken = await login(app, admin.email);
    const leaderToken = await login(app, leader.email);

    expect((await patchGroup(groupId, { name: "By leader", leaderIds: [recruit.id] }, leaderToken)).status).toBe(403);
    expect((await patchGroup(groupId, { name: "By admin", leaderIds: [recruit.id] }, adminToken)).status).toBe(200);
    const leaders = await db.groupLeader.findMany({ where: { groupId }, select: { userId: true } });
    expect(leaders).toEqual([{ userId: recruit.id }]);
    expect((await patchGroup(groupId, { name: "Empty", leaderIds: [] }, adminToken)).status).toBe(200);
    expect(await db.groupLeader.count({ where: { groupId } })).toBe(0);

    // Stale since the save above, so a fresh token.
    expect((await addAdmin(seasonId, second.id, await login(app, admin.email))).status).toBe(403);
  });
});

describe("PATCH /groups/:id, the parked fixes", () => {
  it("PATCH {name} keeps the description; an explicit null clears it", async () => {
    const groupId = await group(await season());
    expect((await patchGroup(groupId, { name: "Only name" })).status).toBe(200);
    const read = () => db.group.findUniqueOrThrow({ where: { id: groupId }, select: { description: true } });
    expect((await read()).description).toBe("Keep me");
    expect((await patchGroup(groupId, { name: "Only name", description: null })).status).toBe(200);
    expect((await read()).description).toBeNull();
  });

  it("explicit studentIds refuse a WITHDRAWN member and one whose stored role changed", async () => {
    const seasonId = await season();
    const groupId = await group(seasonId);
    const withdrawn = await person("Withdrawn", null);
    const changed = await person("Changed", null);
    await db.user.update({ where: { id: changed.id }, data: { role: "LEADER" } });
    await db.seasonEnrollment.create({ data: { seasonId, studentUserId: withdrawn.id, status: "WITHDRAWN" } });
    await db.seasonEnrollment.create({ data: { seasonId, studentUserId: changed.id, status: "ACTIVE" } });

    for (const id of [withdrawn.id, changed.id]) {
      const res = await patchGroup(groupId, { name: "Roster", studentIds: [id] });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("not_enrolled");
    }
  });
});

describe("GET /seasons/:id/staff-candidates", () => {
  const candidates = (seasonId: number, token = superToken) =>
    request(app).get(`/api/v1/seasons/${seasonId}/staff-candidates`).set(as(token));

  it("lists free alumni only, and a season admin gets name and last season and nothing else", async () => {
    const seasonId = await season("DRAFT");
    const past = await season("COMPLETED", "GBV 2020");
    const later = await season("ARCHIVED", "GBV 2021");

    const free = await person("Aaa Free");
    await db.seasonEnrollment.create({
      data: { seasonId: past, studentUserId: free.id, status: "COMPLETED", result: "PASSED" },
    });
    await db.groupLeader.create({ data: { userId: free.id, groupId: await group(later) } });
    const noHistory = await person("Bbb Free");
    const draftOnly = await person("Ccc Draft");
    await db.seasonAdmin.create({ data: { seasonId, userId: draftOnly.id } });

    const leading = await person("Busy Leader");
    await group(await season(), [leading.id]);
    const administering = await person("Busy Admin");
    await db.seasonAdmin.create({ data: { seasonId: await season(), userId: administering.id } });
    const studying = await person("Busy Student");
    await db.seasonEnrollment.create({ data: { seasonId: await season(), studentUserId: studying.id, status: "ACTIVE" } });
    const student = await person("Non Alum", null);
    const mentor = await person("Mentor");
    const deleted = await person("Deleted");
    await db.user.update({ where: { id: mentor.id }, data: { role: "MENTOR" } });
    await db.user.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });

    const adminToken = await login(app, draftOnly.email);
    const res = await candidates(seasonId, adminToken);
    expect(res.status).toBe(200);

    const people = res.body.data.people as { id: number; name: string }[];
    const ids = people.map((p) => p.id);
    for (const id of [leading.id, administering.id, studying.id, student.id, mentor.id, deleted.id]) {
      expect(ids).not.toContain(id);
    }
    expect(people.find((p) => p.id === free.id)).toEqual({ id: free.id, name: "Aaa Free", lastSeason: { title: "GBV 2021" } });
    expect(people.find((p) => p.id === noHistory.id)).toEqual({ id: noHistory.id, name: "Bbb Free", lastSeason: null });
    expect(ids.indexOf(free.id)).toBeLessThan(ids.indexOf(noHistory.id));
    expect(ids).toContain(draftOnly.id);
  });

  it("answers 403 to a leader, to another season's admin and to a student, and 404 for no season", async () => {
    const seasonId = await season();
    const leader = await person("Leader");
    await group(seasonId, [leader.id]);
    const otherAdmin = await person("Other Admin");
    await db.seasonAdmin.create({ data: { seasonId: await season("DRAFT"), userId: otherAdmin.id } });
    for (const who of [leader, otherAdmin, await person("Plain", null)]) {
      expect((await candidates(seasonId, await login(app, who.email))).status).toBe(403);
    }
    expect((await candidates(2147483000)).status).toBe(404);
  });
});
