// apps/backend/src/__tests__/integration/notes-write-routes.test.ts
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason } from "./fixtures";
import { seedNotesFixtures } from "./notes-setup";

// Same reason as the other integration suites: the shared Neon staging
// Postgres autosuspends, and the first query after idle has been measured
// around 18s.
jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let studentUserId: number;
let adminUserId: number;
let leadersNoteId: number;
let superToken: string;
let adminToken: string;
let insideLeaderToken: string;
let outsideLeaderToken: string;
let studentToken: string;

beforeAll(async () => {
  ({
    seasonId,
    studentUserId,
    adminUserId,
    leadersNoteId,
    superToken,
    adminToken,
    insideLeaderToken,
    outsideLeaderToken,
    studentToken,
  } = await seedNotesFixtures(app));
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
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

  it("lets an ADMIN write about an enrolled student with no StudentProfile row (D12)", async () => {
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

  // Owner 2026-11-07: the mentor follow-up notification is gone; the flag stays on the note.
  it("records the follow-up flag and notifies nobody", async () => {
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
    expect(res.body.data.note.followUpFlagged).toBe(true);
    expect(await db.notification.count({ where: mine })).toBe(before);
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
  it("answers 501 — Note has no deletedAt column to soft-delete with (spec D4 #2)", async () => {
    const res = await request(app)
      .delete(`/api/v1/notes/${leadersNoteId}`)
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(501);
    expect(res.body.error.code).toBe("delete_unavailable");

    // And nothing was destroyed.
    expect(await db.engagementNote.findUnique({ where: { id: leadersNoteId }, select: { id: true } })).not.toBeNull();
  });
});
