// apps/backend/src/__tests__/integration/exports-routes.test.ts
import ExcelJS from "exceljs";
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

jest.setTimeout(60000);

/**
 * exceljs's typings predate @types/node's generic Buffer<ArrayBufferLike>, so a
 * perfectly good Buffer is "not assignable" to its parameter. Narrow through
 * the parameter's own type rather than silencing it with `any`.
 */
type LoadArg = Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0];
function asLoadable(buf: Buffer): LoadArg {
  return buf as unknown as LoadArg;
}

const app = createApp();

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

let seasonId: number;
let otherSeasonId: number;
let deletedSeasonId: number;
let superToken: string;
let mentorToken: string;
let adminToken: string;
let leaderToken: string;
let studentToken: string;

beforeAll(async () => {
  await cleanupTestData();

  seasonId = (await createTestSeason()).id;
  otherSeasonId = (await createTestSeason()).id;
  const deleted = await createTestSeason();
  deletedSeasonId = deleted.id;
  await db.season.update({ where: { id: deletedSeasonId }, data: { deletedAt: new Date() } });

  const superUser = await createTestUser("ex-super", "SUPER");
  const mentor = await createTestUser("ex-mentor", "MENTOR");
  const admin = await createTestUser("ex-admin", "ADMIN");
  const leader = await createTestUser("ex-leader", "LEADER");
  const student = await createTestUser("ex-student", "STUDENT");

  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  const group = await db.group.create({
    data: { seasonId, name: "Group A", leaders: { create: { userId: leader.id } } },
    select: { id: true },
  });
  await db.seasonEnrollment.create({
    data: { seasonId, studentUserId: student.id, groupId: group.id, status: "ACTIVE" },
  });
  await db.session.create({
    data: {
      seasonId,
      title: "Opening",
      startsAt: new Date("2020-03-01T18:00:00.000Z"),
      durationMinutes: 60,
    },
  });

  superToken = await login(app, superUser.email);
  mentorToken = await login(app, mentor.email);
  adminToken = await login(app, admin.email);
  leaderToken = await login(app, leader.email);
  studentToken = await login(app, student.email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("GET /api/v1/seasons/:id/exports/workbook", () => {
  it("streams XLSX bytes with a Content-Disposition to a season admin", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/exports/workbook`)
      .set("authorization", `Bearer ${adminToken}`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => cb(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain(XLSX_MIME);
    expect(res.headers["content-disposition"]).toContain("attachment;");
    expect(res.headers["content-disposition"]).toContain("filename*=UTF-8''");

    // Real bytes, not a JSON envelope: PK is the zip magic every XLSX starts with.
    const body = res.body as Buffer;
    expect(body.subarray(0, 2).toString("ascii")).toBe("PK");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(asLoadable(body));
    expect(workbook.worksheets.map((w) => w.name)).toEqual([
      "Attendance",
      "Grades",
      "Assignments",
      "Key",
    ]);
  });

  it("REFUSES a MENTOR — v1 allowed any mentor any season's workbook (R85, D6 #3)", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/exports/workbook`)
      .set("authorization", `Bearer ${mentorToken}`);
    // In v1 the only thing preventing this is that /mentor/reports does not
    // render the button (R86). The endpoint itself allows it: every active
    // student's name, email, group, per-session attendance, every quiz score
    // and every assignment status.
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
  });

  it("refuses an ADMIN a season they do not administer", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${otherSeasonId}/exports/workbook`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });

  it("refuses LEADER and STUDENT", async () => {
    for (const token of [leaderToken, studentToken]) {
      const res = await request(app)
        .get(`/api/v1/seasons/${seasonId}/exports/workbook`)
        .set("authorization", `Bearer ${token}`);
      expect(res.status).toBe(403);
    }
  });

  it("404s a soft-deleted season even for SUPER (D14, R81)", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${deletedSeasonId}/exports/workbook`)
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });

  it("401s an unauthenticated request in the envelope, never a redirect (R87)", async () => {
    const res = await request(app).get(`/api/v1/seasons/${seasonId}/exports/workbook`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  it("answers every failure with JSON even though success is bytes", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/exports/workbook`)
      .set("authorization", `Bearer ${leaderToken}`);
    expect(res.headers["content-type"]).toContain("application/json");
    // The client must be able to tell a 403 from a file (spec §7).
    expect(res.body.error.code).toBe("forbidden");
  });

  it("400s a non-numeric season id", async () => {
    const res = await request(app)
      .get("/api/v1/seasons/not-a-number/exports/workbook")
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/seasons/:id/exports/manifest", () => {
  it("describes the workbook without building it", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/exports/manifest`)
      .set("authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.mimeType).toBe(XLSX_MIME);
    expect(res.body.data.filename).toMatch(/\.xlsx$/);
    expect(res.body.data.sheets.map((s: { name: string }) => s.name)).toEqual([
      "Attendance",
      "Grades",
      "Assignments",
      "Key",
    ]);
    expect(res.body.data.estimatedBytes).toBeGreaterThan(0);
  });

  it("carries exactly the workbook's gate — a mentor gets neither", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/exports/manifest`)
      .set("authorization", `Bearer ${mentorToken}`);
    // A manifest a caller cannot act on is a size oracle over a season they
    // may not read.
    expect(res.status).toBe(403);
  });
});

describe("GET /api/v1/reports/engagement/export", () => {
  it("streams an engagement workbook to a MENTOR (R45 — kept)", async () => {
    const res = await request(app)
      .get("/api/v1/reports/engagement/export")
      .set("authorization", `Bearer ${mentorToken}`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => cb(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain(XLSX_MIME);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(asLoadable(res.body as Buffer));
    expect(workbook.worksheets.map((w) => w.name)).toEqual(["Engagement", "Key"]);
    const header = workbook.getWorksheet("Engagement")!.getRow(1).values as unknown[];
    expect(header.slice(1)).toEqual([
      "Student",
      "Email",
      "Season",
      "Attendance %",
      "Submission % (assigned to student)",
      "Score",
      "Band",
    ]);
  });

  it("intersects the scope exactly as the summary does", async () => {
    const res = await request(app)
      .get(`/api/v1/reports/engagement/export?seasonId=${otherSeasonId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => cb(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(asLoadable(res.body as Buffer));
    // Empty scope → header only. v1 returned a header-only CSV with HTTP 200
    // for an unknown id too (R46) — the difference is that here it is the
    // intersection's honest answer rather than a query that silently matched
    // nothing.
    expect(workbook.getWorksheet("Engagement")!.rowCount).toBe(1);
  });

  it("rejects ?format=csv with a message naming XLSX (D-17.7)", async () => {
    const res = await request(app)
      .get("/api/v1/reports/engagement/export?format=csv")
      .set("authorization", `Bearer ${superToken}`);
    // A 404 would read as "the export is broken"; v1's CSV endpoint existed and
    // somebody will have bookmarked it.
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
    expect(res.body.error.message).toMatch(/xlsx/i);
  });

  it("refuses LEADER and STUDENT", async () => {
    for (const token of [leaderToken, studentToken]) {
      const res = await request(app)
        .get("/api/v1/reports/engagement/export")
        .set("authorization", `Bearer ${token}`);
      expect(res.status).toBe(403);
    }
  });

  it("names the file after the scope and the day, not an epoch (R42)", async () => {
    const res = await request(app)
      .get(`/api/v1/reports/engagement/export?seasonId=${seasonId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.headers["content-disposition"]).toMatch(
      /filename="engagement-[a-z0-9-]+-\d{4}-\d{2}-\d{2}\.xlsx"/,
    );
  });

  it("logs an audit line carrying no personal data (D15)", async () => {
    const spy = jest.spyOn(console, "info").mockImplementation(() => {});
    await request(app)
      .get(`/api/v1/reports/engagement/export?seasonId=${seasonId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .buffer(true)
      .parse((r, cb) => {
        r.on("data", () => {});
        r.on("end", () => cb(null, Buffer.alloc(0)));
      });

    const lines = spy.mock.calls.map((c) => String(c[0]));
    const audit = lines.find((l) => l.includes("export.completed"));
    expect(audit).toBeDefined();
    const parsed = JSON.parse(audit!);
    expect(parsed).toMatchObject({ event: "export.completed", kind: "engagement" });
    expect(parsed.actorId).toEqual(expect.any(Number));
    // Never a name, never an email, never a filename — the line answers "who
    // exported what, when", not "what was in it".
    expect(audit).not.toContain("@jpc.test");
    spy.mockRestore();
  });
});

describe("shared prefixes keep the not_found envelope (ruling X5)", () => {
  it("answers an unknown /reports path with 404, not 401", async () => {
    // reportsRouter and reportExportsRouter both attach requireAuth per route.
    // A router-level use(requireAuth) on either turns this anonymous request
    // into a 401.
    const res = await request(app).get("/api/v1/reports/space-v2-no-such-route");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });

  it("answers an unknown /seasons path with 404, not 401", async () => {
    // Plan 6 removed seasonsRouter's router-level use(requireAuth) (its
    // Task 1 grep pins that). seasonExportsRouter shares the prefix and
    // attaches requireAuth per route, so an anonymous unknown path still
    // reaches the catch-all.
    const res = await request(app).get("/api/v1/seasons/1/space-v2-no-such-route");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });
});

describe("export rate limit (10 per 15 minutes per user, R88)", () => {
  it("answers the eleventh export with 429 in the envelope, keyed per user", async () => {
    const limited = await createTestUser("ex-limited", "MENTOR");
    const other = await createTestUser("ex-unlimited", "MENTOR");
    const limitedToken = await login(app, limited.email);
    const otherToken = await login(app, other.email);

    const hit = (token: string) =>
      request(app)
        .get("/api/v1/reports/engagement/export")
        .set("authorization", `Bearer ${token}`)
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on("data", (c: Buffer) => chunks.push(c));
          r.on("end", () => cb(null, Buffer.concat(chunks)));
        });

    for (let i = 0; i < 10; i += 1) {
      expect((await hit(limitedToken)).status).toBe(200);
    }
    const eleventh = await request(app)
      .get("/api/v1/reports/engagement/export")
      .set("authorization", `Bearer ${limitedToken}`);
    expect(eleventh.status).toBe(429);
    expect(eleventh.headers["content-type"]).toContain("application/json");
    expect(eleventh.body.error.code).toBe("too_many_requests");

    // A different user is a different bucket.
    expect((await hit(otherToken)).status).toBe(200);
  });
});
