// Plan 10: POST /students now mails an invite. Stubbed for the same two
// reasons Plan 9's invites suite gives — a staging .env with GMAIL_* set would
// otherwise send real SMTP to @jpc.test addresses on every run, and the stub
// is how this suite proves the raw code reaches the mailer and nothing else.
// Lazy wrapper: jest.mock is hoisted above this const.
const mockSendInviteEmail = jest.fn().mockResolvedValue(undefined);
jest.mock("../../lib/email", () => ({
  ...jest.requireActual("../../lib/email"),
  sendInviteEmail: (...args: unknown[]) => mockSendInviteEmail(...args),
}));

import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestUser } from "./fixtures";
import { seedStudentFixtures } from "./students-setup";

jest.setTimeout(60000);

const app = createApp();

let seasonAId: number;
let seasonBId: number;
let superToken: string;
let adminToken: string; // season admin of A only
let leaderToken: string; // leads the one group in A
let student1Id: number; // enrolled in A (group-linked via the ENROLLMENT row) and in B
let student2Id: number; // enrolled in B only

beforeAll(async () => {
  ({ seasonAId, seasonBId, superToken, adminToken, leaderToken, student1Id, student2Id } = await seedStudentFixtures(app));
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("POST /api/v1/students/:id/enrollments", () => {
  it("creates an ACTIVE enrollment and points an unset activeSeasonId at it (R47, D1)", async () => {
    const s = await createTestUser("enrollee", "STUDENT");
    await db.studentProfile.create({ data: { userId: s.id } });

    const res = await request(app)
      .post(`/api/v1/students/${s.id}/enrollments`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ seasonId: seasonAId });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ seasonId: seasonAId, status: "ACTIVE" });
    const profile = await db.studentProfile.findUnique({
      where: { userId: s.id },
      select: { activeSeasonId: true },
    });
    expect(profile?.activeSeasonId).toBe(seasonAId);
  });

  it("never overwrites an activeSeasonId that is already set", async () => {
    const s = await createTestUser("enrollee-b", "STUDENT");
    await db.studentProfile.create({ data: { userId: s.id, activeSeasonId: seasonBId } });

    const res = await request(app)
      .post(`/api/v1/students/${s.id}/enrollments`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ seasonId: seasonAId });

    expect(res.status).toBe(201);
    const profile = await db.studentProfile.findUnique({
      where: { userId: s.id },
      select: { activeSeasonId: true },
    });
    expect(profile?.activeSeasonId).toBe(seasonBId);
  });

  it("refuses an enrollment into a season the caller does not administer (R64's shape)", async () => {
    const res = await request(app)
      .post(`/api/v1/students/${student2Id}/enrollments`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ seasonId: seasonBId });
    expect(res.status).toBe(403);
  });

  it("refuses a LEADER", async () => {
    const res = await request(app)
      .post(`/api/v1/students/${student2Id}/enrollments`)
      .set("authorization", `Bearer ${leaderToken}`)
      .send({ seasonId: seasonAId });
    expect(res.status).toBe(403);
  });

  it("refuses a duplicate — one enrollment per student per season, ever (R2)", async () => {
    const res = await request(app)
      .post(`/api/v1/students/${student1Id}/enrollments`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ seasonId: seasonAId });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("already_enrolled");
  });
});

describe("PATCH /api/v1/students/:id/enrollments/:seasonId", () => {
  async function makeActiveEnrollee(label: string): Promise<number> {
    const s = await createTestUser(label, "STUDENT");
    await db.studentProfile.create({ data: { userId: s.id } });
    await db.seasonEnrollment.create({
      data: { studentUserId: s.id, seasonId: seasonAId, status: "ACTIVE" },
    });
    return s.id;
  }

  it("drops an ACTIVE enrollment with a reason — and the row SURVIVES (never deleted)", async () => {
    const sid = await makeActiveEnrollee("to-drop");
    const res = await request(app)
      .patch(`/api/v1/students/${sid}/enrollments/${seasonAId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ status: "WITHDRAWN", dropReason: "Left the program" });

    expect(res.status).toBe(200);
    const rows = await db.seasonEnrollment.findMany({
      where: { studentUserId: sid, seasonId: seasonAId },
      select: { status: true, droppedAt: true, dropReason: true },
    });
    expect(rows).toHaveLength(1); // transitioned in place, not delete+recreate
    expect(rows[0]).toMatchObject({ status: "WITHDRAWN", dropReason: "Left the program" });
    expect(rows[0]?.droppedAt).not.toBeNull();
  });

  it("completes an ACTIVE enrollment with completedAt (R48's write, made per-enrollment)", async () => {
    const sid = await makeActiveEnrollee("to-complete");
    const res = await request(app)
      .patch(`/api/v1/students/${sid}/enrollments/${seasonAId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ status: "COMPLETED" });

    expect(res.status).toBe(200);
    const row = await db.seasonEnrollment.findFirst({
      where: { studentUserId: sid, seasonId: seasonAId },
      select: { status: true, completedAt: true, dropReason: true },
    });
    expect(row).toMatchObject({ status: "COMPLETED", dropReason: null });
    expect(row?.completedAt).not.toBeNull();
  });

  it("refuses a second transition out of a terminal state — no un-drop (R49/R50)", async () => {
    const sid = await makeActiveEnrollee("terminal");
    await request(app)
      .patch(`/api/v1/students/${sid}/enrollments/${seasonAId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ status: "WITHDRAWN" });

    const res = await request(app)
      .patch(`/api/v1/students/${sid}/enrollments/${seasonAId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ status: "COMPLETED" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("not_active");
  });

  it("gates on the season BEFORE the row lookup — no existence leak (fixes R65)", async () => {
    // adminToken does not administer season B; the answer must be 403 even
    // though no such enrollment exists, proving the gate runs first.
    const res = await request(app)
      .patch(`/api/v1/students/${student1Id}/enrollments/${seasonBId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ status: "WITHDRAWN" });
    expect(res.status).toBe(403);
  });

  it("refuses ACTIVE in the body — re-activation does not exist (R50)", async () => {
    const res = await request(app)
      .patch(`/api/v1/students/${student1Id}/enrollments/${seasonAId}`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ status: "ACTIVE" });
    expect(res.status).toBe(400);
  });
});

describe("enrollment transitions leave an audit line (spec 06 D15, Plan 10 Decision 4)", () => {
  it("logs actor and subject for a drop — and never the reason", async () => {
    const s = await createTestUser("audited-drop", "STUDENT");
    await db.studentProfile.create({ data: { userId: s.id } });
    await db.seasonEnrollment.create({
      data: { studentUserId: s.id, seasonId: seasonAId, status: "ACTIVE" },
    });
    const info = jest.spyOn(console, "info").mockImplementation(() => undefined);

    const res = await request(app)
      .patch(`/api/v1/students/${s.id}/enrollments/${seasonAId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ status: "WITHDRAWN", dropReason: "Private family matter" });

    expect(res.status).toBe(200);
    const lines = info.mock.calls.map((c) => String(c[0]));
    expect(lines.some((l) => new RegExp(`^\\[audit\\] enrollment\\.drop actor=\\d+ subject=${s.id}$`).test(l))).toBe(true);
    expect(lines.join("\n")).not.toContain("Private family matter");
    info.mockRestore();
  });
});
