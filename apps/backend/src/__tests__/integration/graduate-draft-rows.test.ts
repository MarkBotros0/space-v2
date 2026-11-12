// Graduating with a row on a draft's roster: the row is a plan, not history, so
// it goes, under the same rule as Remove. Work recorded on it keeps it.
import request from "supertest";

import { db } from "../../db/client";
import { endBodyOf } from "./fixtures";
import {
  app,
  as,
  ctx,
  person,
  rowOf,
  season,
  seedEnrollmentFixtures,
  teardownEnrollmentFixtures,
} from "./season-enrollments-setup";

jest.setTimeout(120000);

beforeAll(seedEnrollmentFixtures);
afterAll(teardownEnrollmentFixtures);

const graduate = (id: number) =>
  request(app)
    .post(`/api/v1/students/${id}/graduate`)
    .set(as(ctx.superToken))
    .send({ graduationYear: 2026, override: true, overrideReason: "Test exception, see ticket" });

const onDraft = async (name: string) => {
  const draft = await season("DRAFT", "Next Season");
  const x = await person(name);
  await db.seasonEnrollment.create({ data: { seasonId: draft, studentUserId: x.id, status: "ACTIVE" } });
  return { draft, x };
};

describe("graduating someone on a draft's roster", () => {
  it("takes the row and the group place off the draft", async () => {
    const { draft, x } = await onDraft("Planned");
    const group = await db.group.create({ data: { seasonId: draft, name: "Draft group" } });
    await db.groupStudent.create({ data: { seasonId: draft, groupId: group.id, studentUserId: x.id } });
    const res = await graduate(x.id);
    expect(res.status).toBe(200);
    expect(res.body.data.enrollmentsCompleted).toBe(0);
    expect(await rowOf(draft, x.id)).toBeNull();
    expect(await db.groupStudent.count({ where: { seasonId: draft, studentUserId: x.id } })).toBe(0);
  });

  it("still completes a row in a live season", async () => {
    const { draft, x } = await onDraft("Live And Planned");
    const live = await season("ACTIVE", "Now");
    await db.seasonEnrollment.create({ data: { seasonId: live, studentUserId: x.id, status: "ACTIVE" } });
    const res = await graduate(x.id);
    expect(res.body.data.enrollmentsCompleted).toBe(1);
    expect((await rowOf(live, x.id))?.status).toBe("COMPLETED");
    expect(await rowOf(draft, x.id)).toBeNull();
  });

  it("leaves a dropped draft row alone", async () => {
    const draft = await season("DRAFT", "Next Season");
    const x = await person("Dropped From Draft");
    await db.seasonEnrollment.create({ data: { seasonId: draft, studentUserId: x.id, status: "WITHDRAWN" } });
    expect((await graduate(x.id)).status).toBe(200);
    expect((await rowOf(draft, x.id))?.status).toBe("WITHDRAWN");
  });

  it("completes the row rather than lose work recorded on it", async () => {
    const { draft, x } = await onDraft("Has Work");
    const session = await db.session.create({
      data: { seasonId: draft, title: "Early", startsAt: new Date(), durationMinutes: 60 },
    });
    await db.attendance.create({ data: { sessionId: session.id, studentUserId: x.id, status: "PRESENT" } });
    expect((await graduate(x.id)).status).toBe(200);
    expect((await rowOf(draft, x.id))?.status).toBe("COMPLETED");
  });
});

describe("a graduating season's End", () => {
  it("takes a graduate's draft row off too", async () => {
    const { draft, x } = await onDraft("Passed And Planned");
    const seasonId = await season("ACTIVE", "Graduating");
    await db.season.update({ where: { id: seasonId }, data: { graduatesOnPass: true } });
    await db.seasonEnrollment.create({ data: { seasonId, studentUserId: x.id, status: "ACTIVE" } });
    const res = await request(app)
      .post(`/api/v1/seasons/${seasonId}/end`)
      .set(as(ctx.superToken))
      .send(await endBodyOf(seasonId));
    expect(res.status).toBe(200);
    expect(res.body.data.graduated).toBe(1);
    expect(await rowOf(draft, x.id)).toBeNull();
    expect(await rowOf(seasonId, x.id)).toMatchObject({ status: "COMPLETED", result: "PASSED" });
  });
});
