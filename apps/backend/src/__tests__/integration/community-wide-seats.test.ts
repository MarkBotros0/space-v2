// Community model, Build 3, Task 1: who can take a student seat in a community-wide season.
import request from "supertest";

import { db } from "../../db/client";
import { add, app, as, ctx, leading, person, season, seedEnrollmentFixtures, teardownEnrollmentFixtures } from "./season-enrollments-setup";

jest.setTimeout(120000);

beforeAll(seedEnrollmentFixtures);
afterAll(teardownEnrollmentFixtures);

const wide = async (status: "DRAFT" | "ACTIVE") => {
  const id = await season(status);
  await db.season.update({ where: { id }, data: { isCommunityWide: true } });
  return id;
};

describe("student seats in a community-wide season", () => {
  it.each(["DRAFT", "ACTIVE"] as const)("an alumnus joins a %s one as a student", async (status) => {
    const id = await wide(status);
    const alumnus = await person("Old Hand", 2019);
    const res = await add(id, { userIds: [alumnus.id] });
    expect(res.status).toBeLessThan(300);
    expect(await db.seasonEnrollment.count({ where: { seasonId: id, studentUserId: alumnus.id } })).toBe(1);
  });

  it("the same alumnus joining a regular season is still refused as is_alumnus", async () => {
    const id = await season("DRAFT");
    const alumnus = await person("Old Hand Two", 2019);
    const res = await add(id, { userIds: [alumnus.id] });
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).toContain("is an alumnus");
  });

  it("a Super is permanent_role in a community-wide season", async () => {
    const id = await wide("DRAFT");
    const res = await add(id, { userIds: [ctx.superId] });
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).toContain("can't take a season role");
  });

  it("a Mentor is permanent_role in a community-wide season", async () => {
    const id = await wide("DRAFT");
    const mentor = await person("Mentor", null);
    await db.user.update({ where: { id: mentor.id }, data: { role: "MENTOR" } });
    const res = await add(id, { userIds: [mentor.id] });
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).toContain("can't take a season role");
  });

  it("someone serving elsewhere in an ACTIVE season is already_in_role", async () => {
    const id = await wide("ACTIVE");
    const server = await person("Server", 2018);
    await leading(server.id);
    const res = await add(id, { userIds: [server.id] });
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).toContain("already leading");
  });

  it("switching a draft to regular with an alumnus on it works, and Start lists them as is_alumnus", async () => {
    const id = await wide("DRAFT");
    const alumnus = await person("Switched", 2017);
    expect((await add(id, { userIds: [alumnus.id] })).status).toBeLessThan(300);
    const row = await db.season.findUniqueOrThrow({ where: { id }, select: { code: true, program: true } });
    const patch = await request(app)
      .patch(`/api/v1/seasons/${id}`)
      .set(as(ctx.superToken))
      .send({
        program: row.program, year: 2099, code: row.code, status: "DRAFT", isCommunityWide: false,
        startDate: "2099-01-01T00:00:00.000Z", endDate: "2099-12-31T00:00:00.000Z",
      });
    expect(patch.status).toBe(200);
    const check = await request(app).get(`/api/v1/seasons/${id}/start-check`).set(as(ctx.superToken));
    expect(check.body.data.items).toEqual([
      expect.objectContaining({ userId: alumnus.id, seat: "student", reason: "is_alumnus" }),
    ]);
  });
});
