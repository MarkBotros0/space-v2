// Source seasons on GET /seasons/:id/people-candidates (owner, 2026-11-07): the
// admin picks a finished season and adds the people who passed it; the one this
// season normally follows is suggested.
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

jest.setTimeout(120000);

const app = createApp();
let superToken: string;
let n = 0;

type Status = "DRAFT" | "ACTIVE" | "COMPLETED" | "ARCHIVED";
const as = (token: string) => ({ authorization: `Bearer ${token}` });
/** A program name no other data uses, so "the last finished season" is ours. */
const program = () => `PREV${Date.now().toString(36)}${++n}`;

const person = async (name: string, graduationYear: number | null = null) => {
  const user = await createTestUser(`pcp-${++n}`, "STUDENT");
  await db.user.update({ where: { id: user.id }, data: { name, graduationYear } });
  return user;
};
const season = async (
  status: Status,
  prog: string,
  year: number,
  opts: { requiredProgram?: string; isCommunityWide?: boolean; endMonth?: number } = {},
) => {
  const row = await createTestSeason({ status });
  await db.season.update({
    where: { id: row.id },
    data: {
      title: `${prog} ${year}`,
      program: prog,
      year,
      requiredProgram: opts.requiredProgram ?? null,
      isCommunityWide: opts.isCommunityWide ?? false,
      startDate: new Date(Date.UTC(year, 0, 1)),
      endDate: new Date(Date.UTC(year, opts.endMonth ?? 5, 1)),
    },
  });
  return row;
};
const place = (
  seasonId: number,
  studentUserId: number,
  status: "ACTIVE" | "COMPLETED" | "WITHDRAWN",
  result: "PASSED" | "NOT_PASSED" | null = null,
) => db.seasonEnrollment.create({ data: { seasonId, studentUserId, status, result } });
const candidates = (seasonId: number) =>
  request(app).get(`/api/v1/seasons/${seasonId}/people-candidates`).set(as(superToken));
type Row = { id: number; places: { seasonId: number; outcome: string }[] };
const outcomeIn = (res: request.Response, id: number, seasonId: number) => {
  const row = (res.body.data.people as Row[]).find((p) => p.id === id);
  return row ? (row.places.find((pl) => pl.seasonId === seasonId)?.outcome ?? null) : undefined;
};

beforeAll(async () => {
  await cleanupTestData();
  superToken = await login(app, (await createTestUser("pcp-super", "SUPER")).email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("people-candidates: source seasons", () => {
  it("suggests the last finished season of the same program, and says how each place ended", async () => {
    const prog = program();
    const older = await season("COMPLETED", prog, 2024);
    const last = await season("ARCHIVED", prog, 2025);
    const running = await season("ACTIVE", prog, 2026, { endMonth: 11 });
    const next = await season("DRAFT", prog, 2027);

    const passed = await person("Pia Passed");
    const failed = await person("Fadi Failed");
    const dropped = await person("Dina Dropped");
    const absent = await person("Adam Absent");
    const graduate = await person("Gina Graduate", 2025);
    await place(last.id, passed.id, "COMPLETED", "PASSED");
    await place(last.id, failed.id, "COMPLETED", "NOT_PASSED");
    await place(last.id, dropped.id, "WITHDRAWN");
    await place(last.id, graduate.id, "COMPLETED", "PASSED");

    await place(older.id, failed.id, "COMPLETED", "PASSED");

    const res = await candidates(next.id);
    expect(res.status).toBe(200);
    expect(res.body.data.season.suggestedSourceId).toBe(last.id);
    const sources = res.body.data.season.sources as { id: number }[];
    // Newest end first; an alumnus passer isn't listed by a regular season, so is counted as graduated.
    expect(sources.filter((s) => s.id === last.id || s.id === older.id)).toEqual([
      { id: last.id, code: last.code, title: `${prog} 2025`, passed: 1, graduated: 1 },
      { id: older.id, code: older.code, title: `${prog} 2024`, passed: 1, graduated: 0 },
    ]);
    expect(outcomeIn(res, passed.id, last.id)).toBe("passed");
    expect(outcomeIn(res, failed.id, last.id)).toBe("not_passed");
    expect(outcomeIn(res, failed.id, older.id)).toBe("passed");
    expect(outcomeIn(res, dropped.id, last.id)).toBe("dropped");
    expect(outcomeIn(res, absent.id, last.id)).toBeNull();
    expect(outcomeIn(res, graduate.id, last.id)).toBeUndefined();
    // A running season is never a source, even with a later end date.
    await place(running.id, absent.id, "COMPLETED", "PASSED");
    expect(
      ((await candidates(next.id)).body.data.season.sources as { id: number }[]).some((s) => s.id === running.id),
    ).toBe(false);
  });

  it("follows the required program over the season's own", async () => {
    const base = program();
    const lead = program();
    const gbv = await season("COMPLETED", base, 2026);
    await season("COMPLETED", lead, 2026, { endMonth: 10 });
    const target = await season("DRAFT", lead, 2027, { requiredProgram: base });
    const passer = await person("Paul Base");
    await place(gbv.id, passer.id, "COMPLETED", "PASSED");
    const res = await candidates(target.id);
    expect(res.body.data.season.suggestedSourceId).toBe(gbv.id);
  });

  it("suggests nothing when the program never finished, when nobody passed, or for a community-wide season", async () => {
    const prog = program();
    await season("ACTIVE", prog, 2026);
    const fresh = await season("DRAFT", prog, 2027);
    expect((await candidates(fresh.id)).body.data.season.suggestedSourceId).toBeNull();

    const emptyProg = program();
    const nobody = await season("COMPLETED", emptyProg, 2025);
    const after = await season("DRAFT", emptyProg, 2026);
    const res0 = await candidates(after.id);
    expect(res0.body.data.season.suggestedSourceId).toBeNull();
    expect((res0.body.data.season.sources as { id: number }[]).some((s) => s.id === nobody.id)).toBe(false);

    const wideProg = program();
    const before = await season("COMPLETED", wideProg, 2025);
    await place(before.id, (await person("Wade Wide")).id, "COMPLETED", "PASSED");
    const wide = await season("DRAFT", wideProg, 2026, { isCommunityWide: true });
    expect((await candidates(wide.id)).body.data.season.suggestedSourceId).toBeNull();
  });

  it("lists people added to a draft on its roster, which the group form picks from", async () => {
    const draft = await season("DRAFT", program(), 2027);
    const roster = () => request(app).get(`/api/v1/seasons/${draft.id}/roster`).set(as(superToken));
    expect((await roster()).body.data.roster).toEqual([]);

    const a = await person("Rana Roster");
    const added = await request(app)
      .post(`/api/v1/seasons/${draft.id}/enrollments`)
      .set(as(superToken))
      .send({ userIds: [a.id] });
    expect(added.status).toBe(201);
    expect((await roster()).body.data.roster).toEqual([
      expect.objectContaining({ userId: a.id, groupId: null, groupName: null }),
    ]);
  });
});
