import path from "node:path";

import type * as PgModule from "pg";

import request from "supertest";

import { studentListResponseSchema } from "../../../../../packages/shared/src/index";
import { createApp } from "../../app";
import { db } from "../../db/client";
import { bearer, cleanupTestData, createTestUser } from "./fixtures";
import { seedPassingWorld, type PassingWorld } from "./season-passing-setup";

jest.setTimeout(120000);

const app = createApp();

let w: PassingWorld;

// The `pg` the Prisma adapter talks through, so every statement it sends can be counted.
const pg = require(
  require.resolve("pg", { paths: [path.dirname(require.resolve("@prisma/adapter-pg"))] }),
) as typeof PgModule;

beforeAll(async () => {
  await cleanupTestData();
  w = await seedPassingWorld();
  // 20 more students in group A with nothing done, so a page of 20 is all one season.
  for (let i = 0; i < 20; i += 1) {
    const s = await createTestUser(`pass-extra-${String(i).padStart(2, "0")}`, "STUDENT");
    await db.seasonEnrollment.create({
      data: { seasonId: w.seasonId, studentUserId: s.id, groupId: w.groupA, status: "ACTIVE" },
    });
  }
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

type Row = { id: number; progress?: unknown };

function list(token: string, query: string) {
  return request(app).get(`/api/v1/students?${query}`).set(bearer(token));
}

async function countQueries(run: () => Promise<unknown>): Promise<number> {
  const spy = jest.spyOn(pg.Client.prototype, "query");
  try {
    await run();
    return spy.mock.calls.length;
  } finally {
    spy.mockRestore();
  }
}

describe("GET /students progress", () => {
  it("the list carries progress per page with a fixed number of queries", async () => {
    const q = `seasonId=${w.seasonId}&q=space-v2-test`;
    const res = await list(w.tokens.admin, `${q}&limit=25`);
    expect(res.status).toBe(200);
    expect(studentListResponseSchema.safeParse(res.body.data).success).toBe(true);
    const rows: Row[] = res.body.data.students;
    // The three, the 20, and the withdrawn student (a season's list shows any status).
    expect(rows).toHaveLength(24);
    expect(rows.find((r) => r.id === w.users.middle.id)?.progress).toEqual({
      attendancePct: null,
      assignmentsPct: 50,
      quizPct: 60,
    });
    expect(rows.find((r) => r.id === w.users.short.id)?.progress).toEqual({
      attendancePct: null,
      assignmentsPct: 100,
      quizPct: 4,
    });

    const small = await countQueries(() => list(w.tokens.admin, `${q}&limit=2`));
    const large = await countQueries(() => list(w.tokens.admin, `${q}&limit=20`));
    expect(small).toBeGreaterThan(0);
    expect(large).toBe(small);
  });

  it("a leader's rows carry progress for their own group's students", async () => {
    const rows: Row[] = (await list(w.tokens.leaderB, "limit=100")).body.data.students;
    expect(rows.map((r) => r.id)).toEqual([w.users.middle.id]);
    expect(rows[0]?.progress).toEqual({ attendancePct: null, assignmentsPct: 50, quizPct: 60 });
  });

  it("a mentor's rows carry no progress, and nothing is loaded for it", async () => {
    const q = `seasonId=${w.seasonId}&q=space-v2-test`;
    const res = await list(w.tokens.mentor, `${q}&limit=25`);
    expect(res.status).toBe(200);
    const rows: Row[] = res.body.data.students;
    expect(rows).toHaveLength(24);
    expect(rows.every((r) => r.progress === null)).toBe(true);
    // The admin's page loads the season's numbers on top of the same list queries; the mentor's doesn't.
    const mentor = await countQueries(() => list(w.tokens.mentor, `${q}&limit=20`));
    const admin = await countQueries(() => list(w.tokens.admin, `${q}&limit=20`));
    expect(mentor).toBeLessThan(admin);
  });

  it("a row with no current season has no progress", async () => {
    const loner = await createTestUser("pass-loner", "STUDENT");
    const rows: Row[] = (await list(w.tokens.super, "q=pass-loner")).body.data.students;
    expect(rows.find((r) => r.id === loner.id)?.progress).toBeNull();
  });

  it("alumni list rows have no progress", async () => {
    await db.user.update({ where: { id: w.users.onTrack.id }, data: { graduationYear: 2025 } });
    try {
      const res = await list(w.tokens.super, "status=alumni&q=pass-on-track");
      expect(res.status).toBe(200);
      const rows: Row[] = res.body.data.students;
      expect(rows.map((r) => r.id)).toEqual([w.users.onTrack.id]);
      expect(rows[0]?.progress).toBeNull();
    } finally {
      await db.user.update({ where: { id: w.users.onTrack.id }, data: { graduationYear: null } });
    }
  });

  it("dropped list rows have no progress", async () => {
    const res = await list(w.tokens.super, `status=dropped&seasonId=${w.seasonId}`);
    expect(res.status).toBe(200);
    const rows: Row[] = res.body.data.students;
    expect(rows.map((r) => r.id)).toEqual([w.users.withdrawn.id]);
    expect(rows[0]?.progress).toBeNull();
  });
});
