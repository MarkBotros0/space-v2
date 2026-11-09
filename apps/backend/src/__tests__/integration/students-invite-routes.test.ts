// POST /students/:id/invite (owner, 2026-11-07: admins and supers resend the
// invitation). The mailer is stubbed as in invites-routes: no real SMTP from a
// staging .env, and the delivered path runs whatever that .env says.
const mockSendInviteEmail = jest.fn().mockResolvedValue(undefined);
jest.mock("../../lib/email", () => ({
  ...jest.requireActual("../../lib/email"),
  sendInviteEmail: (...args: unknown[]) => mockSendInviteEmail(...args),
  isEmailConfigured: () => true,
}));

import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, testEmail } from "./fixtures";
import { seedStudentFixtures } from "./students-setup";

jest.setTimeout(60000);

const app = createApp();

let seasonAId: number;
let seasonBId: number;
let superToken: string;
let adminToken: string; // season admin of A only
let leaderToken: string;
let student1Id: number; // has signed in already
let student1Token: string;

/** A new person with no password yet, placed in `seasonId` by a Super. */
async function newcomer(tag: string, seasonId: number): Promise<number> {
  const res = await request(app)
    .post("/api/v1/students")
    .set("authorization", `Bearer ${superToken}`)
    .send({ name: `New ${tag}`, email: testEmail(tag), seasonId });
  expect(res.status).toBe(201);
  return res.body.data.id as number;
}

const resend = (id: number, token: string) =>
  request(app).post(`/api/v1/students/${id}/invite`).set("authorization", `Bearer ${token}`);

beforeAll(async () => {
  ({ seasonAId, seasonBId, superToken, adminToken, leaderToken, student1Id, student1Token } =
    await seedStudentFixtures(app));
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

beforeEach(() => mockSendInviteEmail.mockClear());

describe("POST /api/v1/students/:id/invite", () => {
  it("lets the season's admin resend: a new code goes out and the old one stops working", async () => {
    const id = await newcomer("resend-admin", seasonAId);
    const before = await db.inviteToken.findMany({ where: { userId: id }, select: { id: true } });
    mockSendInviteEmail.mockClear();

    const res = await resend(id, adminToken);
    expect(res.status).toBe(200);
    expect(mockSendInviteEmail).toHaveBeenCalledTimes(1);
    expect(res.body.data).toMatchObject({ usedAt: null });

    const live = await db.inviteToken.findMany({
      where: { userId: id, usedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true },
    });
    expect(live).toHaveLength(1);
    expect(before.map((b) => b.id)).not.toContain(live[0]?.id);
  });

  it("lets a Super resend", async () => {
    const id = await newcomer("resend-super", seasonBId);
    mockSendInviteEmail.mockClear();
    expect((await resend(id, superToken)).status).toBe(200);
    expect(mockSendInviteEmail).toHaveBeenCalledTimes(1);
  });

  it("refuses an admin for a student outside their seasons, and a leader", async () => {
    const id = await newcomer("resend-other", seasonBId);
    mockSendInviteEmail.mockClear();
    expect((await resend(id, adminToken)).status).toBe(403);
    expect((await resend(id, leaderToken)).status).toBe(403);
    expect(mockSendInviteEmail).not.toHaveBeenCalled();
  });

  it("refuses an account that is already set up (409) and the student themselves (403)", async () => {
    const done = await resend(student1Id, superToken);
    expect(done.status).toBe(409);
    expect(done.body.error.code).toBe("already_activated");
    expect((await resend(student1Id, student1Token)).status).toBe(403);
  });

  it("is a 404 for someone who isn't a student", async () => {
    expect((await resend(999999999, superToken)).status).toBe(404);
  });

  it("shows staff the invite state on the student's page, and nobody else", async () => {
    const id = await newcomer("resend-state", seasonAId);
    const staff = await request(app).get(`/api/v1/students/${id}`).set("authorization", `Bearer ${adminToken}`);
    expect(staff.body.data.invite).toMatchObject({ status: "invited" });

    const setUp = await request(app).get(`/api/v1/students/${student1Id}`).set("authorization", `Bearer ${superToken}`);
    expect(setUp.body.data.invite).toBeNull();

    const own = await request(app)
      .get(`/api/v1/students/${student1Id}`)
      .set("authorization", `Bearer ${student1Token}`);
    expect(own.body.data).not.toHaveProperty("invite");
  });
});
