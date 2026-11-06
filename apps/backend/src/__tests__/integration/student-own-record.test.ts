// C2, I1, I6: what a person sees of their own past. A drop reason stays with
// staff; a draft season is not history; a former leader's list is not the
// finished season.
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { loadScopes } from "../../lib/auth/scopes";
import { signAccessToken } from "../../lib/auth/tokens";
import { cleanupTestData, createTestSeason, createTestUser } from "./fixtures";

jest.setTimeout(120000);

const app = createApp();

async function mint(userId: number) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { role: true } });
  const scopes = await loadScopes(userId);
  return (await signAccessToken({ userId, role: user.role, ...scopes })).token;
}
const get = (path: string, t: string) =>
  request(app).get(`/api/v1${path}`).set("authorization", `Bearer ${t}`);

beforeAll(cleanupTestData);
afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("a drop reason (C2)", () => {
  it("is withheld from the student and a Mentor, and kept for Super", async () => {
    const season = await createTestSeason();
    const [student, mentor, sup] = await Promise.all([
      createTestUser("own-dropped", "STUDENT"),
      createTestUser("own-mentor", "MENTOR"),
      createTestUser("own-super", "SUPER"),
    ]);
    await db.seasonEnrollment.create({
      data: {
        seasonId: season.id, studentUserId: student.id, status: "WITHDRAWN",
        droppedAt: new Date(), dropReason: "Private staff reason",
      },
    });
    const reason = async (t: string) => {
      const res = await get(`/students/${student.id}`, t);
      expect(res.status).toBe(200);
      expect(res.body.data.enrollments).toHaveLength(1);
      return res.body.data.enrollments[0].dropReason;
    };
    expect(await reason(await mint(student.id))).toBeNull();
    expect(await reason(await mint(mentor.id))).toBeNull();
    expect(await reason(await mint(sup.id))).toBe("Private staff reason");
  });
});

describe("a draft season in a student's past (I6)", () => {
  it.each(["WITHDRAWN", "COMPLETED"] as const)("a %s enrolment in a DRAFT is not history", async (status) => {
    const draft = await createTestSeason({ status: "DRAFT" });
    const finished = await createTestSeason({ status: "COMPLETED" });
    const student = await createTestUser(`own-draft-${status.toLowerCase()}`, "STUDENT");
    await db.seasonEnrollment.createMany({
      data: [
        { seasonId: draft.id, studentUserId: student.id, status },
        { seasonId: finished.id, studentUserId: student.id, status: "COMPLETED", result: "PASSED", enrolledAt: new Date("2020-01-01") },
      ],
    });
    const t = await mint(student.id);

    const history = await get("/me/season-history", t);
    expect(history.status).toBe(200);
    expect(history.body.data.seasons.map((s: { code: string }) => s.code)).toEqual([finished.code]);

    expect((await get(`/me/seasons/${draft.id}`, t)).status).toBe(404);
    expect((await get(`/me/seasons/${finished.id}`, t)).status).toBe(200);
  });
});

describe("a former leader's seasons (I1)", () => {
  it("lists only DRAFT and ACTIVE seasons they lead", async () => {
    const leader = await createTestUser("own-former-leader", "LEADER");
    const seasons = {
      draft: await createTestSeason({ status: "DRAFT" }),
      active: await createTestSeason({ status: "ACTIVE" }),
      completed: await createTestSeason({ status: "COMPLETED" }),
      archived: await createTestSeason({ status: "ARCHIVED" }),
    };
    for (const s of Object.values(seasons)) {
      await db.group.create({
        data: { seasonId: s.id, name: `own-g-${s.id}`, leaders: { create: { userId: leader.id } } },
      });
    }
    const res = await get("/seasons", await mint(leader.id));
    expect(res.status).toBe(200);
    expect(res.body.data.seasons.map((s: { id: number }) => s.id).sort((a: number, b: number) => a - b)).toEqual(
      [seasons.draft.id, seasons.active.id].sort((a, b) => a - b),
    );
  });

  it("a leader of only a finished season has an empty list, not a season to 403 on", async () => {
    const leader = await createTestUser("own-only-finished", "LEADER");
    const done = await createTestSeason({ status: "COMPLETED" });
    await db.group.create({
      data: { seasonId: done.id, name: "own-only-g", leaders: { create: { userId: leader.id } } },
    });
    const res = await get("/seasons", await mint(leader.id));
    expect(res.body.data.seasons).toEqual([]);
  });
});
