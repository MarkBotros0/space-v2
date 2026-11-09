// A rename must not change who is in a group. The form lists the season roster,
// which leaves out anyone no longer a live STUDENT, so a member who now serves
// (routine: all staff are former students) or whose account was deleted is never
// in its `studentIds`. Taking them out would rewrite History, the workbook and
// targeted assignments.
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { loadScopes } from "../../lib/auth/scopes";
import { signAccessToken } from "../../lib/auth/tokens";
import { cleanupTestData, createTestSeason, createTestUser } from "./fixtures";

jest.setTimeout(120000);

const app = createApp();
let superT: string;

async function mint(userId: number) {
  const scopes = await loadScopes(userId);
  return (await signAccessToken({ userId, ...scopes })).token;
}
const patch = (groupId: number, body: object) =>
  request(app).patch(`/api/v1/groups/${groupId}`).set("authorization", `Bearer ${superT}`).send(body);

beforeAll(async () => {
  await cleanupTestData();
  superT = await mint((await createTestUser("rename-super", "SUPER")).id);
});
afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

let n = 0;
async function world(seasonStatus: "ACTIVE" | "COMPLETED", enrolStatus: "ACTIVE" | "COMPLETED") {
  n += 1;
  const season = await createTestSeason({ status: seasonStatus });
  const [stays, goes, served, deleted, leader] = await Promise.all([
    createTestUser(`rename-stays-${n}`, "STUDENT"),
    createTestUser(`rename-goes-${n}`, "STUDENT"),
    createTestUser(`rename-served-${n}`, "LEADER"),
    createTestUser(`rename-deleted-${n}`, "STUDENT"),
    createTestUser(`rename-leader-${n}`, "LEADER"),
  ]);
  const group = await db.group.create({
    data: { seasonId: season.id, name: `Rename ${n}`, leaders: { create: { userId: leader.id } } },
    select: { id: true },
  });
  for (const u of [stays, goes, served, deleted]) {
    await db.seasonEnrollment.create({
      data: { seasonId: season.id, studentUserId: u.id, groupId: group.id, status: enrolStatus },
    });
    await db.groupStudent.create({ data: { groupId: group.id, seasonId: season.id, studentUserId: u.id } });
  }
  await db.user.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });
  const inGroup = async (studentUserId: number) => {
    const [enrolment, mirror] = await Promise.all([
      db.seasonEnrollment.findUniqueOrThrow({
        where: { studentUserId_seasonId: { studentUserId, seasonId: season.id } },
        select: { groupId: true },
      }),
      db.groupStudent.count({ where: { groupId: group.id, seasonId: season.id, studentUserId } }),
    ]);
    return enrolment.groupId === group.id && mirror === 1;
  };
  return {
    seasonId: season.id,
    groupId: group.id,
    stays: stays.id,
    goes: goes.id,
    served: served.id,
    deleted: deleted.id,
    leader: leader.id,
    inGroup,
  };
}

describe.each([
  ["a finished season", "COMPLETED", "COMPLETED"],
  ["a live season", "ACTIVE", "ACTIVE"],
] as const)("in %s", (_label, seasonStatus, enrolStatus) => {
  it("the form's full body keeps a role-changed and a soft-deleted member", async () => {
    const w = await world(seasonStatus, enrolStatus);
    const res = await patch(w.groupId, {
      name: "New name",
      leaderIds: [w.leader],
      studentIds: [w.stays, w.goes],
    });
    expect(res.status).toBe(200);
    for (const id of [w.stays, w.goes, w.served, w.deleted]) expect(await w.inGroup(id)).toBe(true);
  });

  it("PATCH {name} leaves the roster and the leaders alone", async () => {
    const w = await world(seasonStatus, enrolStatus);
    const res = await patch(w.groupId, { name: "Only the name" });
    expect(res.status).toBe(200);
    for (const id of [w.stays, w.goes, w.served, w.deleted]) expect(await w.inGroup(id)).toBe(true);
    expect(await db.groupLeader.count({ where: { groupId: w.groupId, userId: w.leader } })).toBe(1);
    expect((await db.group.findUniqueOrThrow({ where: { id: w.groupId } })).name).toBe("Only the name");
  });

  it("a live STUDENT left off the list on purpose is still removed, and nobody else", async () => {
    const w = await world(seasonStatus, enrolStatus);
    const res = await patch(w.groupId, { name: "Fewer", leaderIds: [w.leader], studentIds: [w.stays] });
    expect(res.status).toBe(200);
    expect(await w.inGroup(w.goes)).toBe(false);
    for (const id of [w.stays, w.served, w.deleted]) expect(await w.inGroup(id)).toBe(true);
  });

  it("an explicit empty list removes the live students only", async () => {
    const w = await world(seasonStatus, enrolStatus);
    expect((await patch(w.groupId, { name: "Empty", studentIds: [] })).status).toBe(200);
    expect(await w.inGroup(w.stays)).toBe(false);
    expect(await w.inGroup(w.goes)).toBe(false);
    expect(await w.inGroup(w.served)).toBe(true);
    expect(await w.inGroup(w.deleted)).toBe(true);
  });
});

describe("creating a group", () => {
  it("still defaults to no students and no leaders", async () => {
    const season = await createTestSeason({ status: "ACTIVE" });
    const res = await request(app)
      .post(`/api/v1/seasons/${season.id}/groups`)
      .set("authorization", `Bearer ${superT}`)
      .send({ name: "Fresh group" });
    expect(res.status).toBe(201);
    expect(await db.seasonEnrollment.count({ where: { groupId: res.body.data.id } })).toBe(0);
  });
});
