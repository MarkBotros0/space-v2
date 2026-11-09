// Community model, Build 3, Task 2: a community-wide season runs alone, and the Start checks.
import request from "supertest";

import { db } from "../../db/client";
import {
  app,
  as,
  ctx,
  person,
  season,
  seedEnrollmentFixtures,
  teardownEnrollmentFixtures,
} from "./season-enrollments-setup";

jest.setTimeout(120000);

beforeAll(seedEnrollmentFixtures);
afterAll(teardownEnrollmentFixtures);
// A season left ACTIVE would block the next test's Start: end the ones this test made.
const made: number[] = [];
afterEach(async () => {
  await db.season.updateMany({
    where: { id: { in: made.splice(0) }, status: "ACTIVE" },
    data: { status: "COMPLETED" },
  });
});
const mk = async (status: Parameters<typeof season>[0], title?: string) => {
  const id = await season(status, title);
  made.push(id);
  return id;
};

const check = (id: number) => request(app).get(`/api/v1/seasons/${id}/start-check`).set(as(ctx.superToken));
const start = (id: number) => request(app).post(`/api/v1/seasons/${id}/start`).set(as(ctx.superToken)).send({});
const wide = async (status: "DRAFT" | "ACTIVE" | "COMPLETED", title: string) => {
  const id = await season(status, title);
  made.push(id);
  await db.season.update({ where: { id }, data: { isCommunityWide: true } });
  return id;
};
const statusOf = async (id: number) =>
  (await db.season.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;
const codeOf = async (id: number) =>
  (await db.season.findUniqueOrThrow({ where: { id }, select: { code: true } })).code;

describe("seasonsInTheWay", () => {
  it("a community-wide draft can't start while another season is ACTIVE", async () => {
    const running = await mk("ACTIVE", "3G 2026");
    const id = await wide("DRAFT", "JPC 2027");
    const res = await check(id);
    expect(res.body.data).toEqual({
      ready: false,
      items: [],
      seasonsInTheWay: [
        {
          id: running,
          code: await codeOf(running),
          title: "3G 2026",
          message: "3G 2026 is still running. End it first.",
        },
      ],
    });
    const started = await start(id);
    expect([started.status, started.body.error.code]).toEqual([409, "start_blocked"]);
    expect(started.body.error.message).toBe("3G 2026 is still running. End it first.");
    expect(await statusOf(id)).toBe("DRAFT");
  });

  it("a regular draft can't start while a community-wide season is ACTIVE", async () => {
    const running = await wide("ACTIVE", "JPC 2027");
    const id = await mk("DRAFT");
    const res = await check(id);
    expect(res.body.data.ready).toBe(false);
    expect(res.body.data.seasonsInTheWay).toEqual([
      {
        id: running,
        code: await codeOf(running),
        title: "JPC 2027",
        message: "The community-wide season JPC 2027 is running. End it first.",
      },
    ]);
    const started = await start(id);
    expect([started.status, started.body.error.code]).toEqual([409, "start_blocked"]);
    await db.season.update({ where: { id: running }, data: { status: "COMPLETED" } });
    expect((await start(id)).status).toBe(200);
  });

  it("two regular seasons still run side by side", async () => {
    const running = await mk("ACTIVE", "Running");
    const id = await mk("DRAFT");
    expect((await check(id)).body.data).toEqual({ ready: true, items: [], seasonsInTheWay: [] });
    expect((await start(id)).status).toBe(200);
    expect(await statusOf(running)).toBe("ACTIVE");
  });

  it("finished, draft and deleted seasons are not in the way", async () => {
    await mk("COMPLETED", "Done");
    await mk("DRAFT", "Later");
    const gone = await mk("ACTIVE", "Gone");
    await db.season.update({ where: { id: gone }, data: { deletedAt: new Date() } });
    const id = await wide("DRAFT", "Alone");
    expect((await check(id)).body.data.seasonsInTheWay).toEqual([]);
    expect((await start(id)).status).toBe(200);
  });
});

describe("one person in both seats of one draft", () => {
  it.each([
    ["community-wide", true],
    ["regular", false],
  ])("is already_in_role in a %s draft, once, either order", async (_name, communityWide) => {
    for (const asLeader of [false, true]) {
      const id = communityWide ? await wide("DRAFT", "Both") : await mk("DRAFT", "Both");
      const mina = await person("Mina", 2015);
      if (asLeader) {
        await db.seasonEnrollment.create({ data: { seasonId: id, studentUserId: mina.id, status: "ACTIVE" } });
        await db.group.create({ data: { seasonId: id, name: "G", leaders: { create: [{ userId: mina.id }] } } });
      } else {
        await db.group.create({ data: { seasonId: id, name: "G", leaders: { create: [{ userId: mina.id }] } } });
        await db.seasonEnrollment.create({ data: { seasonId: id, studentUserId: mina.id, status: "ACTIVE" } });
      }
      const res = await check(id);
      expect(res.body.data.items).toEqual([
        {
          userId: mina.id,
          name: "Mina",
          seat: "student",
          reason: "already_in_role",
          message: "Mina is both serving and a student in this season.",
          otherSeasonCode: null,
        },
      ]);
      expect((await start(id)).body.error.code).toBe("start_blocked");
    }
  });
});

describe("an alumnus in a community-wide draft", () => {
  it("is not an issue as a student", async () => {
    const id = await wide("DRAFT", "Open to all");
    const amir = await person("Amir", 2019);
    await db.seasonEnrollment.create({ data: { seasonId: id, studentUserId: amir.id, status: "ACTIVE" } });
    expect((await check(id)).body.data).toEqual({ ready: true, items: [], seasonsInTheWay: [] });
    expect((await start(id)).status).toBe(200);
  });
});
