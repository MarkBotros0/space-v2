// Plan 10: POST /students now mails an invite. Stubbed for the same two
// reasons Plan 9's invites suite gives — a staging .env with GMAIL_* set would
// otherwise send real SMTP to @jpc.test addresses on every run, and the stub
// is how this suite proves the raw code reaches the mailer and nothing else.
// Mail counts as configured whatever the .env says, so the send path runs.
// Lazy wrapper: jest.mock is hoisted above this const.
const mockSendInviteEmail = jest.fn().mockResolvedValue(undefined);
jest.mock("../../lib/email", () => ({
  ...jest.requireActual("../../lib/email"),
  isEmailConfigured: () => true,
  sendInviteEmail: (...args: unknown[]) => mockSendInviteEmail(...args),
}));

import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { hashToken } from "../../lib/auth/tokens";
import { cleanupTestData, createTestUser, login, testEmail } from "./fixtures";
import { seedStudentFixtures } from "./students-setup";

jest.setTimeout(60000);

const app = createApp();

let seasonAId: number;
let seasonBId: number;
let superToken: string;
let adminToken: string; // season admin of A only
let deletedDroppedId: number; // soft-deleted user with a WITHDRAWN enrollment (D12)

beforeAll(async () => {
  ({ seasonAId, seasonBId, superToken, adminToken, deletedDroppedId } = await seedStudentFixtures(app));
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("POST /api/v1/students — credentials only via Plan 9's invite (Plan 10 Decision 1)", () => {
  it("mints one hashed invite in the creating transaction and mails the raw code — nowhere else", async () => {
    mockSendInviteEmail.mockClear();
    const email = testEmail("invited-student");
    const res = await request(app)
      .post("/api/v1/students")
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "Invited Student", email });

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ id: res.body.data.id, email, inviteSent: true });

    const row = await db.user.findUnique({
      where: { id: res.body.data.id },
      select: { passwordHash: true, invitesReceived: { select: { token: true, usedAt: true } } },
    });
    // D7: still no password — the invite is the ONLY credential path.
    expect(row?.passwordHash).toBeNull();
    expect(row?.invitesReceived).toHaveLength(1);
    expect(row?.invitesReceived[0]?.token).toMatch(/^[0-9a-f]{64}$/);
    expect(row?.invitesReceived[0]?.usedAt).toBeNull();

    const calls = mockSendInviteEmail.mock.calls as [string, string, Date][];
    const call = calls[calls.length - 1]!;
    expect(call[0]).toBe(email);
    expect(hashToken(call[1])).toBe(row?.invitesReceived[0]?.token);
    // The raw code is in no response body.
    expect(JSON.stringify(res.body)).not.toContain(call[1]);
  });

  it("still creates the student when the mailer throws, says so, and withdraws the code (R25)", async () => {
    mockSendInviteEmail.mockRejectedValueOnce(new Error("smtp down"));
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await request(app)
      .post("/api/v1/students")
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "Mail Failure Student", email: testEmail("mail-fail") });
    error.mockRestore();

    expect(res.status).toBe(201);
    expect(res.body.data.inviteSent).toBe(false);
    // The row stays, but expired: the student reads "pending", not "invited"
    // with a code nobody received, so Send invite picks them up again.
    const invites = await db.inviteToken.findMany({
      where: { userId: res.body.data.id },
      select: { expiresAt: true },
    });
    expect(invites).toHaveLength(1);
    expect(invites[0]!.expiresAt.getTime()).toBeLessThanOrEqual(Date.now());
  });
});

async function makeGraduand(
  label: string,
  enrollments: { seasonId: number; status: "ACTIVE" | "WITHDRAWN" | "COMPLETED"; dropReason?: string }[],
): Promise<number> {
  const s = await createTestUser(label, "STUDENT");
  await db.studentProfile.create({ data: { userId: s.id } });
  for (const e of enrollments) {
    await db.seasonEnrollment.create({
      data: {
        studentUserId: s.id,
        seasonId: e.seasonId,
        status: e.status,
        ...(e.status === "WITHDRAWN" ? { droppedAt: new Date(), dropReason: e.dropReason ?? null } : {}),
        ...(e.status === "COMPLETED" ? { completedAt: new Date() } : {}),
      },
    });
  }
  return s.id;
}

describe("POST /api/v1/students/:id/graduate (Plan 10 Decision 2)", () => {
  it("records the year, completes EVERY active enrollment — one transaction", async () => {
    const sid = await makeGraduand(
      "graduand",
      [
        { seasonId: seasonAId, status: "ACTIVE" },
        { seasonId: seasonBId, status: "ACTIVE" },
      ],
    );

    const res = await request(app)
      .post(`/api/v1/students/${sid}/graduate`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ graduationYear: 2020 });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: sid, graduationYear: 2020, enrollmentsCompleted: 2 });

    const row = await db.user.findUnique({
      where: { id: sid },
      select: {
        role: true,
        graduationYear: true,
        seasonEnrollments: { select: { status: true, completedAt: true }, orderBy: { seasonId: "asc" } },
      },
    });
    expect(row?.role).toBe("STUDENT"); // R57: the year is the whole marker
    expect(row?.graduationYear).toBe(2020);
    // v1 completed only the pointed-at season (R48/R60); B would have stayed ACTIVE.
    expect(row?.seasonEnrollments.map((e) => e.status)).toEqual(["COMPLETED", "COMPLETED"]);
    expect(row?.seasonEnrollments.every((e) => e.completedAt !== null)).toBe(true);
  });

  it("leaves terminal enrollments exactly as they were", async () => {
    const sid = await makeGraduand(
      "graduand-terminal",
      [
        { seasonId: seasonAId, status: "WITHDRAWN", dropReason: "Kept reason" },
        { seasonId: seasonBId, status: "ACTIVE" },
      ],
    );

    const res = await request(app)
      .post(`/api/v1/students/${sid}/graduate`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ graduationYear: 2021 });

    expect(res.body.data.enrollmentsCompleted).toBe(1);
    const dropped = await db.seasonEnrollment.findFirst({
      where: { studentUserId: sid, seasonId: seasonAId },
      select: { status: true, dropReason: true, completedAt: true },
    });
    expect(dropped).toEqual({ status: "WITHDRAWN", dropReason: "Kept reason", completedAt: null });
  });

  it("is SUPER-only (R55) — a season admin of the student's season is refused", async () => {
    const sid = await makeGraduand("graduand-admin", [{ seasonId: seasonAId, status: "ACTIVE" }]);
    const res = await request(app)
      .post(`/api/v1/students/${sid}/graduate`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ graduationYear: 2020 });
    expect(res.status).toBe(403);
    const row = await db.user.findUnique({ where: { id: sid }, select: { graduationYear: true } });
    expect(row?.graduationYear).toBeNull();
  });

  it("bounds the year per request (R58)", async () => {
    const sid = await makeGraduand("graduand-year", []);
    for (const graduationYear of [new Date().getFullYear() + 1, 1989]) {
      const res = await request(app)
        .post(`/api/v1/students/${sid}/graduate`)
        .set("authorization", `Bearer ${superToken}`)
        .send({ graduationYear });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("bad_request");
    }
  });

  it("refuses a second graduation instead of overwriting the year (R61)", async () => {
    const sid = await makeGraduand("graduand-twice", []);
    await request(app)
      .post(`/api/v1/students/${sid}/graduate`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ graduationYear: 2019 });
    const again = await request(app)
      .post(`/api/v1/students/${sid}/graduate`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ graduationYear: 2020 });

    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("already_graduated");
    const row = await db.user.findUnique({ where: { id: sid }, select: { graduationYear: true } });
    expect(row?.graduationYear).toBe(2019);
  });

  it("answers 404 for a non-student id", async () => {
    const leader = await createTestUser("not-a-student", "LEADER");
    const res = await request(app)
      .post(`/api/v1/students/${leader.id}/graduate`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ graduationYear: 2020 });
    expect(res.status).toBe(404);
  });

  it("writes an audit line with ids only — never the year (spec 06 D15)", async () => {
    const sid = await makeGraduand("graduand-audit", []);
    const info = jest.spyOn(console, "info").mockImplementation(() => undefined);
    await request(app)
      .post(`/api/v1/students/${sid}/graduate`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ graduationYear: 2018 });
    const lines = info.mock.calls.map((c) => String(c[0]));
    expect(lines.some((l) => new RegExp(`^\\[audit\\] student\\.graduate actor=\\d+ subject=${sid}$`).test(l))).toBe(true);
    expect(lines.join("\n")).not.toContain("2018");
    info.mockRestore();
  });
});

describe("DELETE /api/v1/students/:id (Plan 10 Decision 3)", () => {
  it("stamps User and StudentProfile together, revokes every session, keeps the history", async () => {
    const s = await createTestUser("to-delete", "STUDENT");
    await db.studentProfile.create({ data: { userId: s.id } });
    await db.seasonEnrollment.create({
      data: { studentUserId: s.id, seasonId: seasonAId, status: "ACTIVE" },
    });
    await login(app, s.email); // creates a live RefreshToken row

    const res = await request(app)
      .delete(`/api/v1/students/${s.id}`)
      .set("authorization", `Bearer ${superToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(s.id);
    expect(typeof res.body.data.deletedAt).toBe("string");

    const row = await db.user.findUnique({
      where: { id: s.id },
      select: {
        deletedAt: true,
        studentProfile: { select: { deletedAt: true } },
        seasonEnrollments: { select: { status: true } },
        refreshTokens: { select: { revokedAt: true } },
      },
    });
    expect(row?.deletedAt).not.toBeNull();
    // R86 fixed: v1 wrote these two in separate statements.
    expect(row?.studentProfile?.deletedAt).not.toBeNull();
    // R87 kept: soft delete cascades to nothing.
    expect(row?.seasonEnrollments).toEqual([{ status: "ACTIVE" }]);
    // Spec 11 D6: deactivation revokes. (A refresh would 401 anyway via
    // issueSession's deletedAt check — this asserts the revocation itself.)
    expect(row?.refreshTokens.length).toBeGreaterThan(0);
    expect(row?.refreshTokens.every((t) => t.revokedAt !== null)).toBe(true);

    const detail = await request(app)
      .get(`/api/v1/students/${s.id}`)
      .set("authorization", `Bearer ${superToken}`);
    expect(detail.status).toBe(404);
  });

  it("is SUPER-only", async () => {
    const s = await createTestUser("delete-admin", "STUDENT");
    await db.studentProfile.create({ data: { userId: s.id } });
    await db.seasonEnrollment.create({
      data: { studentUserId: s.id, seasonId: seasonAId, status: "ACTIVE" },
    });
    const res = await request(app)
      .delete(`/api/v1/students/${s.id}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
    const row = await db.user.findUnique({ where: { id: s.id }, select: { deletedAt: true } });
    expect(row?.deletedAt).toBeNull();
  });

  it("answers 404 for a non-student and for an already-deleted student", async () => {
    const leader = await createTestUser("delete-leader", "LEADER");
    const notStudent = await request(app)
      .delete(`/api/v1/students/${leader.id}`)
      .set("authorization", `Bearer ${superToken}`);
    expect(notStudent.status).toBe(404);

    const again = await request(app)
      .delete(`/api/v1/students/${deletedDroppedId}`)
      .set("authorization", `Bearer ${superToken}`);
    expect(again.status).toBe(404);
  });

  it("a SUPER reactivation through /users clears BOTH stamps (Plan 9's reactivate, amended)", async () => {
    const s = await createTestUser("delete-reactivate", "STUDENT");
    await db.studentProfile.create({ data: { userId: s.id } });
    await request(app).delete(`/api/v1/students/${s.id}`).set("authorization", `Bearer ${superToken}`);

    const res = await request(app)
      .post(`/api/v1/users/${s.id}/reactivate`)
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(200);

    const row = await db.user.findUnique({
      where: { id: s.id },
      select: { deletedAt: true, studentProfile: { select: { deletedAt: true } } },
    });
    expect(row).toEqual({ deletedAt: null, studentProfile: { deletedAt: null } });
  });

  it("writes an audit line", async () => {
    const s = await createTestUser("delete-audit", "STUDENT");
    await db.studentProfile.create({ data: { userId: s.id } });
    const info = jest.spyOn(console, "info").mockImplementation(() => undefined);
    await request(app).delete(`/api/v1/students/${s.id}`).set("authorization", `Bearer ${superToken}`);
    expect(info.mock.calls.map((c) => String(c[0]))).toEqual(
      expect.arrayContaining([expect.stringMatching(new RegExp(`^\\[audit\\] student\\.delete actor=\\d+ subject=${s.id}$`))]),
    );
    info.mockRestore();
  });
});
