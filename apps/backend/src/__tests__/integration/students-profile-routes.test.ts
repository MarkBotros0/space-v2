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
import { cleanupTestData, testEmail } from "./fixtures";
import { seedStudentFixtures } from "./students-setup";

jest.setTimeout(60000);

const app = createApp();

let seasonAId: number;
let seasonBId: number;
let superToken: string;
let adminToken: string; // season admin of A only
let student1Id: number; // enrolled in A (group-linked via the ENROLLMENT row) and in B
let student1Token: string;
let student2Id: number; // enrolled in B only
let droppedId: number; // WITHDRAWN enrollment in A, no group

beforeAll(async () => {
  ({ seasonAId, seasonBId, superToken, adminToken, student1Id, student1Token, student2Id, droppedId } = await seedStudentFixtures(app));
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("POST /api/v1/students", () => {
  it("creates user + profile + ACTIVE enrollment in one transaction, with NO password (D7/D1)", async () => {
    const email = testEmail("created");
    const res = await request(app)
      .post("/api/v1/students")
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "Created Student", email, seasonId: seasonAId, university: "" });

    expect(res.status).toBe(201);
    const row = await db.user.findUnique({
      where: { id: res.body.data.id },
      select: {
        passwordHash: true,
        role: true,
        studentProfile: { select: { activeSeasonId: true, university: true } },
        seasonEnrollments: { select: { seasonId: true, status: true } },
      },
    });
    expect(row).toMatchObject({
      // D7: ChangeMe123! is NOT ported. No credentials until Plan 9's
      // invites — the same no-login-path state v1's CSV import produces.
      passwordHash: null,
      role: "STUDENT",
      // D1: the profile pointer and the enrollment agree by construction,
      // and ""→null held (R26).
      studentProfile: { activeSeasonId: seasonAId, university: null },
      seasonEnrollments: [{ seasonId: seasonAId, status: "ACTIVE" }],
    });
  });

  it("creates no enrollment when seasonId is omitted", async () => {
    const res = await request(app)
      .post("/api/v1/students")
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "Unenrolled Student", email: testEmail("unenrolled") });

    expect(res.status).toBe(201);
    const count = await db.seasonEnrollment.count({
      where: { studentUserId: res.body.data.id },
    });
    expect(count).toBe(0);
  });

  it("refuses ADMIN — creation is SUPER-only in v2 (v1's ADMIN create was unscoped, spec 06 §4.3)", async () => {
    const res = await request(app)
      .post("/api/v1/students")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ name: "Nope Student", email: testEmail("nope") });
    expect(res.status).toBe(403);
  });

  it("refuses a duplicate email with 409, not a Prisma error (R18)", async () => {
    const email = testEmail("dupe");
    await request(app)
      .post("/api/v1/students")
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "First Dupe", email });
    const clash = await request(app)
      .post("/api/v1/students")
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "Second Dupe", email });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe("email_taken");
  });
});

describe("PATCH /api/v1/students/:id", () => {
  it("lets the student edit their own contact fields (R22)", async () => {
    const res = await request(app)
      .patch(`/api/v1/students/${student1Id}`)
      .set("authorization", `Bearer ${student1Token}`)
      .send({ phone: "+20 111 111 1111" });

    expect(res.status).toBe(200);
    const row = await db.user.findUnique({ where: { id: student1Id }, select: { phone: true } });
    expect(row?.phone).toBe("+20 111 111 1111");
  });

  it("refuses the subject's own write of notes with forbidden_field (R23 — loudly, not v1's silent drop, R24)", async () => {
    const res = await request(app)
      .patch(`/api/v1/students/${student1Id}`)
      .set("authorization", `Bearer ${student1Token}`)
      .send({ notes: "self-written" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden_field");
    const profile = await db.studentProfile.findUnique({
      where: { userId: student1Id },
      select: { notes: true },
    });
    expect(profile?.notes).toBe("Internal staff note");
  });

  it("lets ADMIN write notes but NOT activeSeasonId (the allowlist)", async () => {
    const ok = await request(app)
      .patch(`/api/v1/students/${student1Id}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ notes: "Updated by admin" });
    expect(ok.status).toBe(200);

    const refused = await request(app)
      .patch(`/api/v1/students/${student1Id}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ activeSeasonId: seasonBId });
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe("forbidden_field");
  });

  it("lets SUPER move activeSeasonId to a season the student is ACTIVE in", async () => {
    // student2 has an ACTIVE enrollment in B and a null pointer.
    const res = await request(app)
      .patch(`/api/v1/students/${student2Id}`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ activeSeasonId: seasonBId });
    expect(res.status).toBe(200);
    const profile = await db.studentProfile.findUnique({
      where: { userId: student2Id },
      select: { activeSeasonId: true },
    });
    expect(profile?.activeSeasonId).toBe(seasonBId);
    // Restore for any later reader of the fixture.
    await db.studentProfile.update({
      where: { userId: student2Id },
      data: { activeSeasonId: null },
    });
  });

  it("refuses a pointer at a season the student has no ACTIVE enrollment in (409, D1)", async () => {
    // student1's B enrollment is COMPLETED: pointer and enrollment would
    // disagree, which spec 06 D1 says must never happen.
    const res = await request(app)
      .patch(`/api/v1/students/${student1Id}`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ activeSeasonId: seasonBId });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("not_enrolled");
    const profile = await db.studentProfile.findUnique({
      where: { userId: student1Id },
      select: { activeSeasonId: true },
    });
    expect(profile?.activeSeasonId).toBe(seasonAId);
  });

  it("answers 404 for a nonexistent season id instead of a foreign-key 500", async () => {
    const res = await request(app)
      .patch(`/api/v1/students/${student1Id}`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ activeSeasonId: 2147483000 });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });

  it("lets SUPER clear the pointer with null (no enrollment check)", async () => {
    const res = await request(app)
      .patch(`/api/v1/students/${student2Id}`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ activeSeasonId: null });
    expect(res.status).toBe(200);
  });

  it("refuses ADMIN for a student with no ACTIVE enrollment in their seasons (D4)", async () => {
    // droppedId's only season-A enrollment is WITHDRAWN.
    const res = await request(app)
      .patch(`/api/v1/students/${droppedId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ university: "X" });
    expect(res.status).toBe(403);
  });

  it("clears with null and leaves absent fields untouched (PATCH semantics)", async () => {
    const res = await request(app)
      .patch(`/api/v1/students/${student1Id}`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ faculty: null });
    expect(res.status).toBe(200);
    const profile = await db.studentProfile.findUnique({
      where: { userId: student1Id },
      select: { faculty: true, university: true },
    });
    expect(profile?.faculty).toBeNull();
    expect(profile?.university).toBe("Test University");
  });
});

describe("PATCH /api/v1/students/:id — one writer per column (Plan 11, spec 18 D2/D8)", () => {
  it("refuses a student's own email change with forbidden_field", async () => {
    const res = await request(app)
      .patch(`/api/v1/students/${student1Id}`)
      .set("authorization", `Bearer ${student1Token}`)
      .send({ email: testEmail("self-email") });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden_field");
  });

  it("refuses a student's own name change here — PATCH /me owns User.name", async () => {
    const res = await request(app)
      .patch(`/api/v1/students/${student1Id}`)
      .set("authorization", `Bearer ${student1Token}`)
      .send({ name: "Self Renamed" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden_field");
  });

  it("still lets an admin correct a student's name", async () => {
    const res = await request(app)
      .patch(`/api/v1/students/${student1Id}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ name: "Admin Corrected" });
    expect(res.status).toBe(200);
  });
});
