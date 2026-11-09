// apps/backend/src/__tests__/integration/imports-students-commit-routes.test.ts
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { createTestUser, testEmail } from "./fixtures";
import { oneUserByEmail, seedImportFixtures, teardownImportFixtures } from "./imports-setup";

jest.setTimeout(60000);

const app = createApp();

// Every paste goes through `sheet()` — see THE PREFIX GUARD in imports-setup.ts.

let seasonId: number;
let otherSeasonId: number;
let superToken: string;

beforeAll(async () => {
  ({ seasonId, otherSeasonId, superToken } = await seedImportFixtures(app));
});

afterAll(async () => {
  await teardownImportFixtures();
});

describe("POST /api/v1/imports/students/commit — onExisting", () => {
  it("enrols an existing student into the target season without touching their profile (D-16.7 / spec D4)", async () => {
    const returning = await createTestUser("returning", "STUDENT");
    await db.studentProfile.create({
      data: { userId: returning.id, notes: "A year of pastoral notes", university: "Old University" },
    });
    await db.seasonEnrollment.create({
      data: { studentUserId: returning.id, seasonId: otherSeasonId, status: "COMPLETED", completedAt: new Date() },
    });

    const res = await request(app)
      .post("/api/v1/imports/students/commit")
      .set("authorization", `Bearer ${superToken}`)
      .send({
        mode: "season",
        seasonId,
        onExisting: "enroll",
        rows: [
          {
            rowNumber: 2,
            values: {
              name: "A COMPLETELY DIFFERENT NAME",
              email: returning.email,
              university: "Stale Export University",
              faculty: null,
              universityGraduationYear: null,
              phone: null,
              dateOfBirth: null,
              notes: "stale export note",
            },
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ created: 0, skipped: 0, enrolled: 1 });

    const row = await oneUserByEmail(returning.email);
    // The enrolment was created…
    expect(row.seasonEnrollments.map((e) => e.seasonId).sort()).toEqual([otherSeasonId, seasonId].sort());
    // …and nothing else did. A spreadsheet must never erase pastoral notes.
    expect(row.name).toBe("Test returning");
    expect(row.studentProfile?.notes).toBe("A year of pastoral notes");
    expect(row.studentProfile?.university).toBe("Old University");
  });

  it("leaves an existing enrolment for that same season completely alone", async () => {
    const withdrawn = await createTestUser("withdrawn", "STUDENT");
    await db.studentProfile.create({ data: { userId: withdrawn.id } });
    await db.seasonEnrollment.create({
      data: {
        studentUserId: withdrawn.id,
        seasonId,
        status: "WITHDRAWN",
        droppedAt: new Date("2099-01-01T00:00:00.000Z"),
        dropReason: "Moved away",
      },
    });

    await request(app)
      .post("/api/v1/imports/students/commit")
      .set("authorization", `Bearer ${superToken}`)
      .send({
        mode: "season",
        seasonId,
        onExisting: "enroll",
        rows: [
          {
            rowNumber: 2,
            values: {
              name: "Withdrawn Person",
              email: withdrawn.email,
              university: null,
              faculty: null,
              universityGraduationYear: null,
              phone: null,
              dateOfBirth: null,
              notes: null,
            },
          },
        ],
      });

    const enrolment = await db.seasonEnrollment.findUnique({
      where: { studentUserId_seasonId: { studentUserId: withdrawn.id, seasonId } },
      select: { status: true, dropReason: true },
    });
    // A resurrected WITHDRAWN enrolment with its reason erased is the most
    // damaging thing a bulk write can do (spec 06 D2). It must not happen.
    expect(enrolment).toMatchObject({ status: "WITHDRAWN", dropReason: "Moved away" });
  });

  it("reports an existing enrolment as skipped, and points an UNSET pointer (Plan 7's rules)", async () => {
    const already = await createTestUser("already-enrolled", "STUDENT");
    await db.studentProfile.create({ data: { userId: already.id } });
    await db.seasonEnrollment.create({
      data: { studentUserId: already.id, seasonId, status: "ACTIVE" },
    });
    const fresh = await createTestUser("pointer-unset", "STUDENT");
    await db.studentProfile.create({ data: { userId: fresh.id } });

    const blank = {
      university: null,
      faculty: null,
      universityGraduationYear: null,
      phone: null,
      dateOfBirth: null,
      notes: null,
    };
    const res = await request(app)
      .post("/api/v1/imports/students/commit")
      .set("authorization", `Bearer ${superToken}`)
      .send({
        mode: "season",
        seasonId,
        onExisting: "enroll",
        rows: [
          { rowNumber: 2, values: { name: "Already Here", email: already.email, ...blank } },
          { rowNumber: 3, values: { name: "Pointer Unset", email: fresh.email, ...blank } },
        ],
      });

    expect(res.body.data).toMatchObject({ created: 0, skipped: 1, enrolled: 1 });
    expect(res.body.data.rows[0]).toMatchObject({
      outcome: "skipped",
      message: expect.stringMatching(/already enrolled/i),
    });
    const freshRow = await oneUserByEmail(fresh.email);
    expect(freshRow.seasonEnrollments).toEqual([expect.objectContaining({ seasonId, status: "ACTIVE" })]);
  });

  it("skips a soft-deleted address even under enroll, with a message that says why", async () => {
    const removed = await createTestUser("commit-removed", "STUDENT");
    await db.user.update({ where: { id: removed.id }, data: { deletedAt: new Date() } });

    const res = await request(app)
      .post("/api/v1/imports/students/commit")
      .set("authorization", `Bearer ${superToken}`)
      .send({
        mode: "season",
        seasonId,
        onExisting: "enroll",
        rows: [
          {
            rowNumber: 2,
            values: {
              name: "Removed Person",
              email: removed.email,
              university: null,
              faculty: null,
              universityGraduationYear: null,
              phone: null,
              dateOfBirth: null,
              notes: null,
            },
          },
        ],
      });

    expect(res.body.data).toMatchObject({ created: 0, skipped: 1, enrolled: 0 });
    expect(res.body.data.rows[0].message).toMatch(/restore/i);
    expect(await db.seasonEnrollment.count({ where: { studentUserId: removed.id, seasonId } })).toBe(0);
  });

  it("skips an address that belongs to a staff account rather than enrolling it", async () => {
    const leader = await createTestUser("commit-leader", "LEADER");
    const res = await request(app)
      .post("/api/v1/imports/students/commit")
      .set("authorization", `Bearer ${superToken}`)
      .send({
        mode: "season",
        seasonId,
        onExisting: "enroll",
        rows: [
          {
            rowNumber: 2,
            values: {
              name: "A Leader",
              email: leader.email,
              university: null,
              faculty: null,
              universityGraduationYear: null,
              phone: null,
              dateOfBirth: null,
              notes: null,
            },
          },
        ],
      });

    expect(res.body.data).toMatchObject({ created: 0, skipped: 1, enrolled: 0 });
    expect(await db.seasonEnrollment.count({ where: { studentUserId: leader.id } })).toBe(0);
  });
});

describe("POST /api/v1/imports/students/commit — alumni mode", () => {
  it("sets graduationYear and creates no enrolment (spec R48)", async () => {
    const email = testEmail("alumnus");
    const res = await request(app)
      .post("/api/v1/imports/students/commit")
      .set("authorization", `Bearer ${superToken}`)
      .send({
        mode: "alumni",
        graduationYear: 2020,
        onExisting: "skip",
        rows: [
          {
            rowNumber: 2,
            values: {
              name: "An Alumnus",
              email,
              university: null,
              faculty: null,
              universityGraduationYear: null,
              phone: null,
              dateOfBirth: null,
              notes: null,
            },
          },
        ],
      });

    expect(res.status).toBe(200);
    const row = await oneUserByEmail(email);
    expect(row).toMatchObject({ graduationYear: 2020, passwordHash: null, role: "STUDENT" });
    expect(row.seasonEnrollments).toEqual([]);
  });

  it("rejects onExisting=enroll in alumni mode — there is no season to enrol into", async () => {
    const res = await request(app)
      .post("/api/v1/imports/students/commit")
      .set("authorization", `Bearer ${superToken}`)
      .send({
        mode: "alumni",
        graduationYear: 2020,
        onExisting: "enroll",
        rows: [
          {
            rowNumber: 2,
            values: {
              name: "A",
              email: testEmail("alumni-enroll"),
              university: null,
              faculty: null,
              universityGraduationYear: null,
              phone: null,
              dateOfBirth: null,
              notes: null,
            },
          },
        ],
      });
    expect(res.status).toBe(400);
  });
});
