import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

// Same reason as the other integration suites: the shared Neon staging
// Postgres autosuspends, and the first query after idle has been measured
// around 18s.
jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let studentUserId: number;
let adminUserId: number;
let mentorsNoteId: number;
let adminsNoteId: number;
let leadersNoteId: number;
let legacyHtmlNoteId: number;
let superToken: string;
let adminToken: string;
let mentorToken: string;
let insideLeaderToken: string;
let outsideLeaderToken: string;
let studentToken: string;

beforeAll(async () => {
  await cleanupTestData();

  const season = await createTestSeason();
  seasonId = season.id;

  const student = await createTestUser("note-subject", "STUDENT");
  const insideLeader = await createTestUser("note-inside-leader", "LEADER");
  const outsideLeader = await createTestUser("note-outside-leader", "LEADER");
  const admin = await createTestUser("note-admin", "ADMIN");
  const mentor = await createTestUser("note-mentor", "MENTOR");
  const superUser = await createTestUser("note-super", "SUPER");
  studentUserId = student.id;
  adminUserId = admin.id;

  const groupA = await db.group.create({
    data: { seasonId, name: "Group A", leaders: { create: { userId: insideLeader.id } } },
    select: { id: true },
  });
  const groupB = await db.group.create({
    data: { seasonId, name: "Group B", leaders: { create: { userId: outsideLeader.id } } },
    select: { id: true },
  });

  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  // Ruling C9: the enrolment carries the per-season group, and it is what every
  // gate here consults. groupB exists so outsideLeader is a real leader in the
  // same season who simply does not lead THIS student.
  await db.seasonEnrollment.create({
    data: { seasonId, studentUserId: student.id, groupId: groupA.id, status: "ACTIVE" },
  });
  expect(groupB.id).not.toBe(groupA.id);

  // Three notes, one per visibility, each by a different author. Bodies are
  // invented placeholder text — never real pastoral content.
  const mentorsNote = await db.engagementNote.create({
    data: {
      studentUserId: student.id,
      authorUserId: mentor.id,
      seasonId,
      body: "<p>space-v2-test mentors-only observation</p>",
      visibility: "MENTORS",
    },
    select: { id: true },
  });
  mentorsNoteId = mentorsNote.id;

  const adminsNote = await db.engagementNote.create({
    data: {
      studentUserId: student.id,
      authorUserId: admin.id,
      seasonId,
      body: "<p>space-v2-test admins-only observation</p>",
      visibility: "ADMINS",
    },
    select: { id: true },
  });
  adminsNoteId = adminsNote.id;

  const leadersNote = await db.engagementNote.create({
    data: {
      studentUserId: student.id,
      authorUserId: insideLeader.id,
      seasonId,
      body: "<p>space-v2-test leaders-only observation</p>",
      visibility: "LEADERS",
    },
    select: { id: true },
  });
  leadersNoteId = leadersNote.id;

  // A row in v1's exact stored format: TipTap HTML, entities and a script tag.
  // This is what the shared database already contains, and the read path has
  // to cope with it (ruling C11 — sanitise on read for everything stored).
  const legacy = await db.engagementNote.create({
    data: {
      studentUserId: student.id,
      authorUserId: insideLeader.id,
      seasonId,
      body: "<p>Legacy &amp; <b>bold</b></p><p>second line</p><script>alert(1)</script>",
      visibility: "LEADERS",
    },
    select: { id: true },
  });
  legacyHtmlNoteId = legacy.id;

  superToken = await login(app, superUser.email);
  adminToken = await login(app, admin.email);
  mentorToken = await login(app, mentor.email);
  insideLeaderToken = await login(app, insideLeader.email);
  outsideLeaderToken = await login(app, outsideLeader.email);
  studentToken = await login(app, student.email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("GET /api/v1/students/:id/notes — the visibility gate", () => {
  it("gives a LEADER who leads this student only LEADERS notes and their own", async () => {
    const res = await request(app)
      .get(`/api/v1/students/${studentUserId}/notes`)
      .set("authorization", `Bearer ${insideLeaderToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.notes.map((n: { id: number }) => n.id);
    expect(ids).toEqual(expect.arrayContaining([leadersNoteId, legacyHtmlNoteId]));
    // THE test this plan exists for. v1's query returned all four rows and a
    // pure function in the page filtered them; here the filter is the query.
    expect(ids).not.toContain(mentorsNoteId);
    expect(ids).not.toContain(adminsNoteId);
    // And nothing else leaked either — no body of a hidden note in the payload.
    expect(JSON.stringify(res.body)).not.toContain("mentors-only");
    expect(JSON.stringify(res.body)).not.toContain("admins-only");
  });

  it("refuses a LEADER of another group in the same season outright", async () => {
    // canViewStudent fails first: this leader may not read the STUDENT at all,
    // so the visibility rule is never reached. Two gates, in order (R39).
    const res = await request(app)
      .get(`/api/v1/students/${studentUserId}/notes`)
      .set("authorization", `Bearer ${outsideLeaderToken}`);
    expect(res.status).toBe(403);
  });

  it("gives an ADMIN only ADMINS notes — visibility is equality, not a ladder (R36)", async () => {
    const res = await request(app)
      .get(`/api/v1/students/${studentUserId}/notes`)
      .set("authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.notes.map((n: { id: number }) => n.id);
    expect(ids).toContain(adminsNoteId);
    expect(ids).not.toContain(leadersNoteId);
    expect(ids).not.toContain(mentorsNoteId);
  });

  it("gives a MENTOR only MENTORS notes", async () => {
    const res = await request(app)
      .get(`/api/v1/students/${studentUserId}/notes`)
      .set("authorization", `Bearer ${mentorToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.notes.map((n: { id: number }) => n.id);
    expect(ids).toEqual([mentorsNoteId]);
  });

  it("gives SUPER everything (R32)", async () => {
    const res = await request(app)
      .get(`/api/v1/students/${studentUserId}/notes`)
      .set("authorization", `Bearer ${superToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.notes.map((n: { id: number }) => n.id);
    expect(ids).toEqual(
      expect.arrayContaining([mentorsNoteId, adminsNoteId, leadersNoteId, legacyHtmlNoteId]),
    );
  });

  it("REFUSES a student their own notes explicitly — 403, never an empty array (D5 #2)", async () => {
    // An empty array would be indistinguishable from "no notes exist", which is
    // exactly the accident v1 relied on: students saw nothing because no page
    // rendered notes, not because any check refused them (R40).
    const res = await request(app)
      .get(`/api/v1/students/${studentUserId}/notes`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
  });

  it("returns the author's own note regardless of visibility (R33)", async () => {
    // The admin authored the ADMINS note; give the inside leader one too and
    // check the leader gets it back even though ADMINS is not their role's
    // literal.
    const own = await db.engagementNote.create({
      data: {
        studentUserId,
        authorUserId: (await db.engagementNote.findUniqueOrThrow({
          where: { id: leadersNoteId },
          select: { authorUserId: true },
        })).authorUserId,
        seasonId,
        body: "<p>space-v2-test own admins-visibility note</p>",
        visibility: "ADMINS",
      },
      select: { id: true },
    });

    const res = await request(app)
      .get(`/api/v1/students/${studentUserId}/notes`)
      .set("authorization", `Bearer ${insideLeaderToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.notes.map((n: { id: number }) => n.id)).toContain(own.id);
  });

  it("returns plain text, not the HTML v1 stored (ruling C11)", async () => {
    const res = await request(app)
      .get(`/api/v1/students/${studentUserId}/notes`)
      .set("authorization", `Bearer ${superToken}`);

    const legacy = res.body.data.notes.find((n: { id: number }) => n.id === legacyHtmlNoteId);
    expect(legacy.body).toBe("Legacy & bold\nsecond line\nalert(1)");
    expect(legacy.body).not.toContain("<");
  });

  it("pages with a cursor instead of v1's silent 100-row cap (R41)", async () => {
    const first = await request(app)
      .get(`/api/v1/students/${studentUserId}/notes?limit=2`)
      .set("authorization", `Bearer ${superToken}`);
    expect(first.status).toBe(200);
    expect(first.body.data.notes).toHaveLength(2);
    expect(first.body.data.nextCursor).not.toBeNull();

    const second = await request(app)
      .get(`/api/v1/students/${studentUserId}/notes?limit=2&cursor=${first.body.data.nextCursor}`)
      .set("authorization", `Bearer ${superToken}`);
    expect(second.status).toBe(200);
    const firstIds = first.body.data.notes.map((n: { id: number }) => n.id);
    const secondIds = second.body.data.notes.map((n: { id: number }) => n.id);
    expect(secondIds.some((id: number) => firstIds.includes(id))).toBe(false);
  });

  it("404s for a student that does not exist rather than leaking existence by 403", async () => {
    const res = await request(app)
      .get("/api/v1/students/2147483600/notes")
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(404);
  });
});

describe("GET /api/v1/me/notes", () => {
  it("returns only the caller's own notes, with the student attached", async () => {
    const res = await request(app)
      .get("/api/v1/me/notes")
      .set("authorization", `Bearer ${mentorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.notes.map((n: { id: number }) => n.id)).toEqual([mentorsNoteId]);
    expect(res.body.data.notes[0].student).toMatchObject({ id: studentUserId });
  });

  it("works for an ADMIN too — v1 had no authored-notes surface for them (R44)", async () => {
    const res = await request(app)
      .get("/api/v1/me/notes")
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.notes.map((n: { id: number }) => n.id)).toContain(adminsNoteId);
  });

  it("filters to one student with ?studentId", async () => {
    const res = await request(app)
      .get(`/api/v1/me/notes?studentId=${studentUserId}`)
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(
      res.body.data.notes.every((n: { student: { id: number } }) => n.student.id === studentUserId),
    ).toBe(true);
  });

  it("refuses a STUDENT — they can never author a note (R51)", async () => {
    const res = await request(app)
      .get("/api/v1/me/notes")
      .set("authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
  });
});

describe("shared-prefix mounting (ruling X5)", () => {
  it("leaves an unknown anonymous path under /api/v1/me a 404, not a 401", async () => {
    // myNotesRouter shares /api/v1/me with meRouter. A router-wide
    // use(requireAuth) on it would answer this request 401 before the
    // catch-all not_found handler ever saw it.
    const res = await request(app).get("/api/v1/me/no-such-thing");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });
});

describe("POST /api/v1/students/:id/notes", () => {
  it("stores a note authored by the session user, and returns it as plain text", async () => {
    const res = await request(app)
      .post(`/api/v1/students/${studentUserId}/notes`)
      .set("authorization", `Bearer ${insideLeaderToken}`)
      .send({ body: "space-v2-test wrote a note", visibility: "LEADERS" });

    expect(res.status).toBe(201);
    expect(res.body.data.note).toMatchObject({
      body: "space-v2-test wrote a note",
      visibility: "LEADERS",
      followUpFlagged: false,
      edited: false,
      canEdit: true,
    });

    const row = await db.engagementNote.findUniqueOrThrow({
      where: { id: res.body.data.note.id },
      select: { authorUserId: true, seasonId: true, body: true },
    });
    // authorUserId comes from the session, never from input (R9), and the
    // season defaults from the student's enrolment (R4).
    expect(row.authorUserId).toBe(res.body.data.note.authorId);
    expect(row.seasonId).toBe(seasonId);
    expect(row.body).toBe("<p>space-v2-test wrote a note</p>");
  });

  it("neutralises markup on the way in and on the way out (ruling C11)", async () => {
    const created = await request(app)
      .post(`/api/v1/students/${studentUserId}/notes`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ body: "<script>alert(1)</script> space-v2-test", visibility: "ADMINS" });

    expect(created.status).toBe(201);
    const row = await db.engagementNote.findUniqueOrThrow({
      where: { id: created.body.data.note.id },
      select: { body: true },
    });
    // The stored column is what v1 renders raw, so this is the assertion that
    // matters: no live tag ever lands in it.
    expect(row.body).not.toContain("<script");
    expect(row.body).toContain("&lt;script&gt;");
    // And the wire carries text, which React Native renders as text.
    expect(created.body.data.note.body).toBe("<script>alert(1)</script> space-v2-test");
  });

  it("refuses a LEADER who does not lead this student (R49 through SeasonEnrollment)", async () => {
    const res = await request(app)
      .post(`/api/v1/students/${studentUserId}/notes`)
      .set("authorization", `Bearer ${outsideLeaderToken}`)
      .send({ body: "space-v2-test should not land", visibility: "LEADERS" });
    expect(res.status).toBe(403);
  });

  it("refuses a STUDENT writing about themselves (R51)", async () => {
    const res = await request(app)
      .post(`/api/v1/students/${studentUserId}/notes`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ body: "space-v2-test self note", visibility: "LEADERS" });
    expect(res.status).toBe(403);
  });

  it("lets an ADMIN write about an enrolled student even with no activeSeasonId (D12)", async () => {
    // v1's gate read StudentProfile.activeSeasonId, so an admin could OPEN a
    // student they could not write about (R47/R48). This student has an
    // enrolment in the admin's season and no StudentProfile row at all.
    const res = await request(app)
      .post(`/api/v1/students/${studentUserId}/notes`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ body: "space-v2-test admin note", visibility: "ADMINS" });
    expect(res.status).toBe(201);
  });

  it("rejects a seasonId the student is not enrolled in", async () => {
    const other = await createTestSeason();
    const res = await request(app)
      .post(`/api/v1/students/${studentUserId}/notes`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ body: "space-v2-test wrong season", visibility: "ADMINS", seasonId: other.id });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("season_not_enrolled");
  });

  it("notifies season admins on a flagged note WITHOUT quoting it (spec D2)", async () => {
    // Scoped to this suite's season admin: counting MENTOR_FOLLOWUP rows
    // database-wide would race v1, which writes the same table on staging.
    const mine = { type: "MENTOR_FOLLOWUP" as const, userId: adminUserId };
    const before = await db.notification.count({ where: mine });

    const res = await request(app)
      .post(`/api/v1/students/${studentUserId}/notes`)
      .set("authorization", `Bearer ${superToken}`)
      .send({
        body: "space-v2-test confidential sentence that must not travel",
        visibility: "MENTORS",
        followUpFlagged: true,
      });
    expect(res.status).toBe(201);

    const notifications = await db.notification.findMany({
      where: mine,
      orderBy: { id: "desc" },
      take: 1,
      select: { body: true, title: true, link: true },
    });
    expect(await db.notification.count({ where: mine })).toBe(before + 1);
    // v1 put body.slice(0, 140) here and mailed it unescaped to every season
    // admin — including admins who cannot open the note in the app at all.
    expect(notifications[0]?.body).not.toContain("confidential");
    expect(notifications[0]?.title).toContain("Follow-up flagged");
    // v1's exact link for this type (jpc-space note-actions.ts:84; ruling X1).
    expect(notifications[0]?.link).toBe(`/admin/students/${studentUserId}`);
  });
});

describe("PATCH /api/v1/notes/:id", () => {
  it("lets the author correct the body and marks the note edited", async () => {
    const created = await request(app)
      .post(`/api/v1/students/${studentUserId}/notes`)
      .set("authorization", `Bearer ${insideLeaderToken}`)
      .send({ body: "space-v2-test first wording", visibility: "LEADERS" });

    const res = await request(app)
      .patch(`/api/v1/notes/${created.body.data.note.id}`)
      .set("authorization", `Bearer ${insideLeaderToken}`)
      .send({ body: "space-v2-test corrected wording" });

    expect(res.status).toBe(200);
    expect(res.body.data.note.body).toBe("space-v2-test corrected wording");
  });

  it("refuses everyone but the author — SUPER included (R23)", async () => {
    const res = await request(app)
      .patch(`/api/v1/notes/${leadersNoteId}`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ body: "space-v2-test rewritten by someone else" });
    expect(res.status).toBe(403);
  });

  it("validates the body v1's update did not validate at all (R25)", async () => {
    const created = await request(app)
      .post(`/api/v1/students/${studentUserId}/notes`)
      .set("authorization", `Bearer ${insideLeaderToken}`)
      .send({ body: "space-v2-test to be emptied", visibility: "LEADERS" });

    const res = await request(app)
      .patch(`/api/v1/notes/${created.body.data.note.id}`)
      .set("authorization", `Bearer ${insideLeaderToken}`)
      .send({ body: "" });
    expect(res.status).toBe(400);
  });

  it("cannot change visibility or the follow-up flag (R24)", async () => {
    const created = await request(app)
      .post(`/api/v1/students/${studentUserId}/notes`)
      .set("authorization", `Bearer ${insideLeaderToken}`)
      .send({ body: "space-v2-test immutable fields", visibility: "LEADERS" });

    await request(app)
      .patch(`/api/v1/notes/${created.body.data.note.id}`)
      .set("authorization", `Bearer ${insideLeaderToken}`)
      .send({ body: "space-v2-test still leaders", visibility: "ADMINS", followUpFlagged: true });

    const row = await db.engagementNote.findUniqueOrThrow({
      where: { id: created.body.data.note.id },
      select: { visibility: true, followUpFlagged: true },
    });
    expect(row).toMatchObject({ visibility: "LEADERS", followUpFlagged: false });
  });
});

describe("DELETE /api/v1/notes/:id", () => {
  it("answers 501 — delete needs a deletedAt column, which C1 forbids (spec D4 #2)", async () => {
    const res = await request(app)
      .delete(`/api/v1/notes/${leadersNoteId}`)
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(501);
    expect(res.body.error.code).toBe("delete_unavailable");

    // And nothing was destroyed.
    expect(
      await db.engagementNote.findUnique({ where: { id: leadersNoteId }, select: { id: true } }),
    ).not.toBeNull();
  });
});
