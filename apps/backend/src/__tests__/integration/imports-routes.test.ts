// apps/backend/src/__tests__/integration/imports-routes.test.ts
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import {
  TEST_PREFIX,
  cleanupTestData,
  createTestSeason,
  createTestUser,
  login,
  testEmail,
} from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

/**
 * ── THE PREFIX GUARD ──────────────────────────────────────────────────────
 *
 * This is the only suite in the repo that asks the API to CREATE USERS OUT OF
 * FREE TEXT, against a staging database jpc-space is live on. `cleanupTestData`
 * finds users with `{ email: { startsWith: "space-v2-test-", endsWith:
 * "@jpc.test" } }` and nothing else — so a single mistyped fixture address
 * mints a real-looking account that nothing will ever delete.
 *
 * `sheet()` therefore REFUSES to build a paste containing an email cleanup
 * could not reach. Every paste in this file goes through it. Never build one
 * by hand, and never inline a literal address.
 * ──────────────────────────────────────────────────────────────────────────
 */
function sheet(header: string, ...lines: string[]): string {
  for (const line of [header, ...lines]) {
    for (const cell of line.split(/[\t,]/)) {
      const value = cell.trim();
      if (!value.includes("@")) continue;
      // Compared lower-cased: the case-insensitivity tests deliberately paste
      // `testEmail(...).toUpperCase()`, which is still a fixture address. Any
      // uppercase variant the importer wrongly stored is swept by the
      // case-insensitive delete in afterAll below.
      const lower = value.toLowerCase();
      if (!(lower.startsWith(TEST_PREFIX) && lower.endsWith("@jpc.test"))) {
        throw new Error(
          `Fixture paste contains "${value}", which cleanupTestData cannot delete. ` +
            `Every fixture email must come from testEmail().`,
        );
      }
    }
  }
  return [header, ...lines].join("\n");
}

/** Post-commit assertion helper — reads back exactly the rows a paste named. */
async function usersByEmail(emails: string[]) {
  return db.user.findMany({
    where: { email: { in: emails } },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      passwordHash: true,
      graduationYear: true,
      studentProfile: { select: { activeSeasonId: true, phone: true, university: true, dateOfBirth: true, notes: true } },
      seasonEnrollments: { select: { seasonId: true, status: true, groupId: true } },
    },
  });
}

async function oneUserByEmail(email: string) {
  const [row] = await usersByEmail([email]);
  if (!row) throw new Error("expected the import to have created a user for that address");
  return row;
}

let seasonId: number;
let otherSeasonId: number;
let superToken: string;
let adminToken: string;
let studentToken: string;

beforeAll(async () => {
  await cleanupTestData();

  // EVERY season here is a test season. See the fixture-safety audit: an
  // enrolment written into a real season survives cleanup and then blocks the
  // user delete behind SeasonEnrollment's onDelete: Restrict.
  seasonId = (await createTestSeason()).id;
  otherSeasonId = (await createTestSeason()).id;

  const superUser = await createTestUser("super", "SUPER");
  const admin = await createTestUser("admin", "ADMIN");
  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  const student = await createTestUser("student", "STUDENT");

  superToken = await login(app, superUser.email);
  adminToken = await login(app, admin.email);
  studentToken = await login(app, student.email);
});

afterAll(async () => {
  await cleanupTestData();
  // cleanupTestData's filter is case-SENSITIVE. This suite pastes uppercase
  // variants of fixture addresses on purpose; if a regression ever stored one,
  // the shared filter would miss it. Sweep case-insensitively before asserting.
  const anyCase = {
    email: { startsWith: TEST_PREFIX, endsWith: "@jpc.test", mode: "insensitive" as const },
  };
  await db.studentProfile.deleteMany({ where: { user: anyCase } });
  await db.user.deleteMany({ where: anyCase });
  // Belt and braces on a shared database: prove the suite left nothing.
  const strays = await db.user.count({
    where: { email: { startsWith: TEST_PREFIX, mode: "insensitive" } },
  });
  if (strays !== 0) {
    throw new Error(`imports suite left ${strays} prefixed users behind — cleanupTestData did not reach them`);
  }
  await db.$disconnect();
});

describe("the fixture guard itself", () => {
  it("refuses a paste whose emails cleanupTestData could not delete", () => {
    // If this ever stops throwing, the safety net is gone and the next typo
    // writes a real-looking account into a live database.
    expect(() => sheet("name\temail", "A Real Person\treal.person@gmail.com")).toThrow(/cannot delete/);
    expect(() => sheet("name\temail", `A Test\t${testEmail("ok")}`)).not.toThrow();
    // An uppercase fixture address is still a fixture address.
    expect(() =>
      sheet("name\temail", `A Test\t${testEmail("shout").toUpperCase()}`),
    ).not.toThrow();
  });
});

describe("POST /api/v1/imports/students/preview", () => {
  it("classifies new / exists / duplicate / invalid and reports the counts", async () => {
    const fresh = testEmail("fresh");
    const dupe = testEmail("dupe");
    const existingUser = await createTestUser("already-here", "STUDENT");

    const text = sheet(
      "name\temail\tMobile No\tYear",
      `Fresh Student\t${fresh}\t+201234567\t3rd`,
      `Dupe One\t${dupe}\t\t`,
      `Dupe Two\t${dupe}\t\t`,
      `Existing Student\t${existingUser.email}\t\t`,
      `X\t${testEmail("short-name")}\t\t`,
      `Bad Email Row\tnot-an-email\t\t`,
    );

    const res = await request(app)
      .post("/api/v1/imports/students/preview")
      .set("authorization", `Bearer ${superToken}`)
      .send({ text });

    expect(res.status).toBe(200);
    expect(res.body.data.delimiter).toBe("tab");
    expect(res.body.data.counts).toMatchObject({
      // Fresh + the FIRST of the two Dupe rows stay importable.
      new: 2,
      duplicate: 1,
      exists: 1,
      invalid: 2,
      total: 6,
    });
    // R7/D7: a leading "+" survives, because nothing here ever coerces a cell.
    const freshRow = res.body.data.rows.find((r: { email: string }) => r.email === fresh);
    expect(freshRow).toMatchObject({ rowNumber: 2, status: "new" });
    expect(freshRow.values.phone).toBe("+201234567");
    // Second occurrence is the duplicate; the first stays importable.
    expect(res.body.data.rows.filter((r: { status: string }) => r.status === "duplicate")).toHaveLength(1);
  });

  it("matches an existing address case-insensitively (D-16.6 / spec D2)", async () => {
    // v1 compares raw strings against a case-sensitive unique column
    // (student-import.ts:158), so an operator whose sheet capitalises an
    // address creates a SECOND account for a person already in the system.
    const existing = await createTestUser("case-test", "STUDENT");
    const shouted = existing.email.toUpperCase();

    const res = await request(app)
      .post("/api/v1/imports/students/preview")
      .set("authorization", `Bearer ${superToken}`)
      .send({ text: sheet("name\temail", `Case Test\t${shouted}`) });

    expect(res.status).toBe(200);
    expect(res.body.data.rows[0].status).toBe("exists");
  });

  it("treats two casings of one address in the same paste as one person", async () => {
    const base = testEmail("in-file-case");
    const res = await request(app)
      .post("/api/v1/imports/students/preview")
      .set("authorization", `Bearer ${superToken}`)
      .send({ text: sheet("name\temail", `One\t${base}`, `Two\t${base.toUpperCase()}`) });

    expect(res.body.data.counts).toMatchObject({ new: 1, duplicate: 1 });
  });

  it("previews a soft-deleted address as exists \"Already in the system.\" (R22 / D-16.14)", async () => {
    const removed = await createTestUser("soft-deleted", "STUDENT");
    await db.user.update({ where: { id: removed.id }, data: { deletedAt: new Date() } });

    const res = await request(app)
      .post("/api/v1/imports/students/preview")
      .set("authorization", `Bearer ${superToken}`)
      .send({ text: sheet("name\temail", `Removed Person\t${removed.email}`) });

    expect(res.body.data.rows[0]).toMatchObject({ status: "exists", message: "Already in the system." });
    expect(res.body.data.counts).not.toHaveProperty("previously_removed");
  });

  it("accepts a season export's \"Student\" header (spec D14)", async () => {
    const res = await request(app)
      .post("/api/v1/imports/students/preview")
      .set("authorization", `Bearer ${superToken}`)
      .send({ text: sheet("Student\tEmail\tGroup", `Export Row\t${testEmail("export")}\tGroup A`) });

    expect(res.status).toBe(200);
    expect(res.body.data.rows[0].status).toBe("new");
    expect(res.body.data.detectedColumns).toEqual(["Name", "Email"]);
  });

  it("silently ignores an unrecognised column, as v1 (R18 / D-16.12)", async () => {
    const res = await request(app)
      .post("/api/v1/imports/students/preview")
      .set("authorization", `Bearer ${superToken}`)
      .send({ text: sheet("name,email,Phone No,Uni", `A Row,${testEmail("unrec")},1,2`) });

    expect(res.body.data.delimiter).toBe("comma");
    expect(res.body.data).not.toHaveProperty("unrecognisedColumns");
    expect(res.body.data.detectedColumns).toEqual(["Name", "Email"]);
    expect(res.body.data.rows[0].status).toBe("new");
  });

  it("skips as blank a row whose only text is in an ignored column (R20)", async () => {
    const res = await request(app)
      .post("/api/v1/imports/students/preview")
      .set("authorization", `Bearer ${superToken}`)
      .send({
        text: sheet("name\temail\tGroup", `Kept Row\t${testEmail("blank-a")}\tA`, "\t\tOnly Group", `Also Kept\t${testEmail("blank-b")}\tB`),
      });

    expect(res.body.data.counts).toMatchObject({ total: 2, new: 2, invalid: 0 });
    // Line numbering stays the operator's own: the skipped line keeps line 3.
    expect(res.body.data.rows.map((r: { rowNumber: number }) => r.rowNumber)).toEqual([2, 4]);
  });

  it("uses the LAST name/email column and the FIRST column for a profile field (R17)", async () => {
    const email = testEmail("r17");
    const res = await request(app)
      .post("/api/v1/imports/students/preview")
      .set("authorization", `Bearer ${superToken}`)
      .send({
        text: sheet(
          "name\temail\tphone\tname\tmobile\temail",
          `First Name Col\tnot-an-email\t111\tLast Name Col\t222\t${email}`,
        ),
      });

    expect(res.status).toBe(200);
    expect(res.body.data.rows[0]).toMatchObject({ status: "new", name: "Last Name Col", email });
    expect(res.body.data.rows[0].values.phone).toBe("111");
  });

  it("refuses a paste with no name or email column, naming both", async () => {
    const res = await request(app)
      .post("/api/v1/imports/students/preview")
      .set("authorization", `Bearer ${superToken}`)
      .send({ text: "phone,university\n1,2" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
    expect(res.body.error.message).toMatch(/"name" and "email"/);
  });

  it("rejects a date of birth that is not YYYY-MM-DD, instead of silently dropping it (D-16.11)", async () => {
    // v1 parses with `new Date(string)` and drops an Invalid Date without
    // failing the row (student-import.ts:209-210), so the operator sees
    // "created" and a missing birth date — and 01/02/2003 imports as
    // 2 January in V8 regardless.
    const res = await request(app)
      .post("/api/v1/imports/students/preview")
      .set("authorization", `Bearer ${superToken}`)
      .send({
        text: sheet(
          "name\temail\tdob",
          `Euro Date\t${testEmail("eurodate")}\t01/02/2003`,
          `Impossible\t${testEmail("impossible")}\t2003-02-30`,
          `Good Date\t${testEmail("gooddate")}\t2003-02-28`,
        ),
      });

    expect(res.body.data.counts).toMatchObject({ invalid: 2, new: 1 });
    expect(res.body.data.rows[0].message).toMatch(/YYYY-MM-DD/);
  });

  it("checks only name and email at preview; an over-long value previews new (R24 / D-16.9)", async () => {
    const res = await request(app)
      .post("/api/v1/imports/students/preview")
      .set("authorization", `Bearer ${superToken}`)
      .send({
        text: sheet(
          "name\temail\tNotes",
          `${"x".repeat(300)}\t${testEmail("longname")}\t`,
          `Long Notes\t${testEmail("longnotes")}\t${"n".repeat(2500)}`,
        ),
      });

    // As v1: lengths are a commit-time check, reported `failed` there.
    expect(res.body.data.rows.map((r: { status: string }) => r.status)).toEqual(["new", "new"]);
  });

  it("refuses a non-SUPER caller (D3 — the gate stays SUPER-only)", async () => {
    for (const token of [adminToken, studentToken]) {
      const res = await request(app)
        .post("/api/v1/imports/students/preview")
        .set("authorization", `Bearer ${token}`)
        .send({ text: sheet("name\temail", `A\t${testEmail("gate")}`) });
      expect(res.status).toBe(403);
    }
  });

  it("401s an anonymous caller", async () => {
    const res = await request(app).post("/api/v1/imports/students/preview").send({ text: "x" });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/v1/imports/students/template", () => {
  it("declares that file upload is not available, rather than leaving the client to guess (D-16.3)", async () => {
    const res = await request(app)
      .get("/api/v1/imports/students/template")
      .set("authorization", `Bearer ${superToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.capabilities).toEqual({ pasteText: true, fileUpload: false });
    expect(res.body.data.headerRow.split("\t")).toContain("email");
    expect(res.body.data.maxRows).toBe(2000);
    const nameCol = res.body.data.columns.find((c: { label: string }) => c.label === "Name");
    expect(nameCol).toMatchObject({ required: true, maxLength: 120 });
    expect(nameCol.acceptedHeaders).toContain("student");
  });
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
        rows: [
          {
            rowNumber: 2,
            values: {
              name: "Committed Student",
              email,
              university: "Test University",
              year: "3rd",
              phone: "+201234567",
              dateOfBirth: "2003-02-28",
              spiritualBackground: null,
              gifts: null,
              notes: "Internal staff note",
            },
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ created: 1, skipped: 0, failed: 0 });
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
    });
    expect(row.email).toBe(email); // stored EXACTLY as pasted (D-16.6)
    expect(row.studentProfile).toMatchObject({
      activeSeasonId: seasonId,
      university: "Test University",
      // R7/D7: the leading "+" survives — nothing coerced this cell.
      phone: "+201234567",
      notes: "Internal staff note",
    });
    // D-16.11: UTC midnight, not local midnight, not a transposed month.
    expect(row.studentProfile?.dateOfBirth?.toISOString()).toBe("2003-02-28T00:00:00.000Z");
    // The profile pointer and the enrolment agree by construction.
    expect(row.seasonEnrollments).toEqual([
      expect.objectContaining({ seasonId, status: "ACTIVE", groupId: null }),
    ]);
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
      { rowNumber: 2, values: { name: "Rerun A", email: a, university: null, year: null, phone: null, dateOfBirth: null, spiritualBackground: null, gifts: null, notes: null } },
      { rowNumber: 3, values: { name: "Rerun B", email: b, university: null, year: null, phone: null, dateOfBirth: null, spiritualBackground: null, gifts: null, notes: null } },
    ];
    const body = { mode: "season" as const, seasonId, rows };

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
    expect(second.body.data).toMatchObject({ created: 0, skipped: 2, failed: 0 });
    expect(second.body.data.rows.every((r: { outcome: string }) => r.outcome === "skipped")).toBe(true);

    // The assertion that cannot be satisfied by a lucky status code: count
    // the rows. Two addresses in, two users out, after two identical runs.
    expect(await db.user.count({ where: { email: { in: [a, b] } } })).toBe(2);
    expect(await db.seasonEnrollment.count({ where: { seasonId, studentUser: { email: { in: [a, b] } } } })).toBe(2);
    expect(await db.studentProfile.count({ where: { user: { email: { in: [a, b] } } } })).toBe(2);
  });

  it("matches an existing user whose stored address differs only in case", async () => {
    // Mutation 2's target. Without lower-casing the comparison, this inserts a
    // second account under the uppercase address — the count below goes red.
    const existing = await createTestUser("commit-case", "STUDENT");
    const res = await request(app)
      .post("/api/v1/imports/students/commit")
      .set("authorization", `Bearer ${superToken}`)
      .send({
        mode: "season",
        seasonId,
        rows: [{ rowNumber: 2, values: { name: "Shouted Case", email: existing.email.toUpperCase(), university: null, year: null, phone: null, dateOfBirth: null, spiritualBackground: null, gifts: null, notes: null } }],
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
        rows: [
          { rowNumber: 2, values: { name: "First Casing", email, university: null, year: null, phone: null, dateOfBirth: null, spiritualBackground: null, gifts: null, notes: null } },
          { rowNumber: 3, values: { name: "Second Casing", email: email.toUpperCase(), university: null, year: null, phone: null, dateOfBirth: null, spiritualBackground: null, gifts: null, notes: null } },
        ],
      });

    // v1 creates TWO accounts here (spec R25).
    expect(res.body.data).toMatchObject({ created: 1, skipped: 1 });
    expect(await db.user.count({ where: { email: { in: [email, email.toUpperCase()] } } })).toBe(1);
  });

  it("reports an invalid row failed and commits the rows around it (R42, R45)", async () => {
    const good = testEmail("perrow-good");
    const alsoGood = testEmail("perrow-also");
    const bad = testEmail("perrow-bad");
    const res = await request(app)
      .post("/api/v1/imports/students/commit")
      .set("authorization", `Bearer ${superToken}`)
      .send({
        mode: "season",
        seasonId,
        rows: [
          { rowNumber: 2, values: { name: "Good One", email: good, university: null, year: null, phone: null, dateOfBirth: null, spiritualBackground: null, gifts: null, notes: null } },
          // Over v1's import bound for phone (50) — previews `new`, fails here.
          { rowNumber: 3, values: { name: "Long Phone", email: bad, university: null, year: null, phone: "1".repeat(51), dateOfBirth: null, spiritualBackground: null, gifts: null, notes: null } },
          { rowNumber: 4, values: { name: "Also Good", email: alsoGood, university: null, year: null, phone: null, dateOfBirth: null, spiritualBackground: null, gifts: null, notes: null } },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ created: 2, skipped: 0, failed: 1 });
    expect(res.body.data.rows[1]).toMatchObject({ rowNumber: 3, outcome: "failed", message: "Invalid name or email." });
    expect(await db.user.count({ where: { email: { in: [good, alsoGood] } } })).toBe(2);
    expect(await db.user.count({ where: { email: bad } })).toBe(0);
  });

  it("re-derives validity server-side — a client's own classification is never trusted (D-16.4)", async () => {
    // The commit body has no `status` field at all, so the only way a client
    // can assert "this row is fine" is by sending it. The server disagrees.
    const res = await request(app)
      .post("/api/v1/imports/students/commit")
      .set("authorization", `Bearer ${superToken}`)
      .send({
        mode: "season",
        seasonId,
        rows: [{ rowNumber: 2, status: "new", values: { name: "N", email: "definitely-not-an-email", university: null, year: null, phone: null, dateOfBirth: null, spiritualBackground: null, gifts: null, notes: null } }],
      });
    expect(res.status).toBe(200);
    expect(res.body.data.rows[0]).toMatchObject({ outcome: "failed", message: "Invalid name or email." });
  });

  it("404s a soft-deleted season and writes nothing (spec R39)", async () => {
    const doomed = await createTestSeason();
    await db.season.update({ where: { id: doomed.id }, data: { deletedAt: new Date() } });
    const email = testEmail("dead-season");

    const res = await request(app)
      .post("/api/v1/imports/students/commit")
      .set("authorization", `Bearer ${superToken}`)
      .send({ mode: "season", seasonId: doomed.id, rows: [{ rowNumber: 2, values: { name: "Orphan Row", email, university: null, year: null, phone: null, dateOfBirth: null, spiritualBackground: null, gifts: null, notes: null } }] });

    expect(res.status).toBe(404);
    expect(await db.user.count({ where: { email } })).toBe(0);
  });

  it("refuses ADMIN and STUDENT (spec D3 — SUPER-only, and it stays that way)", async () => {
    for (const token of [adminToken, studentToken]) {
      const res = await request(app)
        .post("/api/v1/imports/students/commit")
        .set("authorization", `Bearer ${token}`)
        .send({ mode: "season", seasonId, rows: [{ rowNumber: 2, values: { name: "Nope", email: testEmail("nope"), university: null, year: null, phone: null, dateOfBirth: null, spiritualBackground: null, gifts: null, notes: null } }] });
      expect(res.status).toBe(403);
    }
  });
});

describe("POST /api/v1/imports/students/commit — existing users (R44, R22)", () => {
  const blank = { university: null, year: null, phone: null, dateOfBirth: null, spiritualBackground: null, gifts: null, notes: null };

  it("skips an existing student and writes nothing about them — never updated, never enrolled", async () => {
    const returning = await createTestUser("returning", "STUDENT");
    await db.studentProfile.create({
      data: { userId: returning.id, activeSeasonId: otherSeasonId, notes: "A year of pastoral notes", university: "Old University" },
    });

    const res = await request(app)
      .post("/api/v1/imports/students/commit")
      .set("authorization", `Bearer ${superToken}`)
      .send({
        mode: "season",
        seasonId,
        // An old client still sending the removed field: stripped, not honoured.
        onExisting: "enroll",
        rows: [{ rowNumber: 2, values: { ...blank, name: "A COMPLETELY DIFFERENT NAME", email: returning.email, notes: "stale export note" } }],
      });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ created: 0, skipped: 1, failed: 0 });
    expect(res.body.data.rows[0]).toMatchObject({ outcome: "skipped", message: "Already in the system." });

    const row = await oneUserByEmail(returning.email);
    expect(row.seasonEnrollments).toEqual([]);
    expect(row.studentProfile?.activeSeasonId).toBe(otherSeasonId);
    expect(row.name).toBe("Test returning");
    expect(row.studentProfile?.notes).toBe("A year of pastoral notes");
  });

  it("skips a soft-deleted address with \"Already in the system.\" and never resurrects it", async () => {
    const removed = await createTestUser("commit-removed", "STUDENT");
    await db.user.update({ where: { id: removed.id }, data: { deletedAt: new Date() } });

    const res = await request(app)
      .post("/api/v1/imports/students/commit")
      .set("authorization", `Bearer ${superToken}`)
      .send({ mode: "season", seasonId, rows: [{ rowNumber: 2, values: { ...blank, name: "Removed Person", email: removed.email } }] });

    expect(res.body.data).toMatchObject({ created: 0, skipped: 1, failed: 0 });
    expect(res.body.data.rows[0].message).toBe("Already in the system.");
    expect(await db.seasonEnrollment.count({ where: { studentUserId: removed.id, seasonId } })).toBe(0);
    const still = await db.user.findUniqueOrThrow({ where: { id: removed.id }, select: { deletedAt: true } });
    expect(still.deletedAt).not.toBeNull();
  });

  it("skips an address that belongs to a staff account", async () => {
    const leader = await createTestUser("commit-leader", "LEADER");
    const res = await request(app)
      .post("/api/v1/imports/students/commit")
      .set("authorization", `Bearer ${superToken}`)
      .send({ mode: "season", seasonId, rows: [{ rowNumber: 2, values: { ...blank, name: "A Leader", email: leader.email } }] });

    expect(res.body.data).toMatchObject({ created: 0, skipped: 1, failed: 0 });
    expect(await db.seasonEnrollment.count({ where: { studentUserId: leader.id } })).toBe(0);
  });
});

describe("POST /api/v1/imports/students/commit — alumni mode", () => {
  it("sets graduationYear and creates NEITHER an active season NOR an enrolment (spec R48)", async () => {
    const email = testEmail("alumnus");
    const res = await request(app)
      .post("/api/v1/imports/students/commit")
      .set("authorization", `Bearer ${superToken}`)
      .send({ mode: "alumni", graduationYear: 2020, rows: [{ rowNumber: 2, values: { name: "An Alumnus", email, university: null, year: null, phone: null, dateOfBirth: null, spiritualBackground: null, gifts: null, notes: null } }] });

    expect(res.status).toBe(200);
    const row = await oneUserByEmail(email);
    expect(row).toMatchObject({ graduationYear: 2020, passwordHash: null, role: "STUDENT" });
    expect(row.studentProfile?.activeSeasonId).toBeNull();
    expect(row.seasonEnrollments).toEqual([]);
  });

});

describe("POST /api/v1/seasons/:id/imports/groups/preview", () => {
  let groupAId: number;
  let groupBId: number;
  let enrolledId: number;
  let enrolledEmail: string;
  let inGroupAId: number;
  let inGroupAEmail: string;
  let unenrolledEmail: string;

  beforeAll(async () => {
    const groupA = await db.group.create({ data: { seasonId, name: "Group A" }, select: { id: true } });
    const groupB = await db.group.create({ data: { seasonId, name: "Group B" }, select: { id: true } });
    groupAId = groupA.id;
    groupBId = groupB.id;

    const enrolled = await createTestUser("grp-enrolled", "STUDENT");
    enrolledId = enrolled.id;
    enrolledEmail = enrolled.email;
    await db.studentProfile.create({ data: { userId: enrolledId, activeSeasonId: seasonId } });
    await db.seasonEnrollment.create({ data: { studentUserId: enrolledId, seasonId, status: "ACTIVE" } });

    const inGroupA = await createTestUser("grp-already", "STUDENT");
    inGroupAId = inGroupA.id;
    inGroupAEmail = inGroupA.email;
    await db.studentProfile.create({ data: { userId: inGroupAId, activeSeasonId: seasonId } });
    await db.seasonEnrollment.create({
      data: { studentUserId: inGroupAId, seasonId, groupId: groupAId, status: "ACTIVE" },
    });

    const unenrolled = await createTestUser("grp-outsider", "STUDENT");
    unenrolledEmail = unenrolled.email;
  });

  it("classifies assign / unchanged / no_student / no_group / invalid", async () => {
    const res = await request(app)
      .post(`/api/v1/seasons/${seasonId}/imports/groups/preview`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({
        text: sheet(
          "name\temail\tgroup",
          `Enrolled Student\t${enrolledEmail}\tGroup B`,
          `Already There\t${inGroupAEmail}\tgroup a`,
          `Outsider\t${unenrolledEmail}\tGroup A`,
          `No Group Named\t${enrolledEmail}\tGroup Z`,
          `Blank Group\t${inGroupAEmail}\t`,
          `Bad Email\tnope\tGroup A`,
        ),
      });

    expect(res.status).toBe(200);
    expect(res.body.data.counts).toMatchObject({
      assign: 1,
      unchanged: 1,
      no_student: 1,
      no_group: 2,
      invalid: 1,
      total: 6,
    });
    const assigned = res.body.data.rows.find((r: { status: string }) => r.status === "assign");
    expect(assigned).toMatchObject({ studentUserId: enrolledId, groupId: groupBId });
    // Group names match case-insensitively (spec R64): "group a" found "Group A".
    expect(res.body.data.rows[1]).toMatchObject({ status: "unchanged", groupId: groupAId });
    // A blank cell is no_group, NOT an unassign (spec R69 / D-16.19.4).
    expect(res.body.data.rows[4]).toMatchObject({ status: "no_group" });
    expect(res.body.data.rows[3].message).toMatch(/Group Z/);
  });

  it("resolves the roster through SeasonEnrollment, not the activeSeasonId pointer (ruling C9)", async () => {
    // v1's roster is `StudentProfile.activeSeasonId = seasonId`
    // (groups-query.ts:143-148), so a student holding an ACTIVE enrolment in
    // this season whose pointer happens to name another one is INVISIBLE to
    // the importer (spec R61) — and worse, the write gates on the same
    // pointer and silently skips them (R76/D5).
    const pointerElsewhere = await createTestUser("grp-pointer", "STUDENT");
    await db.studentProfile.create({ data: { userId: pointerElsewhere.id, activeSeasonId: otherSeasonId } });
    await db.seasonEnrollment.create({ data: { studentUserId: pointerElsewhere.id, seasonId, status: "ACTIVE" } });

    const res = await request(app)
      .post(`/api/v1/seasons/${seasonId}/imports/groups/preview`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ text: sheet("email\tgroup", `${pointerElsewhere.email}\tGroup A`) });

    expect(res.body.data.rows[0]).toMatchObject({ status: "assign", groupId: groupAId });
  });

  it("classifies a WITHDRAWN student no_student, not assign", async () => {
    const gone = await createTestUser("grp-withdrawn-preview", "STUDENT");
    await db.seasonEnrollment.create({
      data: { studentUserId: gone.id, seasonId, status: "WITHDRAWN" },
    });
    const res = await request(app)
      .post(`/api/v1/seasons/${seasonId}/imports/groups/preview`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ text: sheet("email\tgroup", `${gone.email}\tGroup A`) });
    expect(res.status).toBe(200);
    expect(res.body.data.rows[0].status).toBe("no_student");
  });

  it("refuses only the row naming an ambiguous group, not the paste (D-16.19.1 / R65)", async () => {
    const clash = await createTestSeason();
    const admin = await db.user.findFirstOrThrow({ where: { email: { startsWith: `${TEST_PREFIX}admin-` } }, select: { id: true, email: true } });
    await db.seasonAdmin.create({ data: { seasonId: clash.id, userId: admin.id } });
    await db.group.create({ data: { seasonId: clash.id, name: "Alpha" } });
    await db.group.create({ data: { seasonId: clash.id, name: "alpha " } });
    const beta = await db.group.create({ data: { seasonId: clash.id, name: "Beta" }, select: { id: true } });
    const one = await createTestUser("grp-clash-one", "STUDENT");
    const two = await createTestUser("grp-clash-two", "STUDENT");
    for (const u of [one, two]) {
      await db.seasonEnrollment.create({ data: { studentUserId: u.id, seasonId: clash.id, status: "ACTIVE" } });
    }

    const fresh = await login(app, admin.email);
    const res = await request(app)
      .post(`/api/v1/seasons/${clash.id}/imports/groups/preview`)
      .set("authorization", `Bearer ${fresh}`)
      .send({ text: sheet("email\tgroup", `${one.email}\tALPHA`, `${two.email}\tBeta`) });

    expect(res.status).toBe(200);
    expect(res.body.data.rows[0]).toMatchObject({
      status: "no_group",
      groupId: null,
      message: 'Several groups in this season are named "ALPHA". Rename one of them, then import again.',
    });
    expect(res.body.data.rows[1]).toMatchObject({ status: "assign", groupId: beta.id });

    const commit = await request(app)
      .post(`/api/v1/seasons/${clash.id}/imports/groups/commit`)
      .set("authorization", `Bearer ${fresh}`)
      .send({ assignments: [{ studentUserId: two.id, groupId: beta.id }] });
    expect(commit.status).toBe(200);
    expect(commit.body.data.assigned).toBe(1);
  });

  it("refuses an ADMIN of a different season, and a STUDENT (C8 — the row gate)", async () => {
    const outside = await request(app)
      .post(`/api/v1/seasons/${otherSeasonId}/imports/groups/preview`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ text: sheet("email\tgroup", `${enrolledEmail}\tGroup A`) });
    expect(outside.status).toBe(403);

    const student = await request(app)
      .post(`/api/v1/seasons/${seasonId}/imports/groups/preview`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ text: sheet("email\tgroup", `${enrolledEmail}\tGroup A`) });
    expect(student.status).toBe(403);
  });

  it("admits SUPER to any season", async () => {
    const res = await request(app)
      .post(`/api/v1/seasons/${seasonId}/imports/groups/preview`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ text: sheet("email\tgroup", `${enrolledEmail}\tGroup A`) });
    expect(res.status).toBe(200);
  });

  describe("POST /api/v1/seasons/:id/imports/groups/commit", () => {
    it("writes the memberships, sets SeasonEnrollment.groupId, and reports what it ACTUALLY wrote (D5)", async () => {
      const outsider = await db.user.findFirstOrThrow({ where: { email: unenrolledEmail }, select: { id: true } });

      const res = await request(app)
        .post(`/api/v1/seasons/${seasonId}/imports/groups/commit`)
        .set("authorization", `Bearer ${adminToken}`)
        .send({
          assignments: [
            { studentUserId: enrolledId, groupId: groupBId },
            // Not enrolled in this season — must NOT be counted as assigned.
            { studentUserId: outsider.id, groupId: groupBId },
          ],
        });

      expect(res.status).toBe(200);
      // v1 returns the REQUESTED length here (spec R80), so this would read 2.
      expect(res.body.data).toMatchObject({ assigned: 1, skipped: 1, skippedStudentIds: [outsider.id] });

      const enrolment = await db.seasonEnrollment.findUnique({
        where: { studentUserId_seasonId: { studentUserId: enrolledId, seasonId } },
        select: { groupId: true, status: true },
      });
      expect(enrolment).toMatchObject({ groupId: groupBId, status: "ACTIVE" });
      expect(await db.groupStudent.count({ where: { studentUserId: enrolledId, groupId: groupBId } })).toBe(1);
      expect(await db.groupStudent.count({ where: { studentUserId: outsider.id } })).toBe(0);
    });

    it("skips a WITHDRAWN enrolment — only ACTIVE students are placed (C9)", async () => {
      const gone = await createTestUser("grp-withdrawn", "STUDENT");
      await db.seasonEnrollment.create({
        data: { studentUserId: gone.id, seasonId, status: "WITHDRAWN" },
      });

      const res = await request(app)
        .post(`/api/v1/seasons/${seasonId}/imports/groups/commit`)
        .set("authorization", `Bearer ${adminToken}`)
        .send({ assignments: [{ studentUserId: gone.id, groupId: groupAId }] });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ assigned: 0, skippedStudentIds: [gone.id] });
      expect(await db.groupStudent.count({ where: { studentUserId: gone.id } })).toBe(0);
    });

    it("refuses the WHOLE batch when any group is outside the season (spec R75)", async () => {
      const foreign = await db.group.create({ data: { seasonId: otherSeasonId, name: "Foreign Group" }, select: { id: true } });

      const res = await request(app)
        .post(`/api/v1/seasons/${seasonId}/imports/groups/commit`)
        .set("authorization", `Bearer ${adminToken}`)
        .send({
          assignments: [
            { studentUserId: inGroupAId, groupId: groupBId },
            { studentUserId: enrolledId, groupId: foreign.id },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("group_outside_season");
      // Nothing partial: the first, legal assignment must not have landed.
      const stillA = await db.seasonEnrollment.findUnique({
        where: { studentUserId_seasonId: { studentUserId: inGroupAId, seasonId } },
        select: { groupId: true },
      });
      expect(stillA?.groupId).toBe(groupAId);
    });

    it("takes seasonId from the PATH — preview and commit cannot target different seasons (D-16.20)", async () => {
      const res = await request(app)
        .post(`/api/v1/seasons/${otherSeasonId}/imports/groups/commit`)
        .set("authorization", `Bearer ${adminToken}`)
        .send({ assignments: [{ studentUserId: enrolledId, groupId: groupAId }] });
      // adminToken administers `seasonId`, not `otherSeasonId`.
      expect(res.status).toBe(403);
    });

    it("is idempotent — committing the same assignments twice changes nothing", async () => {
      const body = { assignments: [{ studentUserId: enrolledId, groupId: groupAId }] };
      const first = await request(app)
        .post(`/api/v1/seasons/${seasonId}/imports/groups/commit`)
        .set("authorization", `Bearer ${adminToken}`)
        .send(body);
      const second = await request(app)
        .post(`/api/v1/seasons/${seasonId}/imports/groups/commit`)
        .set("authorization", `Bearer ${adminToken}`)
        .send(body);

      expect(first.body.data.assigned).toBe(1);
      expect(second.body.data.assigned).toBe(1);
      expect(await db.groupStudent.count({ where: { studentUserId: enrolledId } })).toBe(1);
    });
  });
});

describe("the import body limit", () => {
  it("accepts a paste larger than the global 100 KB parser limit", async () => {
    // ~150 KB: under IMPORT_MAX_PASTE_CHARS, over body-parser's default. Before
    // the route-level parser this was an unmapped entity.too.large → 500.
    const rows = Array.from(
      { length: 900 },
      (_, i) => `Bulk Student ${i}\t${testEmail(`bulk-${i}`)}\t${"x".repeat(80)}`,
    );
    const text = sheet("name\temail\tNotes", ...rows);
    expect(text.length).toBeGreaterThan(100 * 1024);
    const res = await request(app)
      .post("/api/v1/imports/students/preview")
      .set("authorization", `Bearer ${superToken}`)
      .send({ text });
    expect(res.status).toBe(200);
    expect(res.body.data.rows).toHaveLength(900);
  });

  it("accepts a paste over 256 KB and under v1's 5 MB ceiling (R3)", async () => {
    const rows = Array.from(
      { length: 1500 },
      (_, i) => `Big Student ${i}\t${testEmail(`big-${i}`)}\t${"y".repeat(200)}`,
    );
    const text = sheet("name\temail\tNotes", ...rows);
    expect(text.length).toBeGreaterThan(256 * 1024);
    const res = await request(app)
      .post("/api/v1/imports/students/preview")
      .set("authorization", `Bearer ${superToken}`)
      .send({ text });
    expect(res.status).toBe(200);
    expect(res.body.data.rows).toHaveLength(1500);
  });
});
