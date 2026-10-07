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

let seasonId: number;
let superToken: string;
let adminToken: string;
let studentToken: string;

beforeAll(async () => {
  await cleanupTestData();

  // EVERY season here is a test season. See the fixture-safety audit: an
  // enrolment written into a real season survives cleanup and then blocks the
  // user delete behind SeasonEnrollment's onDelete: Restrict.
  seasonId = (await createTestSeason()).id;

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
      previously_removed: 0,
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

  it("gives a soft-deleted address its own status and a message that says what to do (D-16.14)", async () => {
    const removed = await createTestUser("soft-deleted", "STUDENT");
    await db.user.update({ where: { id: removed.id }, data: { deletedAt: new Date() } });

    const res = await request(app)
      .post("/api/v1/imports/students/preview")
      .set("authorization", `Bearer ${superToken}`)
      .send({ text: sheet("name\temail", `Removed Person\t${removed.email}`) });

    expect(res.body.data.rows[0].status).toBe("previously_removed");
    expect(res.body.data.rows[0].message).toMatch(/restore/i);
  });

  it("accepts a season export's \"Student\" header (spec D14)", async () => {
    const res = await request(app)
      .post("/api/v1/imports/students/preview")
      .set("authorization", `Bearer ${superToken}`)
      .send({ text: sheet("Student\tEmail\tGroup", `Export Row\t${testEmail("export")}\tGroup A`) });

    expect(res.status).toBe(200);
    expect(res.body.data.rows[0].status).toBe("new");
    expect(res.body.data.detectedColumns).toEqual(["Name", "Email"]);
    // D-16.12: the column that matched nothing is named, not swallowed.
    expect(res.body.data.unrecognisedColumns).toEqual(["Group"]);
  });

  it("names an unrecognised column as typed (trimmed)", async () => {
    const res = await request(app)
      .post("/api/v1/imports/students/preview")
      .set("authorization", `Bearer ${superToken}`)
      .send({ text: sheet("name,email,Phone No,Uni", `A,${testEmail("unrec")},1,2`) });

    expect(res.body.data.delimiter).toBe("comma");
    expect(res.body.data.unrecognisedColumns).toEqual(["Phone No", "Uni"]);
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

  it("applies the SAME length rules at preview as at commit (D-16.9 / spec D12)", async () => {
    const res = await request(app)
      .post("/api/v1/imports/students/preview")
      .set("authorization", `Bearer ${superToken}`)
      .send({ text: sheet("name\temail", `${"x".repeat(300)}\t${testEmail("longname")}`) });

    // v1 previews this green and returns `failed` after the operator commits.
    expect(res.body.data.rows[0].status).toBe("invalid");
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
});
