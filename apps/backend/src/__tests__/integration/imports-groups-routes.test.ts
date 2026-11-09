// apps/backend/src/__tests__/integration/imports-groups-routes.test.ts
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { TEST_PREFIX, createTestSeason, createTestUser, login } from "./fixtures";
import { seedImportFixtures, sheet, teardownImportFixtures } from "./imports-setup";

jest.setTimeout(60000);

const app = createApp();

// Every paste goes through `sheet()` — see THE PREFIX GUARD in imports-setup.ts.

let seasonId: number;
let otherSeasonId: number;
let superToken: string;
let adminToken: string;
let studentToken: string;

beforeAll(async () => {
  ({ seasonId, otherSeasonId, superToken, adminToken, studentToken } = await seedImportFixtures(app));
});

afterAll(async () => {
  await teardownImportFixtures();
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
    await db.studentProfile.create({ data: { userId: enrolledId } });
    await db.seasonEnrollment.create({ data: { studentUserId: enrolledId, seasonId, status: "ACTIVE" } });

    const inGroupA = await createTestUser("grp-already", "STUDENT");
    inGroupAId = inGroupA.id;
    inGroupAEmail = inGroupA.email;
    await db.studentProfile.create({ data: { userId: inGroupAId } });
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

  it("resolves the roster through SeasonEnrollment (ruling C9)", async () => {
    // v1's roster is `StudentProfile.activeSeasonId = seasonId`
    // (groups-query.ts:143-148), so a student holding an ACTIVE enrolment in
    // this season whose pointer happens to name another one is INVISIBLE to
    // the importer (spec R61) — and worse, the write gates on the same
    // pointer and silently skips them (R76/D5).
    const pointerElsewhere = await createTestUser("grp-pointer", "STUDENT");
    await db.studentProfile.create({ data: { userId: pointerElsewhere.id } });
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

  it("refuses the file when two groups in the season share a name (D-16.19.1 / spec D17)", async () => {
    const clash = await createTestSeason();
    await db.seasonAdmin.create({
      data: {
        seasonId: clash.id,
        userId: (
          await db.user.findFirstOrThrow({
            where: { email: { startsWith: `${TEST_PREFIX}admin-` } },
            select: { id: true },
          })
        ).id,
      },
    });
    await db.group.create({ data: { seasonId: clash.id, name: "Group A" } });
    await db.group.create({ data: { seasonId: clash.id, name: "group a" } });

    const fresh = await login(
      app,
      (
        await db.user.findFirstOrThrow({
          where: { email: { startsWith: `${TEST_PREFIX}admin-` } },
          select: { email: true },
        })
      ).email,
    );
    const res = await request(app)
      .post(`/api/v1/seasons/${clash.id}/imports/groups/preview`)
      .set("authorization", `Bearer ${fresh}`)
      .send({ text: sheet("email\tgroup", `${enrolledEmail}\tGroup A`) });

    // v1 builds a Map by iteration and lets the LAST duplicate silently win
    // every row (spec R65).
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/more than one group named/i);
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
      const foreign = await db.group.create({
        data: { seasonId: otherSeasonId, name: "Foreign Group" },
        select: { id: true },
      });

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
