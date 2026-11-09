// The mentor's "Absent lately" (owner, 2026-11-07): last two marked sessions both ABSENT.
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();
let mentorToken: string;
let superToken: string;
const ids: Record<string, number> = {};

const day = (n: number) => new Date(Date.now() - n * 86_400_000);

beforeAll(async () => {
  await cleanupTestData();
  const mentor = await createTestUser("al-mentor", "MENTOR");
  const sup = await createTestUser("al-super", "SUPER");
  mentorToken = await login(app, mentor.email);
  superToken = await login(app, sup.email);

  const season = await createTestSeason();
  const s = await Promise.all(
    [3, 2, 1, -1].map((n, i) =>
      db.session.create({ data: { seasonId: season.id, title: `S${i}`, startsAt: day(n) }, select: { id: true } }),
    ),
  );
  // marks per student, oldest session first (S0 3 days ago ... S2 yesterday); S3 is tomorrow.
  const plan: Record<string, ("PRESENT" | "ABSENT" | "LATE" | null)[]> = {
    twoAbsent: [null, "ABSENT", "ABSENT", null],
    presentThenTwo: ["PRESENT", "ABSENT", "ABSENT", null],
    lateBreaks: ["ABSENT", "ABSENT", "LATE", null],
    oneMark: [null, null, "ABSENT", null],
    futureIgnored: [null, "PRESENT", "ABSENT", "ABSENT"],
  };
  for (const [label, marks] of Object.entries(plan)) {
    const u = await createTestUser(`al-${label}`, "STUDENT");
    ids[label] = u.id;
    await db.seasonEnrollment.create({ data: { seasonId: season.id, studentUserId: u.id, status: "ACTIVE" } });
    for (const [i, status] of marks.entries()) {
      if (status) await db.attendance.create({ data: { sessionId: s[i]!.id, studentUserId: u.id, status } });
    }
  }
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

async function absentIds(): Promise<number[]> {
  const res = await request(app)
    .get("/api/v1/students?absentLately=1&limit=100&q=al-")
    .set("authorization", `Bearer ${mentorToken}`);
  expect(res.status).toBe(200);
  return res.body.data.students.map((r: { id: number }) => r.id);
}

describe("GET /students?absentLately=1", () => {
  it("lists those whose last two marked sessions were both absences", async () => {
    const got = await absentIds();
    expect(got).toEqual(expect.arrayContaining([ids.twoAbsent, ids.presentThenTwo]));
    expect(got).not.toContain(ids.lateBreaks);
    expect(got).not.toContain(ids.oneMark);
    expect(got).not.toContain(ids.futureIgnored);
  });

  it("is refused to anyone but a mentor", async () => {
    const res = await request(app).get("/api/v1/students?absentLately=1").set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(403);
  });

  it("matches the mentor's Home figure", async () => {
    const summary = await request(app).get("/api/v1/me/mentor-summary").set("authorization", `Bearer ${mentorToken}`);
    const all = await request(app)
      .get("/api/v1/students?absentLately=1&limit=1")
      .set("authorization", `Bearer ${mentorToken}`);
    expect(summary.body.data.absentLately).toBe(all.body.data.total);
  });
});
