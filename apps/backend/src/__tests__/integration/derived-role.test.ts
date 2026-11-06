// Community model, Build 2, Task 1: a person's role comes from their season
// rows. Only SUPER and MENTOR are still read from `User.role`.
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { loadScopes } from "../../lib/auth/scopes";
import { verifyAccessToken } from "../../lib/auth/tokens";
import { isLeaderOfGroup } from "../../lib/rbac";
import { PASSWORD, cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

beforeAll(async () => {
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

const alumnus = async (label: string, role: "STUDENT" | "ADMIN" | "LEADER" = "STUDENT") => {
  const person = await createTestUser(label, role);
  await db.user.update({ where: { id: person.id }, data: { graduationYear: 2020 } });
  return person;
};
const makeAdmin = (userId: number, seasonId: number) =>
  db.seasonAdmin.create({ data: { userId, seasonId } });
const makeLeader = async (userId: number, seasonId: number, name = "G") => {
  const group = await db.group.create({ data: { seasonId, name } });
  await db.groupLeader.create({ data: { userId, groupId: group.id } });
  return group.id;
};
const enrol = (studentUserId: number, seasonId: number) =>
  db.seasonEnrollment.create({ data: { studentUserId, seasonId, status: "ACTIVE" } });

const signIn = async (email: string) => {
  const res = await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.body.data as { accessToken: string; refreshToken: string; user: { role: string } };
};

describe("loadScopes derives the role", () => {
  it("makes a stored-STUDENT alumnus ADMIN through a SeasonAdmin row", async () => {
    const season = await createTestSeason();
    const person = await alumnus("dr-admin");
    await makeAdmin(person.id, season.id);
    expect(await loadScopes(person.id)).toEqual({
      role: "ADMIN",
      seasonAdminIds: [season.id],
      groupLeaderIds: [],
      activeSeasonId: null,
      graduationYear: 2020,
    });
  });

  it("makes a stored-STUDENT alumnus LEADER through a GroupLeader row", async () => {
    const season = await createTestSeason();
    const person = await alumnus("dr-leader");
    const groupId = await makeLeader(person.id, season.id);
    expect(await loadScopes(person.id)).toMatchObject({
      role: "LEADER",
      seasonAdminIds: [],
      groupLeaderIds: [groupId],
    });
  });

  it("leaves an alumnus with no rows STUDENT, graduation year kept", async () => {
    const person = await alumnus("dr-plain");
    expect(await loadScopes(person.id)).toMatchObject({ role: "STUDENT", graduationYear: 2020 });
  });

  it("gives a stored ADMIN or LEADER with no rows STUDENT", async () => {
    const admin = await createTestUser("dr-old-admin", "ADMIN");
    const leader = await createTestUser("dr-old-leader", "LEADER");
    expect((await loadScopes(admin.id)).role).toBe("STUDENT");
    expect((await loadScopes(leader.id)).role).toBe("STUDENT");
  });

  it("ignores rows in a finished season", async () => {
    const finished = await createTestSeason({ status: "COMPLETED" });
    const person = await alumnus("dr-finished");
    await makeAdmin(person.id, finished.id);
    expect(await loadScopes(person.id)).toMatchObject({ role: "STUDENT", seasonAdminIds: [] });
  });

  it("Review Focus 3: admin and leader in one season is ADMIN, and still leads the group", async () => {
    const season = await createTestSeason();
    const person = await alumnus("dr-both");
    await makeAdmin(person.id, season.id);
    const groupId = await makeLeader(person.id, season.id);
    const scopes = await loadScopes(person.id);
    expect(scopes).toMatchObject({
      role: "ADMIN",
      seasonAdminIds: [season.id],
      groupLeaderIds: [groupId],
    });
    expect(isLeaderOfGroup({ userId: person.id, ...scopes }, groupId)).toBe(true);
  });

  it.each(["SUPER", "MENTOR"] as const)("keeps %s stored, whatever rows exist", async (role) => {
    const active = await createTestSeason();
    const person = await createTestUser(`dr-${role}`, role);
    await db.user.update({ where: { id: person.id }, data: { graduationYear: 2019 } });
    await makeAdmin(person.id, active.id);
    await makeLeader(person.id, active.id);
    await enrol(person.id, active.id);
    expect(await loadScopes(person.id)).toEqual({
      role,
      seasonAdminIds: [],
      groupLeaderIds: [],
      activeSeasonId: null,
      graduationYear: 2019,
    });
  });
});

describe("a role in an ACTIVE season hides DRAFT grants", () => {
  it("hides them for an ACTIVE admin", async () => {
    const [active, draft] = [await createTestSeason(), await createTestSeason({ status: "DRAFT" })];
    const person = await alumnus("dr-active-admin");
    await makeAdmin(person.id, active.id);
    await makeAdmin(person.id, draft.id);
    await makeLeader(person.id, draft.id);
    expect(await loadScopes(person.id)).toMatchObject({
      role: "ADMIN",
      seasonAdminIds: [active.id],
      groupLeaderIds: [],
    });
  });

  it("hides them for an ACTIVE enrolment", async () => {
    const [active, draft] = [await createTestSeason(), await createTestSeason({ status: "DRAFT" })];
    const person = await createTestUser("dr-active-student", "STUDENT");
    await enrol(person.id, active.id);
    await makeAdmin(person.id, draft.id);
    expect(await loadScopes(person.id)).toMatchObject({
      role: "STUDENT",
      seasonAdminIds: [],
      activeSeasonId: active.id,
    });
  });

  it("does not count an enrolment in a DRAFT season", async () => {
    const draft = await createTestSeason({ status: "DRAFT" });
    const other = await createTestSeason({ status: "DRAFT" });
    const person = await createTestUser("dr-draft-student", "STUDENT");
    await enrol(person.id, draft.id);
    await makeAdmin(person.id, other.id);
    expect(await loadScopes(person.id)).toMatchObject({
      role: "ADMIN",
      seasonAdminIds: [other.id],
      activeSeasonId: null,
    });
  });

  it("GET /seasons leaves out a draft an ACTIVE leader can't open, and keeps the seasons they can", async () => {
    const active = await createTestSeason();
    const draft = await createTestSeason({ status: "DRAFT" });
    const finished = await createTestSeason({ status: "COMPLETED" });
    const serving = await alumnus("dr-list-serving");
    await makeLeader(serving.id, active.id);
    await makeLeader(serving.id, draft.id);
    await makeLeader(serving.id, finished.id);
    const draftOnly = await alumnus("dr-list-draft-only");
    await makeLeader(draftOnly.id, draft.id);

    const seasonIds = async (email: string) => {
      const res = await request(app)
        .get("/api/v1/seasons")
        .set("authorization", `Bearer ${(await signIn(email)).accessToken}`);
      expect(res.status).toBe(200);
      return (res.body.data.seasons as { id: number }[]).map((s) => s.id);
    };
    expect(await seasonIds(serving.email)).toEqual([active.id]);
    expect(await seasonIds(draftOnly.email)).toEqual([draft.id]);
  });

  it("Review Focus 4: draft access arrives on refresh once the other season ends, with no new sign-in", async () => {
    const seasonA = await createTestSeason();
    const seasonB = await createTestSeason({ status: "DRAFT" });
    const person = await alumnus("dr-waiting");
    const sup = await createTestUser("dr-super", "SUPER");
    const groupId = await makeLeader(person.id, seasonA.id);
    await makeAdmin(person.id, seasonB.id);

    const session = await signIn(person.email);
    expect(session.user.role).toBe("LEADER");
    expect(await verifyAccessToken(session.accessToken)).toMatchObject({
      role: "LEADER",
      seasonAdminIds: [],
      groupLeaderIds: [groupId],
    });

    const ended = await request(app)
      .post(`/api/v1/seasons/${seasonA.id}/end`)
      .set("authorization", `Bearer ${await login(app, sup.email)}`)
      .send({ notPassed: [] });
    expect(ended.status).toBe(200);

    const refreshed = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: session.refreshToken });
    expect(refreshed.status).toBe(200);
    expect(await verifyAccessToken(refreshed.body.data.accessToken)).toMatchObject({
      role: "ADMIN",
      seasonAdminIds: [seasonB.id],
      groupLeaderIds: [],
    });
  });
});

describe("what the API reports", () => {
  it("login and GET /me both return the derived role", async () => {
    const season = await createTestSeason();
    const person = await alumnus("dr-api");
    await makeAdmin(person.id, season.id);
    const stale = await createTestUser("dr-api-old", "ADMIN");

    const session = await signIn(person.email);
    expect(session.user.role).toBe("ADMIN");
    const me = await request(app)
      .get("/api/v1/me")
      .set("authorization", `Bearer ${session.accessToken}`);
    expect(me.body.data.user.role).toBe("ADMIN");
    expect(me.body.data.scopes.seasonAdminIds).toEqual([season.id]);

    const old = await signIn(stale.email);
    expect(old.user.role).toBe("STUDENT");
    const oldMe = await request(app)
      .get("/api/v1/me")
      .set("authorization", `Bearer ${old.accessToken}`);
    expect(oldMe.body.data.user.role).toBe("STUDENT");
  });

  it("GET /users filters on season rows and reports the derived role", async () => {
    const [active, draft, finished] = [
      await createTestSeason(),
      await createTestSeason({ status: "DRAFT" }),
      await createTestSeason({ status: "COMPLETED" }),
    ];
    const sup = await createTestUser("dr-users-super", "SUPER");
    const serving = await alumnus("dr-users-admin");
    const drafted = await alumnus("dr-users-draft");
    const leading = await alumnus("dr-users-leader");
    const former = await createTestUser("dr-users-former", "ADMIN");
    const mentor = await createTestUser("dr-users-mentor", "MENTOR");
    await makeAdmin(serving.id, active.id);
    await makeAdmin(drafted.id, draft.id);
    await makeLeader(leading.id, active.id);
    await makeAdmin(former.id, finished.id);
    await makeAdmin(mentor.id, active.id);

    const token = await login(app, sup.email);
    const list = async (role: string) => {
      const res = await request(app)
        .get("/api/v1/users")
        .query({ role, q: "dr-users-", limit: 100 })
        .set("authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      return Object.fromEntries(
        (res.body.data.users as { id: number; role: string }[]).map((u) => [u.id, u.role]),
      );
    };

    expect(await list("ADMIN")).toEqual({ [serving.id]: "ADMIN", [drafted.id]: "ADMIN" });
    expect(await list("LEADER")).toEqual({ [leading.id]: "LEADER" });
    expect(await list("MENTOR")).toEqual({ [mentor.id]: "MENTOR" });
    expect(await list("STUDENT")).toEqual({ [former.id]: "STUDENT" });

    const detail = await request(app)
      .get(`/api/v1/users/${serving.id}`)
      .set("authorization", `Bearer ${token}`);
    expect(detail.body.data.role).toBe("ADMIN");
  });

  it("a note reports its author's derived role", async () => {
    const season = await createTestSeason();
    const leader = await alumnus("dr-note-author");
    const student = await createTestUser("dr-note-student", "STUDENT");
    const groupId = await makeLeader(leader.id, season.id);
    await db.seasonEnrollment.create({
      data: { studentUserId: student.id, seasonId: season.id, status: "ACTIVE", groupId },
    });
    const token = (await signIn(leader.email)).accessToken;
    const auth = { authorization: `Bearer ${token}` };

    const created = await request(app)
      .post(`/api/v1/students/${student.id}/notes`)
      .set(auth)
      .send({ body: "A note", visibility: "LEADERS" });
    expect(created.status).toBe(201);
    expect(created.body.data.note.authorRole).toBe("LEADER");

    const listed = await request(app).get(`/api/v1/students/${student.id}/notes`).set(auth);
    expect(listed.body.data.notes[0].authorRole).toBe("LEADER");

    const edited = await request(app)
      .patch(`/api/v1/notes/${created.body.data.note.id}`)
      .set(auth)
      .send({ body: "Edited" });
    expect(edited.body.data.note.authorRole).toBe("LEADER");
  });
});
