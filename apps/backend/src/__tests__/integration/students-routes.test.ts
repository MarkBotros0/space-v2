import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login, testEmail } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

// Every fixture email starts with this. Unscoped (SUPER/MENTOR) list
// assertions pass ?q=space-v2-test- so real rows in the shared staging DB can
// never satisfy or break them.
const PFX = "space-v2-test-";

let seasonAId: number;
let seasonBId: number;
let groupId: number;
let superToken: string;
let adminToken: string; // season admin of A only
let mentorToken: string;
let leaderToken: string; // leads the one group in A
let student1Id: number; // enrolled in A (group-linked via the ENROLLMENT row) and in B
let student1Token: string;
let student2Id: number; // enrolled in B only
let alumnusId: number; // graduationYear set, COMPLETED enrollment in A
let droppedId: number; // WITHDRAWN enrollment in A, no group
let droppedEnrollmentId: number;
let deletedDroppedId: number; // soft-deleted user with a WITHDRAWN enrollment (D12)

beforeAll(async () => {
  await cleanupTestData();

  seasonAId = (await createTestSeason()).id;
  seasonBId = (await createTestSeason()).id;

  const superUser = await createTestUser("super", "SUPER");
  const admin = await createTestUser("admin", "ADMIN");
  await db.seasonAdmin.create({ data: { seasonId: seasonAId, userId: admin.id } });
  const mentor = await createTestUser("mentor", "MENTOR");
  const leader = await createTestUser("leader", "LEADER");

  const group = await db.group.create({
    data: { seasonId: seasonAId, name: "Group A", leaders: { create: { userId: leader.id } } },
    select: { id: true },
  });
  groupId = group.id;

  const student1 = await createTestUser("student-one", "STUDENT");
  student1Id = student1.id;
  await db.studentProfile.create({
    data: {
      userId: student1Id,
      activeSeasonId: seasonAId,
      university: "Test University",
      year: "3rd",
      phone: "+20 100 000 0000",
      spiritualBackground: "Test background",
      gifts: "Teaching",
      notes: "Internal staff note",
    },
  });
  // The group link lives on the ENROLLMENT row only — deliberately NO
  // GroupStudent row, so any scope that quietly falls back to GroupStudent
  // (v1's unreachable leader branch, students-query.ts:50-55) fails the
  // leader tests below (ruling C9).
  await db.seasonEnrollment.create({
    data: { studentUserId: student1Id, seasonId: seasonAId, groupId, status: "ACTIVE" },
  });
  // A second, group-less enrollment in B: the leader detail test (Task 3)
  // proves row scoping by seeing 1 of these 2.
  await db.seasonEnrollment.create({
    data: { studentUserId: student1Id, seasonId: seasonBId, status: "COMPLETED", completedAt: new Date() },
  });

  const student2 = await createTestUser("student-two", "STUDENT");
  student2Id = student2.id;
  await db.studentProfile.create({ data: { userId: student2Id } });
  await db.seasonEnrollment.create({
    data: { studentUserId: student2Id, seasonId: seasonBId, status: "ACTIVE" },
  });

  const alumnus = await createTestUser("alumnus", "STUDENT");
  alumnusId = alumnus.id;
  await db.user.update({ where: { id: alumnusId }, data: { graduationYear: 2024 } });
  await db.studentProfile.create({ data: { userId: alumnusId, university: "Alumni University" } });
  await db.seasonEnrollment.create({
    data: { studentUserId: alumnusId, seasonId: seasonAId, status: "COMPLETED", completedAt: new Date() },
  });

  const dropped = await createTestUser("dropped", "STUDENT");
  droppedId = dropped.id;
  await db.studentProfile.create({ data: { userId: droppedId } });
  const droppedEnrollment = await db.seasonEnrollment.create({
    data: {
      studentUserId: droppedId,
      seasonId: seasonAId,
      status: "WITHDRAWN",
      droppedAt: new Date("2099-06-01T00:00:00.000Z"),
      dropReason: "Moved away",
    },
    select: { id: true },
  });
  droppedEnrollmentId = droppedEnrollment.id;

  const deletedDropped = await createTestUser("deleted-dropped", "STUDENT");
  deletedDroppedId = deletedDropped.id;
  await db.seasonEnrollment.create({
    data: { studentUserId: deletedDroppedId, seasonId: seasonAId, status: "WITHDRAWN", droppedAt: new Date() },
  });
  await db.user.update({ where: { id: deletedDroppedId }, data: { deletedAt: new Date() } });

  superToken = await login(app, superUser.email);
  adminToken = await login(app, admin.email);
  mentorToken = await login(app, mentor.email);
  leaderToken = await login(app, leader.email);
  student1Token = await login(app, student1.email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("GET /api/v1/students (active)", () => {
  it("returns every non-graduated, non-deleted student for SUPER, with a real total", async () => {
    const res = await request(app)
      .get(`/api/v1/students?q=${PFX}`)
      .set("authorization", `Bearer ${superToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.students.map((s: { id: number }) => s.id);
    // droppedId IS here: WITHDRAWN is an enrollment fact, not a user state —
    // the active list excludes only alumni (R29) and the soft-deleted.
    expect(ids).toEqual(expect.arrayContaining([student1Id, student2Id, droppedId]));
    expect(ids).not.toContain(alumnusId);
    expect(ids).not.toContain(deletedDroppedId);
    expect(res.body.data.total).toBe(3);
    const row = res.body.data.students.find((s: { id: number }) => s.id === student1Id);
    expect(row).toMatchObject({
      name: "Test student-one",
      university: "Test University",
      activeSeasonTitle: "Test Season",
      droppedEnrollment: null,
    });
  });

  it("narrows ADMIN to students ever enrolled in their seasons (R31, kept)", async () => {
    const res = await request(app)
      .get(`/api/v1/students?q=${PFX}`)
      .set("authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.students.map((s: { id: number }) => s.id);
    expect(ids).toEqual(expect.arrayContaining([student1Id, droppedId]));
    expect(ids).not.toContain(student2Id); // season B is not theirs
  });

  it("narrows LEADER to their groups' members through the ENROLLMENT row (C9)", async () => {
    // student1 has NO GroupStudent row — only SeasonEnrollment.groupId links
    // them to the leader's group. A scope that reads GroupStudent returns [].
    const res = await request(app)
      .get(`/api/v1/students?q=${PFX}`)
      .set("authorization", `Bearer ${leaderToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.students.map((s: { id: number }) => s.id)).toEqual([student1Id]);
    expect(res.body.data.total).toBe(1);
  });

  it("refuses a STUDENT caller — no student roster for students (C8)", async () => {
    const res = await request(app)
      .get("/api/v1/students")
      .set("authorization", `Bearer ${student1Token}`);
    expect(res.status).toBe(403);
  });

  it("filters by seasonId through enrollments, any status", async () => {
    const res = await request(app)
      .get(`/api/v1/students?q=${PFX}&seasonId=${seasonBId}`)
      .set("authorization", `Bearer ${superToken}`);

    const ids = res.body.data.students.map((s: { id: number }) => s.id);
    expect([...ids].sort()).toEqual([student1Id, student2Id].sort());
  });

  it("searches university case-insensitively, ANDed with scope (R33)", async () => {
    const res = await request(app)
      .get(`/api/v1/students?q=${encodeURIComponent("test university")}`)
      .set("authorization", `Bearer ${adminToken}`);

    expect(res.body.data.students.map((s: { id: number }) => s.id)).toEqual([student1Id]);
  });

  it("pages with a stable cursor and a constant total (D14 — no silent 200-row cap)", async () => {
    const first = await request(app)
      .get(`/api/v1/students?q=${PFX}&limit=2`)
      .set("authorization", `Bearer ${superToken}`);
    expect(first.body.data.students).toHaveLength(2);
    expect(first.body.data.nextCursor).not.toBeNull();
    expect(first.body.data.total).toBe(3);

    const second = await request(app)
      .get(`/api/v1/students?q=${PFX}&limit=2&cursor=${first.body.data.nextCursor}`)
      .set("authorization", `Bearer ${superToken}`);
    expect(second.body.data.students).toHaveLength(1);
    expect(second.body.data.nextCursor).toBeNull();
    const firstIds = first.body.data.students.map((s: { id: number }) => s.id);
    expect(firstIds).not.toContain(second.body.data.students[0].id);
  });
});

describe("GET /api/v1/students?status=alumni", () => {
  it("lists alumni with the graduation year for ADMIN and MENTOR", async () => {
    for (const token of [adminToken, mentorToken]) {
      const res = await request(app)
        .get(`/api/v1/students?status=alumni&q=${PFX}`)
        .set("authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      const row = res.body.data.students.find((s: { id: number }) => s.id === alumnusId);
      expect(row).toMatchObject({ graduationYear: 2024, university: "Alumni University" });
    }
  });

  it("refuses LEADER — v1 gave them no alumni surface (spec 06 §4.1)", async () => {
    const res = await request(app)
      .get("/api/v1/students?status=alumni")
      .set("authorization", `Bearer ${leaderToken}`);
    expect(res.status).toBe(403);
  });
});

describe("GET /api/v1/students?status=dropped", () => {
  it("returns enrollment-keyed rows with the drop reason (R43)", async () => {
    const res = await request(app)
      .get(`/api/v1/students?status=dropped&q=${PFX}`)
      .set("authorization", `Bearer ${superToken}`);

    expect(res.status).toBe(200);
    const row = res.body.data.students.find((s: { id: number }) => s.id === droppedId);
    expect(row.droppedEnrollment).toMatchObject({
      enrollmentId: droppedEnrollmentId,
      seasonId: seasonAId,
      dropReason: "Moved away",
    });
  });

  it("excludes soft-deleted students (D12 — v1 listed their name and reason forever)", async () => {
    const res = await request(app)
      .get(`/api/v1/students?status=dropped&q=${PFX}`)
      .set("authorization", `Bearer ${superToken}`);
    expect(res.body.data.students.map((s: { id: number }) => s.id)).not.toContain(deletedDroppedId);
  });

  it("narrows ADMIN to their seasons' withdrawals (R45)", async () => {
    const res = await request(app)
      .get(`/api/v1/students?status=dropped&q=${PFX}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.students.length).toBeGreaterThan(0);
    for (const s of res.body.data.students) {
      expect(s.droppedEnrollment.seasonId).toBe(seasonAId);
    }
  });

  it("refuses MENTOR — as an endpoint this hands every drop reason to read-all (spec 06 §4.3/§7)", async () => {
    const res = await request(app)
      .get("/api/v1/students?status=dropped")
      .set("authorization", `Bearer ${mentorToken}`);
    expect(res.status).toBe(403);
  });
});

describe("GET /api/v1/students/:id", () => {
  it("returns the internal shape to SUPER — notes and phone included", async () => {
    const res = await request(app)
      .get(`/api/v1/students/${student1Id}`)
      .set("authorization", `Bearer ${superToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.profile).toMatchObject({
      university: "Test University",
      phone: "+20 100 000 0000",
      spiritualBackground: "Test background",
      notes: "Internal staff note",
    });
    // Both enrollments, newest first (R72); the historic group comes from the
    // ENROLLMENT row (C9/R5), not GroupStudent — none exists for student1.
    expect(res.body.data.enrollments).toHaveLength(2);
    const inA = res.body.data.enrollments.find(
      (e: { seasonId: number }) => e.seasonId === seasonAId,
    );
    expect(inA).toMatchObject({ status: "ACTIVE", groupName: "Group A" });
    expect(res.body.data.currentGroup).toBeNull(); // advisory pointer genuinely unset
  });

  it("returns the internal shape to a season ADMIN of the student", async () => {
    const res = await request(app)
      .get(`/api/v1/students/${student1Id}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.profile.notes).toBe("Internal staff note");
  });

  it("refuses an ADMIN outside the student's seasons", async () => {
    const res = await request(app)
      .get(`/api/v1/students/${student2Id}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });

  it("withholds phone, DOB, spiritual background and notes from MENTOR — absence, not null (D3)", async () => {
    const res = await request(app)
      .get(`/api/v1/students/${student1Id}`)
      .set("authorization", `Bearer ${mentorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.profile).toHaveProperty("university", "Test University");
    // The keys must not exist on the wire at all — a null would still admit
    // the field exists and still round-trip through generic clients.
    expect(res.body.data.profile).not.toHaveProperty("phone");
    expect(res.body.data.profile).not.toHaveProperty("dateOfBirth");
    expect(res.body.data.profile).not.toHaveProperty("spiritualBackground");
    expect(res.body.data.profile).not.toHaveProperty("notes");
  });

  it("admits a LEADER to their own student with the public shape and only their rows", async () => {
    const res = await request(app)
      .get(`/api/v1/students/${student1Id}`)
      .set("authorization", `Bearer ${leaderToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.profile).not.toHaveProperty("phone");
    expect(res.body.data.profile).not.toHaveProperty("notes");
    // student1 holds two enrollments; only the one naming the leader's group
    // travels (spec 06 §7: "the scoped season rows").
    expect(res.body.data.enrollments).toHaveLength(1);
    expect(res.body.data.enrollments[0].seasonId).toBe(seasonAId);
    expect(res.body.data.enrollments[0].dropReason).toBeNull();
  });

  it("refuses a LEADER outside their groups (C8 — the row gate, not just the route)", async () => {
    const res = await request(app)
      .get(`/api/v1/students/${student2Id}`)
      .set("authorization", `Bearer ${leaderToken}`);
    expect(res.status).toBe(403);
  });

  it("returns the private shape to the student themselves — never their internal notes (R23)", async () => {
    const res = await request(app)
      .get(`/api/v1/students/${student1Id}`)
      .set("authorization", `Bearer ${student1Token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.profile).toHaveProperty("phone", "+20 100 000 0000");
    expect(res.body.data.profile).not.toHaveProperty("notes");
  });

  it("refuses a student reading another student", async () => {
    const res = await request(app)
      .get(`/api/v1/students/${student2Id}`)
      .set("authorization", `Bearer ${student1Token}`);
    expect(res.status).toBe(403);
  });

  it("404s a soft-deleted student (R69)", async () => {
    const res = await request(app)
      .get(`/api/v1/students/${deletedDroppedId}`)
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(404);
  });
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
    const profile = await db.studentProfile.findUnique({
      where: { userId: student1Id },
      select: { phone: true, notes: true },
    });
    expect(profile?.phone).toBe("+20 111 111 1111");
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
      .send({ gifts: null });
    expect(res.status).toBe(200);
    const profile = await db.studentProfile.findUnique({
      where: { userId: student1Id },
      select: { gifts: true, university: true },
    });
    expect(profile?.gifts).toBeNull();
    expect(profile?.university).toBe("Test University");
  });
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
