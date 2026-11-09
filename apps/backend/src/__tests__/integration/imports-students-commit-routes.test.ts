// apps/backend/src/__tests__/integration/imports-students-commit-routes.test.ts
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { createTestSeason, createTestUser, testEmail } from "./fixtures";
import { oneUserByEmail, seedImportFixtures, teardownImportFixtures } from "./imports-setup";

jest.setTimeout(60000);

const app = createApp();

// Every paste goes through `sheet()` — see THE PREFIX GUARD in imports-setup.ts.

let seasonId: number;
let superToken: string;
let adminToken: string;
let studentToken: string;

beforeAll(async () => {
  ({ seasonId, superToken, adminToken, studentToken } = await seedImportFixtures(app));
});

afterAll(async () => {
  await teardownImportFixtures();
});

describe("POST /api/v1/imports/students/commit — season mode", () => {
  it("creates User + StudentProfile + ACTIVE SeasonEnrollment with NO credentials", async () => {
    const email = testEmail("committed");
    const res = await request(app)
      .post("/api/v1/imports/students/commit")
      .set("authorization", `Bearer ${superToken}`)
      .send({
        mode: "season",
        seasonId,
        onExisting: "skip",
        rows: [
          {
            rowNumber: 2,
            values: {
              name: "Committed Student",
              email,
              university: "Test University",
              faculty: "Engineering",
              universityGraduationYear: "2027",
              phone: "+201234567890",
              dateOfBirth: "2003-02-28",
              notes: "Internal staff note",
            },
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ created: 1, skipped: 0, enrolled: 0 });
    expect(res.body.data.rows[0]).toMatchObject({ rowNumber: 2, outcome: "created" });
    expect(res.body.data.rows[0].userId).toEqual(expect.any(Number));

    const row = await oneUserByEmail(email);
    expect(row).toMatchObject({
      role: "STUDENT",
      // THE credential rule. v1's student-actions.ts:59 hard-codes
      // "ChangeMe123!" for form-created students; v2 has no shared default
      // password anywhere, and an invite is the only way an account gets
      // credentials (Plan 9). An imported account exists and cannot be
      // logged into until that invite is accepted.
      passwordHash: null,
      graduationYear: null,
      // Stored in the one canonical form, 01 + 9 digits (owner, 2026-11-07).
      phone: "01234567890",
    });
    expect(row.email).toBe(email); // stored EXACTLY as pasted (D-16.6)
    expect(row.studentProfile).toMatchObject({
      university: "Test University",
      faculty: "Engineering",
      universityGraduationYear: 2027,
      notes: "Internal staff note",
    });
    // D-16.11: UTC midnight, not local midnight, not a transposed month.
    expect(row.dateOfBirth?.toISOString()).toBe("2003-02-28T00:00:00.000Z");
    // The enrolment is what places the student in the season.
    expect(row.seasonEnrollments).toEqual([expect.objectContaining({ seasonId, status: "ACTIVE", groupId: null })]);
  });

  /**
   * ── THE IDEMPOTENCE TEST ────────────────────────────────────────────────
   * This is the roadmap's done-condition for Plan 17: "a re-run of the same
   * import creates zero duplicate rows against staging." It is Task 7's
   * mutation 1 target and it must go RED when the email-match branch in
   * commitStudentImport is deleted.
   */
  it("re-running the same paste creates ZERO new rows (D-16.6 / spec R44)", async () => {
    const a = testEmail("rerun-a");
    const b = testEmail("rerun-b");
    const rows = [
      {
        rowNumber: 2,
        values: {
          name: "Rerun A",
          email: a,
          university: null,
          faculty: null,
          universityGraduationYear: null,
          phone: null,
          dateOfBirth: null,
          notes: null,
        },
      },
      {
        rowNumber: 3,
        values: {
          name: "Rerun B",
          email: b,
          university: null,
          faculty: null,
          universityGraduationYear: null,
          phone: null,
          dateOfBirth: null,
          notes: null,
        },
      },
    ];
    const body = { mode: "season" as const, seasonId, onExisting: "skip" as const, rows };

    const first = await request(app)
      .post("/api/v1/imports/students/commit")
      .set("authorization", `Bearer ${superToken}`)
      .send(body);
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({ created: 2, skipped: 0 });

    const second = await request(app)
      .post("/api/v1/imports/students/commit")
      .set("authorization", `Bearer ${superToken}`)
      .send(body);

    expect(second.status).toBe(200);
    expect(second.body.data).toMatchObject({ created: 0, skipped: 2, enrolled: 0 });
    expect(second.body.data.rows.every((r: { outcome: string }) => r.outcome === "skipped")).toBe(true);

    // The assertion that cannot be satisfied by a lucky status code: count
    // the rows. Two addresses in, two users out, after two identical runs.
    expect(await db.user.count({ where: { email: { in: [a, b] } } })).toBe(2);
    expect(await db.seasonEnrollment.count({ where: { seasonId, studentUser: { email: { in: [a, b] } } } })).toBe(2);
    expect(await db.studentProfile.count({ where: { user: { email: { in: [a, b] } } } })).toBe(2);
  });

  it("matches an existing user whose stored address differs only in case", async () => {
    // Mutation 2's target. Without lower-casing the comparison, this attempts
    // an insert that the @unique index refuses, the transaction rolls back,
    // and the response is 409 instead of 200 — red either way.
    const existing = await createTestUser("commit-case", "STUDENT");
    const res = await request(app)
      .post("/api/v1/imports/students/commit")
      .set("authorization", `Bearer ${superToken}`)
      .send({
        mode: "season",
        seasonId,
        onExisting: "skip",
        rows: [
          {
            rowNumber: 2,
            values: {
              name: "Shouted Case",
              email: existing.email.toUpperCase(),
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
    expect(res.body.data).toMatchObject({ created: 0, skipped: 1 });
    expect(await db.user.count({ where: { email: existing.email.toUpperCase() } })).toBe(0);
  });

  it("collapses two casings of one address in the same batch to a single account", async () => {
    const email = testEmail("batch-case");
    const res = await request(app)
      .post("/api/v1/imports/students/commit")
      .set("authorization", `Bearer ${superToken}`)
      .send({
        mode: "season",
        seasonId,
        onExisting: "skip",
        rows: [
          {
            rowNumber: 2,
            values: {
              name: "First Casing",
              email,
              university: null,
              faculty: null,
              universityGraduationYear: null,
              phone: null,
              dateOfBirth: null,
              notes: null,
            },
          },
          {
            rowNumber: 3,
            values: {
              name: "Second Casing",
              email: email.toUpperCase(),
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

    // v1 creates TWO accounts here (spec R25).
    expect(res.body.data).toMatchObject({ created: 1, skipped: 1 });
    expect(await db.user.count({ where: { email: { in: [email, email.toUpperCase()] } } })).toBe(1);
  });

  it("refuses the WHOLE batch when any row is invalid, and writes nothing (D-16.5)", async () => {
    const good = testEmail("allornothing-good");
    const alsoGood = testEmail("allornothing-also");
    const res = await request(app)
      .post("/api/v1/imports/students/commit")
      .set("authorization", `Bearer ${superToken}`)
      .send({
        mode: "season",
        seasonId,
        onExisting: "skip",
        rows: [
          {
            rowNumber: 2,
            values: {
              name: "Good One",
              email: good,
              university: null,
              faculty: null,
              universityGraduationYear: null,
              phone: null,
              dateOfBirth: null,
              notes: null,
            },
          },
          // A client that filtered its own preview badly, or lied.
          {
            rowNumber: 3,
            values: {
              name: "x".repeat(300),
              email: testEmail("allornothing-bad"),
              university: null,
              faculty: null,
              universityGraduationYear: null,
              phone: null,
              dateOfBirth: null,
              notes: null,
            },
          },
          {
            rowNumber: 4,
            values: {
              name: "Also Good",
              email: alsoGood,
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

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("import_rows_invalid");
    expect(res.body.error.message).toMatch(/\b3\b/); // names the offending row number
    // v1 would have written rows 2 and 4 and reported row 3 `failed` (R45).
    expect(await db.user.count({ where: { email: { in: [good, alsoGood] } } })).toBe(0);
  });

  it("re-derives status server-side — a client's own classification is never trusted (D-16.4)", async () => {
    // The commit body has no `status` field at all, so the only way a client
    // can assert "this row is fine" is by sending it. The server disagrees.
    const res = await request(app)
      .post("/api/v1/imports/students/commit")
      .set("authorization", `Bearer ${superToken}`)
      .send({
        mode: "season",
        seasonId,
        onExisting: "skip",
        rows: [
          {
            rowNumber: 2,
            status: "new",
            values: {
              name: "N",
              email: "definitely-not-an-email",
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
    expect(res.status).toBe(422);
  });

  it("404s a soft-deleted season and writes nothing (spec R39)", async () => {
    const doomed = await createTestSeason();
    await db.season.update({ where: { id: doomed.id }, data: { deletedAt: new Date() } });
    const email = testEmail("dead-season");

    const res = await request(app)
      .post("/api/v1/imports/students/commit")
      .set("authorization", `Bearer ${superToken}`)
      .send({
        mode: "season",
        seasonId: doomed.id,
        onExisting: "skip",
        rows: [
          {
            rowNumber: 2,
            values: {
              name: "Orphan Row",
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

    expect(res.status).toBe(404);
    expect(await db.user.count({ where: { email } })).toBe(0);
  });

  it("refuses ADMIN and STUDENT (spec D3 — SUPER-only, and it stays that way)", async () => {
    for (const token of [adminToken, studentToken]) {
      const res = await request(app)
        .post("/api/v1/imports/students/commit")
        .set("authorization", `Bearer ${token}`)
        .send({
          mode: "season",
          seasonId,
          onExisting: "skip",
          rows: [
            {
              rowNumber: 2,
              values: {
                name: "Nope",
                email: testEmail("nope"),
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
      expect(res.status).toBe(403);
    }
  });
});
